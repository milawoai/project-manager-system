/**
 * AI Agent 相关共享类型
 */

/** 支持的 Agent 类型 */
export type AgentType = 'claude-code' | 'opencode' | 'codex' | 'cursor' | 'gemini'

/** Agent 任务状态 */
export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed'

// ==================== 会话相关类型 ====================

/** 会话消息角色 */
export type SessionMessageRole = 'user' | 'assistant'

/** 会话消息 */
export interface SessionMessage {
  role: SessionMessageRole
  content: string
  timestamp: number
}

/** 会话信息 */
export interface AgentSession {
  sessionId: string
  projectPath: string
  agentType: AgentType
  createdAt: number
  messages: SessionMessage[]
  /** 当前是否正在执行任务 */
  running: boolean
  /** 当前执行的 taskId（如果有） */
  currentTaskId: string | null
}

/** 创建会话的入参 */
export interface CreateSessionParams {
  projectPath: string
  agentType: AgentType
}

/** 创建会话的结果 */
export interface CreateSessionResult {
  sessionId: string
}

/** 追加消息的入参 */
export interface AppendMessageParams {
  sessionId: string
  role: SessionMessageRole
  content: string
}

/** 获取会话历史的入参 */
export interface GetSessionHistoryParams {
  sessionId: string
}

/** 获取会话历史的结果 */
export interface GetSessionHistoryResult {
  sessionId: string
  messages: SessionMessage[]
}

// ==================== 任务相关类型 ====================

/** 执行任务的入参 */
export interface ExecuteTaskParams {
  /** 工程本地路径（Agent 的工作目录） */
  projectPath: string
  /** 任务描述文本 */
  taskContent: string
  /** 使用的 Agent 类型 */
  agentType: AgentType
  /** 是否输出详细信息（工具调用、推理过程等），默认 false */
  verbose?: boolean
  /** 会话 ID（如果是会话模式） */
  sessionId?: string
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

/** Agent 同步执行结果 */
export interface AgentExecutionResult {
  taskId: string
  status: AgentStatus
  output: string
  error?: string
  sessionId?: string
}

/** aigent:output 推送事件的 payload */
export interface AgentOutputPayload {
  taskId: string
  /** 输出内容 */
  content: string
  /** 输出流类型 */
  stream: 'stdout' | 'stderr'
  /** 会话 ID（如果是会话模式） */
  sessionId?: string
}

/** aigent:done 推送事件的 payload */
export interface AgentDonePayload {
  taskId: string
  exitCode: number | null
  /** 会话 ID（如果是会话模式） */
  sessionId?: string
}

/** aigent:error 推送事件的 payload */
export interface AgentErrorPayload {
  taskId: string
  message: string
  /** 会话 ID（如果是会话模式） */
  sessionId?: string
}
