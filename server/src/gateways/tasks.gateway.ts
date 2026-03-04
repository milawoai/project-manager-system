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
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Machine, MachineStatus, Task, TaskStatus } from '../entities';

interface AuthenticatedSocket extends Socket {
  machineId?: number;
  machine?: Machine;
  lastHeartbeat?: Date;
}

// WebSocket 消息类型
export enum WsMessageType {
  REGISTER = 'REGISTER',
  REGISTER_ACK = 'REGISTER_ACK',
  HEARTBEAT = 'HEARTBEAT',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
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

    // 查找机器（通过未哈希的 apiKey 字段匹配，这里简化处理）
    // 实际生产环境应该用单独的 API Key 表
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

    // 检查是否已有相同机器在线
    if (this.connectedMachines.has(matchedMachine.id)) {
      // 踢掉之前的连接
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

    const status = payload.status === 'idle'
      ? MachineStatus.ONLINE
      : MachineStatus.BUSY;

    await this.machineRepository.update(client.machineId, {
      lastHeartbeat: new Date(),
      status,
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

      // 确认结果
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

  // 发送任务到指定机器
  async sendTaskToMachine(machineId: number, task: any): Promise<boolean> {
    const client = this.connectedMachines.get(machineId);
    if (client) {
      client.emit(WsMessageType.TASK_ASSIGNED, task);

      // 更新任务状态为 running
      await this.taskRepository.update(task.taskId, {
        status: TaskStatus.RUNNING,
      });

      // 更新机器状态为忙碌
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

  // 私有方法：启动心跳超时检测
  private startHeartbeatTimer(machineId: number, client: AuthenticatedSocket) {
    // 清除之前的定时器
    this.clearHeartbeatTimer(machineId);

    const timer = setTimeout(async () => {
      const connectedClient = this.connectedMachines.get(machineId);
      if (connectedClient && connectedClient.lastHeartbeat) {
        const timeSinceLastHeartbeat = Date.now() - connectedClient.lastHeartbeat.getTime();

        if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT) {
          // 心跳超时，标记为离线
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
    }, this.HEARTBEAT_TIMEOUT + 5000); // 多给5秒缓冲

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
