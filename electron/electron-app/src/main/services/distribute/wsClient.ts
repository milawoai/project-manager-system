/**
 * WebSocket 客户端 - 与分布式任务服务端通信
 * 使用 socket.io-client 匹配服务端的 @nestjs/platform-socket.io
 */
import { io, Socket } from 'socket.io-client'
import { EventEmitter } from 'events'
import type {
  WsConnectionStatus,
  WsRegisterAckPayload,
  WsTaskAssignedPayload,
  WsHeartbeatPayload,
  WsErrorPayload
} from '@shared/types/distribute'
import { WsMessageType, WsConnectionStatus as ConnStatus } from '@shared/types/distribute'

export interface WsClientEvents {
  'connection-change': (status: WsConnectionStatus) => void
  'task-received': (payload: WsTaskAssignedPayload) => void
  'register-ack': (payload: WsRegisterAckPayload) => void
  'error': (payload: WsErrorPayload) => void
}

export class WsClient extends EventEmitter {
  private static instance: WsClient | null = null

  private socket: Socket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private status: WsConnectionStatus = ConnStatus.DISCONNECTED
  private serverUrl: string = ''
  private apiKey: string = ''
  private machineId: number = 0
  private machineName: string = ''
  private currentTaskId: number | null = null

  /** 心跳间隔 15 秒 */
  private readonly HEARTBEAT_INTERVAL = 15000
  /** 重连最大延迟 30 秒 */
  private readonly MAX_RECONNECT_DELAY = 30000

  private constructor() {
    super()
  }

  static getInstance(): WsClient {
    if (!WsClient.instance) {
      WsClient.instance = new WsClient()
    }
    return WsClient.instance
  }

  /** 连接到服务端 */
  connect(serverUrl: string, apiKey: string): void {
    // 如果已连接到同一地址，跳过
    if (this.socket?.connected && this.serverUrl === serverUrl) {
      return
    }

    // 断开旧连接
    this.disconnect()

    this.serverUrl = serverUrl
    this.apiKey = apiKey
    this.setStatus(ConnStatus.CONNECTING)

    // 连接到服务端的 /ws namespace
    const wsUrl = serverUrl.replace(/\/$/, '')
    this.socket = io(`${wsUrl}/ws`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: this.MAX_RECONNECT_DELAY,
      timeout: 10000
    })

    this.setupListeners()
  }

  /** 断开连接 */
  disconnect(): void {
    this.stopHeartbeat()

    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }

    this.machineId = 0
    this.machineName = ''
    this.currentTaskId = null
    this.setStatus(ConnStatus.DISCONNECTED)
  }

  /** 获取连接状态信息 */
  getStatus() {
    return {
      status: this.status,
      serverUrl: this.serverUrl,
      machineId: this.machineId,
      machineName: this.machineName,
      lastHeartbeat: new Date().toISOString()
    }
  }

  /**
   * 业务层就绪后调用，通知服务端开始补推离线任务。
   * 必须在 REGISTER_ACK 成功、业务初始化完成后再调用。
   */
  sendReady(): void {
    if (!this.socket?.connected) {
      console.warn('[WsClient] sendReady: socket 未连接，忽略')
      return
    }
    console.log('[WsClient] 发送 READY 信号')
    this.socket.emit(WsMessageType.READY)
  }

  /** 发送任务结果 */
  sendTaskResult(taskId: number, status: 'completed' | 'failed', result?: string, logs?: string): void {
    if (!this.socket?.connected) {
      throw new Error('WebSocket 未连接')
    }

    this.socket.emit(WsMessageType.TASK_RESULT, {
      taskId,
      status,
      result,
      logs
    })

    // 任务完成后清除当前任务
    if (this.currentTaskId === taskId) {
      this.currentTaskId = null
    }
  }

  /** 是否已连接 */
  get isConnected(): boolean {
    return this.status === ConnStatus.CONNECTED
  }

  // ==================== 私有方法 ====================

  private setupListeners(): void {
    if (!this.socket) return

    // 连接成功
    this.socket.on('connect', () => {
      console.log('[WsClient] 已连接到服务端')
      // 连接后立即发送注册消息
      this.register()
    })

    // 连接断开
    this.socket.on('disconnect', (reason) => {
      console.log(`[WsClient] 连接断开: ${reason}`)
      this.stopHeartbeat()
      this.setStatus(ConnStatus.DISCONNECTED)
    })

    // 重连中
    this.socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`[WsClient] 第 ${attempt} 次重连尝试`)
      this.setStatus(ConnStatus.RECONNECTING)
    })

    // 重连成功
    this.socket.io.on('reconnect', () => {
      console.log('[WsClient] 重连成功')
      this.register()
    })

    // 连接错误
    this.socket.on('connect_error', (error) => {
      console.error('[WsClient] 连接错误:', error.message)
      this.emit('error', { message: `连接错误: ${error.message}` })
    })

    // 注册确认
    this.socket.on(WsMessageType.REGISTER_ACK, (payload: WsRegisterAckPayload) => {
      if (payload.status === 'accepted') {
        console.log(`[WsClient] 注册成功, machineId: ${payload.machineId}`)
        this.machineId = payload.machineId
        this.setStatus(ConnStatus.CONNECTED)
        this.startHeartbeat()

        // 延迟 1s 后发送 READY，等待业务层完成初始化后再触发离线任务补推
        setTimeout(() => this.sendReady(), 1000)
      } else {
        console.error(`[WsClient] 注册被拒绝: ${payload.message}`)
        this.emit('error', { message: `注册被拒绝: ${payload.message}` })
        this.disconnect()
      }
      this.emit('register-ack', payload)
    })

    // 收到任务 — 立即发送 TASK_CAPTURED 回包确认，再向上层 emit
    this.socket.on(WsMessageType.TASK_ASSIGNED, (payload: WsTaskAssignedPayload) => {
      console.log(`[WsClient] 收到任务: ${payload.taskId}`)
      this.currentTaskId = payload.taskId

      // 告知服务端已捕捉，服务端据此标记 isCaptured=1
      this.socket!.emit(WsMessageType.TASK_CAPTURED, { taskId: payload.taskId })

      this.emit('task-received', payload)
    })

    // 错误消息
    this.socket.on(WsMessageType.ERROR, (payload: WsErrorPayload) => {
      console.error(`[WsClient] 服务端错误: ${payload.message}`)
      this.emit('error', payload)
    })

    // 任务结果确认
    this.socket.on('TASK_RESULT_ACK', (payload: { taskId: string; status: string }) => {
      console.log(`[WsClient] 任务结果已确认: ${payload.taskId}`)
    })
  }

  /** 发送注册消息 */
  private register(): void {
    if (!this.socket?.connected || !this.apiKey) return

    this.socket.emit(WsMessageType.REGISTER, {
      apiKey: this.apiKey
    })
  }

  /** 启动心跳 */
  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.heartbeatTimer = setInterval(() => {
      if (!this.socket?.connected) return

      const payload: WsHeartbeatPayload = {
        status: this.currentTaskId ? 'busy' : 'idle',
        currentTaskId: this.currentTaskId
      }

      this.socket.emit(WsMessageType.HEARTBEAT, payload)
    }, this.HEARTBEAT_INTERVAL)
  }

  /** 停止心跳 */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** 更新并广播状态 */
  private setStatus(status: WsConnectionStatus): void {
    if (this.status !== status) {
      this.status = status
      this.emit('connection-change', status)
    }
  }
}
