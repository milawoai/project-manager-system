import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Or, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Machine, MachineProject, MachineStatus, Task, TaskStatus } from '../entities';

interface AuthenticatedSocket extends Socket {
  machineId?: number;
  machine?: Machine;
  lastHeartbeat?: Date;
}

// WebSocket 消息类型
export enum WsMessageType {
  REGISTER = 'REGISTER',
  REGISTER_ACK = 'REGISTER_ACK',
  READY = 'READY',                   // 客户端业务层就绪，触发离线任务补推
  HEARTBEAT = 'HEARTBEAT',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  TASK_CAPTURED = 'TASK_CAPTURED',   // 客户端收到任务后回包确认
  TASK_RESULT = 'TASK_RESULT',
  MACHINE_STATUS = 'MACHINE_STATUS',
  ERROR = 'ERROR',
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/ws',
})
export class TasksGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedMachines: Map<number, AuthenticatedSocket> = new Map();
  private heartbeatTimers: Map<number, NodeJS.Timeout> = new Map();
  private readonly HEARTBEAT_TIMEOUT = 30000; // 30秒超时

  constructor(
    @InjectRepository(Machine)
    private machineRepository: Repository<Machine>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(MachineProject)
    private machineProjectRepository: Repository<MachineProject>,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    console.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Client disconnected: ${client.id}`);
    if (client.machineId) {
      this.connectedMachines.delete(client.machineId);
      this.clearHeartbeatTimer(client.machineId);

      // 更新机器状态为离线
      await this.machineRepository.update(client.machineId, {
        status: MachineStatus.OFFLINE,
      });

      console.log(`Machine offline: ${client.machineId}`);
    }
  }

  @SubscribeMessage(WsMessageType.REGISTER)
  async handleRegister(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { apiKey: string },
  ) {
    const { apiKey } = payload;

    const machines = await this.machineRepository.find();

    let matchedMachine: Machine | null = null;
    for (const machine of machines) {
      const isValid = await bcrypt.compare(apiKey, machine.apiKey);
      if (isValid) {
        matchedMachine = machine;
        break;
      }
    }

    if (!matchedMachine) {
      client.emit(WsMessageType.REGISTER_ACK, {
        status: 'rejected',
        message: 'Invalid API Key',
      });
      return;
    }

    // 检查是否已有相同机器在线，踢掉旧连接
    if (this.connectedMachines.has(matchedMachine.id)) {
      const oldClient = this.connectedMachines.get(matchedMachine.id);
      if (oldClient) {
        oldClient.emit(WsMessageType.ERROR, {
          message: 'Machine already connected elsewhere',
        });
        oldClient.disconnect();
      }
    }

    // 绑定机器 ID 到 socket
    client.machineId = matchedMachine.id;
    client.machine = matchedMachine;
    client.lastHeartbeat = new Date();
    this.connectedMachines.set(matchedMachine.id, client);

    // 更新机器状态为在线
    await this.machineRepository.update(matchedMachine.id, {
      status: MachineStatus.ONLINE,
      lastHeartbeat: new Date(),
    });

    // 设置心跳超时检测
    this.startHeartbeatTimer(matchedMachine.id, client);

    client.emit(WsMessageType.REGISTER_ACK, {
      machineId: matchedMachine.id,
      status: 'accepted',
      message: 'Registered successfully',
    });

    console.log(`Machine registered: ${matchedMachine.name} (${matchedMachine.id})`);
    // 补推由客户端发送 READY 信号后触发，此处不主动推送
  }

  /**
   * 客户端业务层就绪后主动发送 READY，服务端开始补推离线任务
   */
  @SubscribeMessage(WsMessageType.READY)
  async handleReady(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.machineId) {
      client.emit(WsMessageType.ERROR, { message: 'Not authenticated' });
      return;
    }
    console.log(`[Gateway] Machine #${client.machineId} is ready, pushing pending tasks...`);
    await this.pushPendingTasksToMachine(client.machineId, client);
  }

  @SubscribeMessage(WsMessageType.HEARTBEAT)
  async handleHeartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { status?: string; currentTaskId?: string },
  ) {
    if (!client.machineId) {
      return;
    }

    client.lastHeartbeat = new Date();

    const machineStatus = payload.status === 'idle'
      ? MachineStatus.ONLINE
      : MachineStatus.BUSY;

    await this.machineRepository.update(client.machineId, {
      lastHeartbeat: new Date(),
      status: machineStatus,
    });

    // 重置心跳定时器
    this.startHeartbeatTimer(client.machineId, client);
  }

  @SubscribeMessage(WsMessageType.TASK_RESULT)
  async handleTaskResult(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      taskId: number;
      status: TaskStatus;
      result?: string;
      logs?: string;
    },
  ) {
    if (!client.machineId) {
      client.emit(WsMessageType.ERROR, {
        message: 'Not authenticated',
      });
      return;
    }

    const { taskId, status, result, logs } = payload;

    try {
      const task = await this.taskRepository.findOne({
        where: { id: taskId },
      });

      if (!task) {
        client.emit(WsMessageType.ERROR, {
          message: `Task ${taskId} not found`,
        });
        return;
      }

      // 验证任务是否分配给此机器
      if (task.assignedMachineId !== client.machineId) {
        client.emit(WsMessageType.ERROR, {
          message: 'Task not assigned to this machine',
        });
        return;
      }

      // 更新任务状态
      task.status = status;
      if (result) task.result = result;
      if (logs) task.logs = logs;

      await this.taskRepository.save(task);

      // 更新机器状态为空闲
      await this.machineRepository.update(client.machineId, {
        status: MachineStatus.ONLINE,
      });

      console.log(`Task ${taskId} updated to ${status}`);

      client.emit('TASK_RESULT_ACK', {
        taskId,
        status: 'acknowledged',
      });
    } catch (error) {
      console.error('Error handling task result:', error);
      client.emit(WsMessageType.ERROR, {
        message: 'Failed to update task result',
      });
    }
  }

  /**
   * 客户端收到任务后发送 TASK_CAPTURED 回包
   * 服务端标记 isCaptured = 1，并将 assignedMachineId 回写（针对无指定机器的任务）
   */
  @SubscribeMessage(WsMessageType.TASK_CAPTURED)
  async handleTaskCaptured(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { taskId: number },
  ) {
    if (!client.machineId) return;

    const { taskId } = payload;

    await this.taskRepository.update(taskId, {
      isCaptured: 1,
      assignedMachineId: client.machineId,
    });

    console.log(`[Gateway] Task #${taskId} captured by machine #${client.machineId}`);
  }

  // ==================== 公共方法 ====================

  /** 发送单个任务到指定机器（成功时更新状态为 RUNNING） */
  async sendTaskToMachine(machineId: number, task: any): Promise<boolean> {
    const client = this.connectedMachines.get(machineId);
    if (client) {
      client.emit(WsMessageType.TASK_ASSIGNED, task);

      await this.taskRepository.update(task.taskId, {
        status: TaskStatus.RUNNING,
      });

      await this.machineRepository.update(machineId, {
        status: MachineStatus.BUSY,
      });

      return true;
    }
    return false;
  }

  // 广播消息到所有客户端
  broadcast(messageType: string, payload: any) {
    this.server.emit(messageType, payload);
  }

  // 获取所有在线机器 ID
  getOnlineMachines(): number[] {
    return Array.from(this.connectedMachines.keys());
  }

  // 获取在线机器数量
  getOnlineMachineCount(): number {
    return this.connectedMachines.size;
  }

  // 检查机器是否在线
  isMachineOnline(machineId: number): boolean {
    return this.connectedMachines.has(machineId);
  }

  // ==================== 私有方法 ====================

  /**
   * 注册成功后，补推该机器所有未捕捉的待处理任务：
   *   ① 任务 taskItems 中指定了该机器
   *   ② 任务未指定机器（assignedMachineId IS NULL），且该机器绑定了任务对应的工程
   */
  private async pushPendingTasksToMachine(
    machineId: number,
    client: AuthenticatedSocket,
  ): Promise<void> {
    // 查出该机器绑定的所有工程 ID
    const machineProjects = await this.machineProjectRepository.find({
      where: { machineId, isDelete: 0 },
      select: ['projectId'],
    });
    const boundProjectIds = machineProjects.map((mp) => mp.projectId);

    // 查询未捕捉、未完成的任务
    const pendingStatuses = [TaskStatus.PENDING, TaskStatus.DISTRIBUTED];

    const tasks = await this.taskRepository.find({
      where: [
        // ① taskItems 中指定了该机器（assignedMachineId 字段冗余存了第一个）
        //   用 JSON 列匹配较复杂，直接查 assignedMachineId 覆盖大多数场景
        {
          assignedMachineId: machineId,
          isCaptured: 0,
          status: In(pendingStatuses),
          isDelete: 0,
        },
        // ② 未指定机器 + 机器绑定了对应工程（若有绑定工程）
        ...(boundProjectIds.length > 0
          ? [{
              assignedMachineId: IsNull() as any,
              isCaptured: 0,
              status: In(pendingStatuses),
              isDelete: 0,
            }]
          : []),
      ],
    });

    // 对于 ② 类任务，需要过滤出工程交集
    const tasksToSend = tasks.filter((task) => {
      // ① 类：直接指定了当前机器
      if (task.assignedMachineId === machineId) return true;
      // ② 类：未指定机器，且任务的 projectIds 与机器绑定工程有交集
      if (!task.assignedMachineId && boundProjectIds.length > 0) {
        const taskProjectIds = task.projectIds ?? [];
        return taskProjectIds.some((pid) => boundProjectIds.includes(pid));
      }
      return false;
    });

    if (tasksToSend.length === 0) {
      console.log(`[Gateway] Machine #${machineId} 无待补推任务`);
      return;
    }

    console.log(`[Gateway] Machine #${machineId} 补推 ${tasksToSend.length} 条离线任务`);

    for (const task of tasksToSend) {
      // 取第一个工程 ID（简化：补推时按首个工程下发）
      const projectId = (task.projectIds ?? [])[0] ?? null;

      client.emit(WsMessageType.TASK_ASSIGNED, {
        taskId: task.id,
        content: task.content,
        projectId,
        projectName: null, // 补推场景不再额外查工程名，客户端按 projectId 自行匹配
        gitUrl: null,
      });

      console.log(`[Gateway] 补推任务 #${task.id} → Machine #${machineId}`);
    }
  }

  /** 启动心跳超时检测 */
  private startHeartbeatTimer(machineId: number, client: AuthenticatedSocket) {
    this.clearHeartbeatTimer(machineId);

    const timer = setTimeout(async () => {
      const connectedClient = this.connectedMachines.get(machineId);
      if (connectedClient && connectedClient.lastHeartbeat) {
        const timeSinceLastHeartbeat = Date.now() - connectedClient.lastHeartbeat.getTime();

        if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT) {
          console.log(`Machine ${machineId} heartbeat timeout`);

          connectedClient.emit(WsMessageType.ERROR, {
            message: 'Heartbeat timeout',
          });
          connectedClient.disconnect();

          await this.machineRepository.update(machineId, {
            status: MachineStatus.OFFLINE,
          });

          this.connectedMachines.delete(machineId);
          this.clearHeartbeatTimer(machineId);
        }
      }
    }, this.HEARTBEAT_TIMEOUT + 5000);

    this.heartbeatTimers.set(machineId, timer);
  }

  private clearHeartbeatTimer(machineId: number) {
    const timer = this.heartbeatTimers.get(machineId);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatTimers.delete(machineId);
    }
  }
}
