/**
 * AI Agent 服务 - IPC 处理器
 * 对应 defineHandlers.aigent 中的所有方法
 */
import { randomUUID } from 'crypto'
import { ClaudeCodeAgent } from './impl/ClaudeCodeAgent'
import { OpencodeAgent } from './impl/OpencodeAgent'
import { CodexAgent } from './impl/CodexAgent'
import { CursorAgent } from './impl/CursorAgent'
import { BaseAgent } from './impl/BaseAgent'
import type {
  ExecuteTaskParams,
  StopTaskParams,
  GetTaskStatusParams,
  TaskStatusResult
} from '@shared/types/aigent'

// ==================== 运行时 task 管理 ====================

const taskMap = new Map<string, BaseAgent>()

// ==================== Opencode 会话管理 ====================
// key: `${agentType}:${projectPath}`，value: opencode session ID
const opencodeSessionMap = new Map<string, string>()

/**
 * 获取或创建 opencode session ID
 * 会话模式：复用已有 session
 * 单次任务模式：返回 undefined（由 OpencodeAgent 内部管理）
 */
function getOpencodeSessionId(agentType: string, projectPath: string, useExisting: boolean): string | undefined {
  if (agentType !== 'opencode') return undefined

  const key = `${agentType}:${projectPath}`
  if (useExisting) {
    return opencodeSessionMap.get(key)
  }
  return undefined
}

/**
 * 保存 opencode session ID（OpencodeAgent 在创建新 session 时调用）
 */
export function saveOpencodeSessionId(agentType: string, projectPath: string, sessionId: string): void {
  if (agentType === 'opencode') {
    const key = `${agentType}:${projectPath}`
    opencodeSessionMap.set(key, sessionId)
  }
}

/**
 * 清除 opencode session ID（会话结束时调用）
 */
export function clearOpencodeSessionId(agentType: string, projectPath: string): void {
  const key = `${agentType}:${projectPath}`
  opencodeSessionMap.delete(key)
}

// ==================== IPC 处理函数 ====================

/** 执行 Agent 任务，返回 taskId 供后续中断/查询使用 */
export const executeTask = async (params: ExecuteTaskParams): Promise<{ taskId: string; sessionId?: string }> => {
  const { projectPath, taskContent, agentType, verbose = false, sessionId } = params

  const taskId = randomUUID()

  let agent: BaseAgent
  switch (agentType) {
    case 'claude-code':
      agent = new ClaudeCodeAgent(taskId, verbose)
      break
    case 'opencode':
      agent = new OpencodeAgent(taskId, verbose)
      break
    case 'codex':
      agent = new CodexAgent(taskId, verbose)
      break
    case 'cursor':
      agent = new CursorAgent(taskId, verbose)
      break
    default:
      throw new Error(`不支持的 Agent 类型: ${agentType}`)
  }

  taskMap.set(taskId, agent)

  // 异步执行，不阻塞 IPC 响应
  // 如果有 sessionId，则追加到已有会话；否则创建新会话
  agent.execute(taskContent, projectPath, sessionId).finally(() => {
    // 任务结束后延迟清理，给前端时间查询最终状态
    setTimeout(() => taskMap.delete(taskId), 60_000)
  })

  return { taskId, sessionId }
}

/** 中断正在执行的任务 */
export const stopTask = async (params: StopTaskParams): Promise<void> => {
  const agent = taskMap.get(params.taskId)
  if (!agent) throw new Error(`任务 ${params.taskId} 不存在或已结束`)
  agent.stop()
}

/** 获取任务当前状态 */
export const getTaskStatus = async (params: GetTaskStatusParams): Promise<TaskStatusResult> => {
  const agent = taskMap.get(params.taskId)
  if (!agent) throw new Error(`任务 ${params.taskId} 不存在或已结束`)
  return { taskId: params.taskId, status: agent.getStatus() }
}
