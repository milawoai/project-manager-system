/**
 * AI Agent 相关共享类型
 */

/** 支持的 Agent 类型 */
export type AgentType = 'claude-code' | 'opencode' | 'gemini'

/** Agent 任务状态 */
export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed'

/** 执行任务的入参 */
export interface ExecuteTaskParams {
  /** 工程本地路径（Agent 的工作目录） */
  projectPath: string
  /** 任务描述文本 */
  taskContent: string
  /** 使用的 Agent 类型 */
  agentType: AgentType
}

/** 停止任务的入参 */
export interface StopTaskParams {
  taskId: string
}

/** 获取任务状态的入参 */
export interface GetTaskStatusParams {
  taskId: string
}

/** 任务状态结果 */
export interface TaskStatusResult {
  taskId: string
  status: AgentStatus
}

/** aigent:output 推送事件的 payload */
export interface AgentOutputPayload {
  taskId: string
  /** 输出内容 */
  content: string
  /** 输出流类型 */
  stream: 'stdout' | 'stderr'
}

/** aigent:done 推送事件的 payload */
export interface AgentDonePayload {
  taskId: string
  exitCode: number | null
}

/** aigent:error 推送事件的 payload */
export interface AgentErrorPayload {
  taskId: string
  message: string
}
