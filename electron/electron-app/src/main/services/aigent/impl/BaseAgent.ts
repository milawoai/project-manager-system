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
 *
 * 支持两种模式：
 * 1. 单次任务模式：直接调用 execute()，任务完成后自动结束
 * 2. 会话模式：传入 sessionId，继续已有会话
 */
export abstract class BaseAgent {
  readonly taskId: string
  protected status: AgentStatus = 'idle'
  /** 是否输出详细信息（工具调用、推理过程等） */
  protected verbose: boolean
  /** 会话 ID（会话模式使用，由子类管理） */
  protected sessionId: string | null = null
  private outputBuffer: string[] = []
  private errorBuffer: string[] = []

  constructor(taskId: string, verbose = false) {
    this.taskId = taskId
    this.verbose = verbose
  }

  getStatus(): AgentStatus {
    return this.status
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  getOutput(): string {
    return this.outputBuffer.join('')
  }

  getError(): string | undefined {
    return this.errorBuffer.length > 0 ? this.errorBuffer.join('\n') : undefined
  }

  /**
   * 设置会话 ID（子类在创建新会话后调用）
   */
  protected setSessionId(sessionId: string): void {
    this.sessionId = sessionId
  }

  /**
   * 执行任务（单次模式或会话模式）
   * @param taskContent 任务内容
   * @param projectPath 工程路径
   * @param sessionId 可选的会话 ID（会话模式）
   */
  async execute(taskContent: string, projectPath: string, sessionId?: string): Promise<void> {
    if (this.status === 'running') {
      throw new Error(`Task ${this.taskId} is already running`)
    }

    // 如果提供了 sessionId，则进入会话模式
    if (sessionId) {
      this.sessionId = sessionId
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
    if (stream === 'stderr') {
      this.errorBuffer.push(content)
    } else {
      this.outputBuffer.push(content)
    }

    const payload: AgentOutputPayload = {
      taskId: this.taskId,
      content,
      stream,
      sessionId: this.sessionId ?? undefined,
    }
    this.send('aigent:output', payload)
  }

  protected pushDone(exitCode: number | null): void {
    this.status = exitCode === 0 ? 'completed' : 'failed'
    const payload: AgentDonePayload = {
      taskId: this.taskId,
      exitCode,
      sessionId: this.sessionId ?? undefined,
    }
    this.send('aigent:done', payload)
  }

  protected pushError(message: string): void {
    this.status = 'failed'
    this.errorBuffer.push(message)
    const payload: AgentErrorPayload = {
      taskId: this.taskId,
      message,
      sessionId: this.sessionId ?? undefined,
    }
    this.send('aigent:error', payload)
  }

  private send(channel: string, payload: unknown): void {
    const win = WindowManager.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
