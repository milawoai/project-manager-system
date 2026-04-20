import { spawn, type ChildProcess } from 'child_process'
import { BaseAgent } from './BaseAgent'

/**
 * Cursor Agent
 * 通过 cursor CLI 的 agent 命令执行任务
 *
 * 支持两种模式：
 * 1. 单次任务模式（this.sessionId 为空）：创建新会话，执行后删除
 * 2. 会话模式（this.sessionId 存在）：使用 --resume 继续已有线程
 */
export class CursorAgent extends BaseAgent {
  private process: ChildProcess | null = null
  private currentThreadId: string | null = null

  protected async doExecute(taskContent: string, projectPath: string): Promise<void> {
    console.log(`[CursorAgent] doExecute projectPath=${projectPath}`)

    return new Promise((resolve) => {
      // 构建 cursor agent 命令
      const escapedTask = taskContent.replace(/'/g, `'"'"'`)

      // 会话模式：使用 --resume 继续已有线程；单次任务：创建新会话
      let cmd: string
      if (this.sessionId) {
        // 会话模式：继续指定线程
        this.currentThreadId = this.sessionId
        cmd = `agent -p '${escapedTask}' --resume ${this.sessionId}`
        console.log(`[CursorAgent] resuming thread: ${this.sessionId}`)
      } else {
        // 单次任务模式：创建新会话
        cmd = `agent -p '${escapedTask}'`
        console.log(`[CursorAgent] starting new session`)
      }

      console.log(`[CursorAgent] executing: ${cmd}`)

      this.process = spawn('zsh', ['-l', '-c', cmd], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        // 不设置 detached，让父进程等待子进程，确保 close 事件正确触发
        env: {
          ...process.env,
          // 清除可能干扰的变量
          NODE_OPTIONS: ''
        }
      })

      // 诊断：检查进程是否成功启动
      this.process.on('spawn', () => {
        console.log(`[CursorAgent] process spawned successfully`)
      })

      this.process.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        console.log(`[CursorAgent] stdout: ${text.substring(0, 200)}`)
        this.pushOutput(text, 'stdout')

        // 从输出中提取 thread id（Cursor 创建新会话时会输出 thread id）
        if (!this.currentThreadId && !this.sessionId) {
          // 尝试从输出中匹配 thread id
          // 格式可能是 "Thread ID: xxx" 或 "thread_id: xxx" 等
          const threadIdMatch = text.match(/thread[_-]?id[:\s]+([a-zA-Z0-9-]+)/i)
          if (threadIdMatch) {
            this.currentThreadId = threadIdMatch[1]
            this.setSessionId(this.currentThreadId)
            console.log(`[CursorAgent] extracted thread id: ${this.currentThreadId}`)
          }
        }
      })

      this.process.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        console.log(`[CursorAgent] stderr: ${text.substring(0, 200)}`)
        // Cursor CLI 可能输出到 stderr，但这是正常输出
        this.pushOutput(text, 'stderr')
      })

      this.process.on('close', (code) => {
        console.log(`[CursorAgent] closed, exitCode=${code}, taskId=${this.taskId}`)
        this.process = null
        this.pushDone(code ?? 1)
        resolve()
      })

      this.process.on('error', (err) => {
        console.error(`[CursorAgent] error: ${err.message}`)
        this.process = null
        this.pushError(`启动失败: ${err.message}`)
        this.pushDone(1)
        resolve()
      })
    })
  }

  protected doStop(): void {
    if (this.process) {
      console.log(`[CursorAgent] stopping process, taskId=${this.taskId}...`)

      // 设置 3 秒超时兜底，确保一定会触发 done
      const timeout = setTimeout(() => {
        console.log(`[CursorAgent] timeout - forcing cleanup`)
        if (this.process) {
          this.process = null
          this.pushDone(1) // 中断视为异常退出
        }
      }, 3000)

      try {
        // 使用负的 pid 给整个进程组发送 SIGTERM
        // 负的 pid 表示向进程组发送信号
        const pgid = this.process.pid
        console.log(`[CursorAgent] killing process group ${pgid}`)
        process.kill(-pgid, 'SIGTERM')
        console.log(`[CursorAgent] SIGTERM sent to process group`)
      } catch (err: any) {
        console.error(`[CursorAgent] kill process group failed: ${err.message}`)
        // 如果进程组失败，尝试直接杀
        try {
          this.process.kill('SIGKILL')
          console.log(`[CursorAgent] SIGKILL sent`)
        } catch (err2: any) {
          console.error(`[CursorAgent] SIGKILL failed: ${err2.message}`)
          clearTimeout(timeout)
        }
      }
    }
  }
}
