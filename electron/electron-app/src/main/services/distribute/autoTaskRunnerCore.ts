import type { AgentStatus, AgentType } from '../../../shared/types/aigent'

export interface AutoTaskRunnerTask {
  id: number
  remoteTaskId: number
  projectLocalPath?: string
  content: string
  status: string
}

export interface AutoTaskRunnerAgentParams {
  agentType: AgentType
  projectPath: string
  taskContent: string
}

export interface AutoTaskRunnerAgentResult {
  status: AgentStatus
  output?: string
  error?: string
}

export interface AutoTaskRunnerDeps {
  startLocalTask: (localTaskId: number) => Promise<{ promptPath: string; promptContent: string }>
  executeAgent: (params: AutoTaskRunnerAgentParams) => Promise<AutoTaskRunnerAgentResult>
  finishLocalTask: (
    localTaskId: number,
    params: { success: boolean; result?: string }
  ) => Promise<void>
}

export class AutoTaskRunnerCore {
  constructor(private readonly deps: AutoTaskRunnerDeps) {}

  async run(task: AutoTaskRunnerTask): Promise<void> {
    if (task.status !== 'pending' && task.status !== 'distributed') return

    if (!task.projectLocalPath) {
      await this.deps.finishLocalTask(task.id, {
        success: false,
        result: '自动执行失败：未找到工程本地路径'
      })
      return
    }

    try {
      const { promptContent } = await this.deps.startLocalTask(task.id)
      const result = await this.deps.executeAgent({
        agentType: 'claude-code',
        projectPath: task.projectLocalPath,
        taskContent: promptContent
      })

      const success = result.status === 'completed'
      await this.deps.finishLocalTask(task.id, {
        success,
        result: this.formatResult(result)
      })
    } catch (error: any) {
      await this.deps.finishLocalTask(task.id, {
        success: false,
        result: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private formatResult(result: AutoTaskRunnerAgentResult): string | undefined {
    const parts = [result.error, result.output].filter((part) => part && part.trim())
    return parts.length > 0 ? parts.join('\n\n') : undefined
  }
}
