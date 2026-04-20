import {
  AutoTaskRunnerCore,
  type AutoTaskRunnerAgentParams,
  type AutoTaskRunnerAgentResult,
  type AutoTaskRunnerTask
} from './autoTaskRunnerCore'

export interface AutoTaskRunnerDeps {
  getTask: (localTaskId: number) => AutoTaskRunnerTask | null
  getPendingTasks: () => AutoTaskRunnerTask[]
  startLocalTask: (localTaskId: number) => Promise<{ promptPath: string; promptContent: string }>
  executeAgent: (params: AutoTaskRunnerAgentParams) => Promise<AutoTaskRunnerAgentResult>
  finishLocalTask: (
    localTaskId: number,
    params: { success: boolean; result?: string }
  ) => Promise<void>
}

export class AutoTaskRunner {
  private readonly queuedTaskIds = new Set<number>()
  private readonly queue: number[] = []
  private processing = false
  private readonly core: AutoTaskRunnerCore

  constructor(private readonly deps: AutoTaskRunnerDeps) {
    this.core = new AutoTaskRunnerCore({
      startLocalTask: deps.startLocalTask,
      executeAgent: deps.executeAgent,
      finishLocalTask: deps.finishLocalTask
    })
  }

  enqueue(localTaskId: number): void {
    if (this.queuedTaskIds.has(localTaskId)) return
    this.queuedTaskIds.add(localTaskId)
    this.queue.push(localTaskId)
    void this.drain()
  }

  enqueuePending(): void {
    for (const task of this.deps.getPendingTasks()) {
      this.enqueue(task.id)
    }
  }

  private async drain(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      while (this.queue.length > 0) {
        const localTaskId = this.queue.shift()!
        this.queuedTaskIds.delete(localTaskId)

        const task = this.deps.getTask(localTaskId)
        if (!task) continue

        await this.core.run(task)
      }
    } finally {
      this.processing = false
    }
  }
}
