/**
 * AI Agent 服务 - IPC 处理器
 * 对应 defineHandlers.aigent 中的所有方法
 */
import { randomUUID } from 'crypto'
import { ClaudeCodeAgent } from './impl/ClaudeCodeAgent'
import { BaseAgent } from './impl/BaseAgent'
import type {
  ExecuteTaskParams,
  StopTaskParams,
  GetTaskStatusParams,
  TaskStatusResult
} from '@shared/types/aigent'

// ==================== 运行时 task 管理 ====================

const taskMap = new Map<string, BaseAgent>()

// ==================== IPC 处理函数 ====================

/** 执行 Agent 任务，返回 taskId 供后续中断/查询使用 */
export const executeTask = async (params: ExecuteTaskParams): Promise<{ taskId: string }> => {
  const { projectPath, taskContent, agentType } = params

  const taskId = randomUUID()

  let agent: BaseAgent
  switch (agentType) {
    case 'claude-code':
      agent = new ClaudeCodeAgent(taskId)
      break
    default:
      throw new Error(`不支持的 Agent 类型: ${agentType}`)
  }

  taskMap.set(taskId, agent)

  // 异步执行，不阻塞 IPC 响应
  agent.execute(taskContent, projectPath).finally(() => {
    // 任务结束后延迟清理，给前端时间查询最终状态
    setTimeout(() => taskMap.delete(taskId), 60_000)
  })

  return { taskId }
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
