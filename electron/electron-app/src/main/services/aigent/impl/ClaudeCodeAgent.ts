import { query, type Query } from '@anthropic-ai/claude-agent-sdk'
import { BaseAgent } from './BaseAgent'

/**
 * Claude Code Agent
 * 使用 @anthropic-ai/claude-agent-sdk 的 query() 实现稳定调用
 *
 * 支持两种模式：
 * 1. 单次任务模式：直接调用 query()
 * 2. 会话模式：传入 resume: sessionId 继续指定会话，或 continue: true 继续最近会话
 */
export class ClaudeCodeAgent extends BaseAgent {
  private queryInstance: Query | null = null

  protected async doExecute(taskContent: string, projectPath: string): Promise<void> {
    console.log(`[ClaudeCodeAgent] doExecute projectPath=${projectPath}`)

    try {
      // 构建 query 选项
      const queryOptions: Record<string, unknown> = {
        cwd: projectPath,
        pathToClaudeCodeExecutable: 'claude',
        permissionMode: 'acceptEdits'
      }

      // 会话模式：恢复指定会话
      if (this.sessionId) {
        queryOptions.resume = this.sessionId
        if (this.verbose) {
          this.pushOutput(`[ClaudeCode] 继续会话: ${this.sessionId}\n`)
        }
      }

      // 使用 SDK 的 query() 方法启动 Claude Code 子进程
      const conversation = query({
        prompt: taskContent,
        options: queryOptions
      })

      this.queryInstance = conversation

      // AsyncGenerator 遍历消息流
      for await (const message of conversation) {
        switch (message.type) {
          case 'system':
            // 系统消息 - 获取 session_id
            this.handleSystemMessage(message)
            break

          case 'assistant':
            // 处理 assistant 消息
            this.handleAssistantMessage(message)
            break

          case 'result':
            // 最终结果消息
            this.handleResultMessage(message)
            break

          case 'user':
            // 用户消息（echo back）- 仅 verbose
            if (this.verbose) {
              this.pushOutput(`[用户] ${JSON.stringify(message.message)}\n`, 'stdout')
            }
            break

          case 'tool_progress':
            // 工具执行进度 - 仅 verbose
            if (this.verbose) {
              this.pushOutput(
                `[工具执行中] ${message.tool_name} (${message.elapsed_time_seconds}s)\n`,
                'stdout'
              )
            }
            break

          case 'tool_use_summary':
            // 工具使用摘要 - 仅 verbose
            if (this.verbose) {
              this.pushOutput(`[工具摘要] ${message.summary}\n`, 'stdout')
            }
            break

          case 'local_command_output':
            // 本地命令输出 - 仅 verbose
            if (this.verbose) {
              this.pushOutput(`[本地命令] ${message.content}\n`, 'stdout')
            }
            break

          case 'hook_started':
          case 'hook_progress':
          case 'hook_response':
            // Hook 相关消息 - 仅 verbose
            if (this.verbose) {
              this.pushOutput(`[Hook] ${message.type}\n`, 'stdout')
            }
            break

          case 'auth_status':
            // 认证状态 - 仅 verbose
            if (this.verbose) {
              const authMsg = message as {
                type: string
                isAuthenticating: boolean
                output?: string[]
                error?: string
              }
              if (authMsg.error) {
                this.pushOutput(`[认证错误] ${authMsg.error}\n`, 'stderr')
              } else if (authMsg.output?.length) {
                this.pushOutput(`[认证] ${authMsg.output.join(' ')}\n`, 'stdout')
              }
            }
            break

          case 'rate_limit_event':
            // 限流事件 - 仅 verbose
            if (this.verbose) {
              this.pushOutput(`[限流] status: ${message.rate_limit_info.status}\n`, 'stdout')
            }
            break

          case 'task_notification':
            // 任务通知 - 仅 verbose
            if (this.verbose) {
              this.pushOutput(
                `[任务通知] ${message.task_id} - ${message.status}: ${message.summary}\n`,
                'stdout'
              )
            }
            break

          case 'prompt_suggestion':
            // 提示建议 - 仅 verbose
            if (this.verbose) {
              this.pushOutput(`[建议] ${message.suggestion}\n`, 'stdout')
            }
            break

          case 'elicitation_complete':
            // 询问完成 - 仅 verbose
            if (this.verbose) {
              this.pushOutput(`[询问完成] ${message.action}\n`, 'stdout')
            }
            break

          case 'files_persisted':
            // 文件持久化 - 仅 verbose
            if (this.verbose) {
              const filesMsg = message as { type: string; paths: string[] }
              this.pushOutput(`[文件变更] ${filesMsg.paths?.join(', ')}\n`, 'stdout')
            }
            break

          case 'session_state_changed':
            // 会话状态变更 - 仅 verbose
            if (this.verbose) {
              const stateMsg = message as { type: string; state: string }
              this.pushOutput(`[会话状态] ${stateMsg.state}\n`, 'stdout')
            }
            break

          default:
            // 其他未知消息类型 - 仅 verbose
            if (this.verbose) {
              console.log(`[ClaudeCodeAgent] unknown message type: ${message.type}`)
            }
        }
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)

      // 检查是否是进程异常退出
      if (msg.includes('exited with code')) {
        this.pushError(`Claude Code 进程异常退出。可能原因：${msg}`)
      } else {
        this.pushError(`执行失败: ${msg}`)
      }
      this.pushDone(1)
    }
  }

