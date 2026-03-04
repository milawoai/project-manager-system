import { WindowManager } from '@main/windowManager'
import type {
  AgentStatus,
  AgentOutputPayload,
  AgentDonePayload,
  AgentErrorPayload
} from '@shared/types/aigent'

/**
 * Agent 抽象基类
 * 子类需实现 doExecute() 和 doStop()
 */
export abstract class BaseAgent {
  readonly taskId: string
  protected status: AgentStatus = 'idle'

  constructor(taskId: string) {
    this.taskId = taskId
  }

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(taskContent: string, projectPath: string): Promise<void> {
    if (this.status === 'running') {
      throw new Error(`Task ${this.taskId} is already running`)
    }
    this.status = 'running'
    try {
      await this.doExecute(taskContent, projectPath)
    } catch (err: any) {
      this.status = 'failed'
      this.pushError(err?.message || String(err))
    }
  }

  stop(): void {
    if (this.status !== 'running') return
    this.doStop()
  }

  // ==================== 子类实现 ====================

  protected abstract doExecute(taskContent: string, projectPath: string): Promise<void>
  protected abstract doStop(): void

  // ==================== 推送事件到渲染进程 ====================

  protected pushOutput(content: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
    const payload: AgentOutputPayload = { taskId: this.taskId, content, stream }
    this.send('aigent:output', payload)
  }

  protected pushDone(exitCode: number | null): void {
    this.status = exitCode === 0 ? 'completed' : 'failed'
    const payload: AgentDonePayload = { taskId: this.taskId, exitCode }
    this.send('aigent:done', payload)
  }

  protected pushError(message: string): void {
    this.status = 'failed'
    const payload: AgentErrorPayload = { taskId: this.taskId, message }
    this.send('aigent:error', payload)
  }

  private send(channel: string, payload: unknown): void {
    const win = WindowManager.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
