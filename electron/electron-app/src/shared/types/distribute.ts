/**
 * 分布式任务分发系统 - 共享类型定义
 * 与服务端实体保持一致
 */

// ==================== 枚举 ====================

/** 机器状态 */
export enum DistMachineStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy'
}

/** 任务状态 */
export enum DistTaskStatus {
  PENDING = 'pending',
  DISTRIBUTED = 'distributed',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/** WebSocket 消息类型 */
export enum WsMessageType {
  REGISTER = 'REGISTER',
  REGISTER_ACK = 'REGISTER_ACK',
  READY = 'READY',                   // 客户端业务层就绪，触发离线任务补推
  HEARTBEAT = 'HEARTBEAT',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  TASK_CAPTURED = 'TASK_CAPTURED',   // 客户端收到任务后回包确认
  TASK_RESULT = 'TASK_RESULT',
  MACHINE_STATUS = 'MACHINE_STATUS',
  ERROR = 'ERROR'
}

/** WebSocket 连接状态 */
export enum WsConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  RECONNECTING = 'reconnecting'
}

// ==================== 服务端实体类型 ====================

/** 服务端工程 */
export interface DistProject {
  id: number
  name: string
  gitUrl: string
  description?: string
  /** 平台 code，对应 PLATFORM_OPTIONS */
  platform?: number
  /** 标签，逗号分隔字符串 */
  tags?: string
  createdAt: string
  updatedAt: string
}

/** 服务端工作机器 */
export interface DistMachine {
  id: number
  name: string
  platform: string
  hasOpenClaw: boolean
  apiKey?: string
  status: DistMachineStatus
  capabilities?: string[]
  lastHeartbeat?: string
  createdAt: string
  updatedAt: string
}

/** 机器-工程关联 */
export interface DistMachineProject {
  id: number
  machineId: number
  projectId: number
  localPath?: string
  branch?: string
  createdAt: string
  machine?: DistMachine
  project?: DistProject
}

/** 分布式任务 */
export interface DistTask {
  id: number
  content: string
  projectIds?: number[]
  priority: number
  status: DistTaskStatus
  assignedMachineId?: number
  assignedMachine?: DistMachine
  result?: string
  logs?: string
  createdAt: string
  updatedAt: string
}

// ==================== WebSocket 消息载荷 ====================

/** 注册消息载荷 */
export interface WsRegisterPayload {
  apiKey: string
}

/** 注册确认载荷 */
export interface WsRegisterAckPayload {
  machineId: number
  status: 'accepted' | 'rejected'
  message?: string
}

/** 心跳消息载荷 */
export interface WsHeartbeatPayload {
  status: 'idle' | 'busy'
  currentTaskId?: number | null
}

/** 任务分配载荷 */
export interface WsTaskAssignedPayload {
  taskId: number
  content: string
  projectId?: number
  projectName?: string
  gitUrl?: string
}

/** 任务结果载荷 */
export interface WsTaskResultPayload {
  taskId: number
  status: 'completed' | 'failed'
  result?: string
  logs?: string
}

/** 错误消息载荷 */
export interface WsErrorPayload {
  message: string
  code?: string
}

/** 通用 WebSocket 消息 */
export interface WsMessage<T = unknown> {
  type: WsMessageType
  payload: T
}

// ==================== 请求/响应参数 ====================

/** 连接服务端参数（apiKey 从 store 自动读取，无需外部传入） */
export interface ConnectServerParams {
  serverUrl: string
}

/** 本地已保存的连接配置 */
export interface SavedDistConfig {
  serverUrl: string
  apiKey: string
  machineId: string
}

/** 注册机器参数 */
export interface RegisterMachineParams {
  name: string
  platform: string
  hasOpenClaw?: boolean
  capabilities?: string[]
}

/** 注册机器响应（包含生成的 apiKey） */
export interface RegisterMachineResponse {
  machine: DistMachine
  apiKey: string
}

/** 分发任务参数 */
export interface DistributeTaskParams {
  content: string
  projectIds?: number[]
  priority?: number
}

/** 更新任务状态参数 */
export interface UpdateDistTaskStatusParams {
  status: DistTaskStatus
  result?: string
  logs?: string
  machineId: number
}

/** 绑定工程参数 */
export interface BindProjectParams {
  projectId: number
  localPath?: string
  branch?: string
}

/** 连接状态信息 */
export interface ConnectionStatusInfo {
  status: WsConnectionStatus
  serverUrl?: string
  machineId?: number
  machineName?: string
  lastHeartbeat?: string
}

/** 任务列表过滤参数 */
export interface DistTaskFilter {
  status?: DistTaskStatus
  assignedMachineId?: number
}

/**
 * 本地工程（SQLite 记录映射）
 * - remoteId 有值：与服务端已关联
 * - syncedAt 有值：从服务端同步过来的
 * - uploadedAt 有值：本地工程已上报到服务端
 * - remoteId / syncedAt / uploadedAt 均为空：纯本地工程
 */
export interface LocalDistProject {
  /** SQLite 自增主键 */
  id: number
  /** 服务端自增主键，纯本地工程为 undefined */
  remoteId?: number
  name: string
  gitUrl: string
  description?: string
  platform: number
  tags: string
  localPath?: string
  branch: string
  syncedAt?: string
  uploadedAt?: string
  createdAt: string
}

/** 添加纯本地工程的参数 */
export interface AddLocalProjectParams {
  name: string
  gitUrl?: string
  description?: string
  platform?: number
  tags?: string
  localPath?: string
  branch?: string
}