  /**
   * 处理 assistant 消息
   * - 非 verbose：只输出 text block
   * - verbose：输出 text block + tool_use block 摘要
   */
  private handleAssistantMessage(message: {
    type: 'assistant'
    message: { content: Array<{ type: string; text?: string; name?: string; input?: unknown }> }
    error?: string
  }): void {
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text) {
        // 始终输出文本内容
        this.pushOutput(block.text, 'stdout')
      } else if (block.type === 'tool_use' && this.verbose) {
        // 仅 verbose 输出工具调用摘要
        const toolBlock = block as { type: 'tool_use'; name?: string; input?: unknown }
        this.pushOutput(`[工具调用] ${toolBlock.name || 'unknown'}\n`, 'stdout')
      } else if (block.type === 'thinking' && this.verbose) {
        // 仅 verbose 输出思考过程
        const thinkingBlock = block as { type: 'thinking'; thinking?: string }
        if (thinkingBlock.thinking) {
          this.pushOutput(`[思考] ${thinkingBlock.thinking}\n`, 'stdout')
        }
      }
    }

    // 如果有错误，也输出
    if (message.error) {
      this.pushOutput(`[错误] ${message.error}\n`, 'stderr')
    }
  }

  /**
   * 处理 result 消息
   * - 非 verbose：只输出 result 文本
   * - verbose：输出完整统计信息
   */
  private handleResultMessage(message: {
    type: 'result'
    subtype: string
    result?: string
    total_cost_usd?: number
    usage?: { input_tokens?: number; output_tokens?: number }
    errors?: string[]
    permission_denials?: Array<{ tool_name: string }>
  }): void {
    if (message.subtype === 'success') {
      // 成功结果
      if (this.verbose) {
        // verbose 模式：输出完整统计
        const usage = message.usage || {}
        const cost = message.total_cost_usd?.toFixed(6) || '0'
        const denials = message.permission_denials?.length || 0
        this.pushOutput(
          `\n[完成] ${message.result}\n\n` +
            `[统计] tokens: ${usage.input_tokens || 0} in / ${usage.output_tokens || 0} out\n` +
            `[统计] 费用: $${cost}\n` +
            (denials > 0 ? `[统计] 权限拒绝: ${denials} 次\n` : ''),
          'stdout'
        )
      } else {
        // 非 verbose 模式：只输出结果
        if (message.result) {
          this.pushOutput(`\n[完成] ${message.result}`, 'stdout')
        }
      }
      this.pushDone(0)
    } else {
      // 错误结果
      const errorMsg = message.errors?.[0] || 'Unknown error'
      this.pushError(errorMsg)
      this.pushDone(1)
    }
  }

  /**
   * 处理 system 消息
   * - 非 verbose：忽略
   * - verbose：输出初始化信息
   * - 从 init 消息获取 session_id
   */
  private handleSystemMessage(message: {
    type: 'system'
    subtype: string
    claude_code_version?: string
    model?: string
    tools?: string[]
    permissionMode?: string
    cwd?: string
    session_id?: string
  }): void {
    if (message.subtype === 'init') {
      // 从 init 消息获取 session_id
      if (message.session_id && !this.sessionId) {
        this.setSessionId(message.session_id)
        if (this.verbose) {
          this.pushOutput(`[会话] session_id: ${message.session_id}\n`, 'stdout')
        }
      }

      if (this.verbose) {
        // verbose 模式输出版本信息
        this.pushOutput(
          `[初始化] Claude Code ${message.claude_code_version || 'unknown'}\n` +
            `[初始化] 模型: ${message.model || 'unknown'}\n` +
            `[初始化] 权限模式: ${message.permissionMode || 'unknown'}\n` +
            `[初始化] 工作目录: ${message.cwd || 'unknown'}\n`,
          'stdout'
        )
      }
    }
    // 其他 system 子类型在非 verbose 模式下忽略
  }

  protected doStop(): void {
    if (this.queryInstance) {
      // 使用 SDK 内置的 interrupt() 方法优雅地中断执行
      this.queryInstance.interrupt()
      this.queryInstance = null
    }
  }
}
