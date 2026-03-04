import { spawn, type ChildProcess } from 'child_process'
import { BaseAgent } from './BaseAgent'

/**
 * Claude Code Agent
 * 通过 shell 方式执行 claude CLI，继承完整用户环境，避免 Electron PATH 缺失问题
 */
export class ClaudeCodeAgent extends BaseAgent {
  private process: ChildProcess | null = null

  protected async doExecute(taskContent: string, projectPath: string): Promise<void> {
    console.log(`[ClaudeCodeAgent] doExecute projectPath=${projectPath}`)
    return new Promise((resolve) => {
      // 通过 login shell 执行，自动加载 ~/.zshrc / ~/.bash_profile 等，获得完整 PATH
      // 同时用 env -u CLAUDECODE 清除嵌套检测变量
      const escapedTask = taskContent.replace(/'/g, `'"'"'`)
      const cmd = `env -u CLAUDECODE claude --print '${escapedTask}'`

      this.process = spawn('zsh', ['-l', '-c', cmd], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // 清除 Node.js 调试器注入，防止 VSCode debugger 附加到子进程导致挂起
          NODE_OPTIONS: ''
        }
      })

      this.process.stdout?.on('data', (chunk: Buffer) => {
        this.pushOutput(chunk.toString(), 'stdout')
      })

      this.process.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        console.error(`[ClaudeCodeAgent] stderr: ${text}`)
        this.pushOutput(text, 'stderr')
      })

      this.process.on('close', (code) => {
        console.log(`[ClaudeCodeAgent] closed, exitCode=${code}`)
        this.process = null
        this.pushDone(code)
        resolve()
      })

      this.process.on('error', (err) => {
        this.process = null
        this.pushError(`启动失败: ${err.message}`)
        resolve()
      })
    })
  }

  protected doStop(): void {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
  }
}
