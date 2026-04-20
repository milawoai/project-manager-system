import {
  Codex,
  type ThreadItem
} from '@openai/codex-sdk'
import { BaseAgent } from './BaseAgent'

/**
 * OpenAI Codex Agent
 * 使用 @openai/codex-sdk 的 Codex 客户端实现
 *
 * 支持会话模式：
 * - 有 sessionId：恢复已有线程继续对话
 * - 无 sessionId：创建新线程
 */
export class CodexAgent extends BaseAgent {
  private abortController: AbortController | null = null

  protected async doExecute(taskContent: string, projectPath: string): Promise<void> {
    console.log(`[CodexAgent] doExecute projectPath=${projectPath}`)

    try {
      // 创建 Codex 客户端
      const codex = new Codex({
        config: {
          workingDirectory: projectPath
        }
      })

      let thread: ReturnType<typeof codex.startThread>

      // 会话模式：恢复已有线程；否则创建新线程
      if (this.sessionId) {
        if (this.verbose) {
          this.pushOutput(`[Codex] 恢复线程: ${this.sessionId}\n`, 'stdout')
        }
        thread = codex.resumeThread(this.sessionId)
      } else {
        if (this.verbose) {
          this.pushOutput(`[Codex] 创建新线程\n`, 'stdout')
        }
        thread = codex.startThread({
          workingDirectory: projectPath
        })
      }

      // 流式执行任务
      const { events } = await thread.runStreamed(taskContent)

      this.abortController = new AbortController()

      // 流式消费事件
      for await (const event of events) {
        if (this.abortController?.signal.aborted) {
          this.pushOutput('\n[Codex] 任务已中断\n', 'stdout')
          break
        }

        switch (event.type) {
          case 'thread.started':
            // 线程启动 - 保存 thread_id 到 BaseAgent
            if (!this.sessionId && event.thread_id) {
              this.setSessionId(event.thread_id)
            }
            if (this.verbose) {
              this.pushOutput(`[Codex] 线程已启动: ${event.thread_id}\n`, 'stdout')
            }
            break

          case 'turn.started':
            // Turn 开始 - 仅 verbose
            if (this.verbose) {
              this.pushOutput('[Codex] 开始处理...\n', 'stdout')
            }
            break

          case 'turn.completed':
            // Turn 完成 - 仅 verbose
            if (this.verbose) {
              const usage = event.usage
              this.pushOutput(
                `\n[完成] tokens: ${usage?.input_tokens ?? 0} in / ${usage?.output_tokens ?? 0} out`,
                'stdout'
              )
            }
            break

          case 'turn.failed':
            // Turn 失败 - 始终输出
            this.pushError(`Turn 失败: ${event.error.message}`)
            break

          case 'item.started':
          case 'item.updated':
          case 'item.completed': {
            // Item 开始/更新/完成
            const item = event.item
            this.handleThreadItem(item, event.type)
            break
          }

          case 'error':
            // 错误事件 - 始终输出
            this.pushError(`Codex error: ${event.message}`)
            break

          default:
            // 忽略其他事件
            break
        }
      }

      this.pushDone(0)
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      this.pushError(`执行失败: ${msg}`)
      this.pushDone(1)
    } finally {
      this.abortController = null
    }
  }

  /**
   * 处理线程中的各个 item
   * verbose=true 时输出详细信息，否则只输出 agent_message
   */
  private handleThreadItem(item: ThreadItem, eventType: string): void {
    switch (item.type) {
      case 'agent_message':
        // AI 的文本响应 - 始终输出
        this.pushOutput(item.text, 'stdout')
        break

      case 'reasoning':
        // AI 推理过程 - 仅 verbose
        if (this.verbose) {
          this.pushOutput(`[推理] ${item.text}\n`, 'stdout')
        }
        break

      case 'command_execution': {
        // 命令执行 - 仅 verbose
        if (this.verbose) {
          const cmd = item
          const statusPrefix = eventType === 'item.completed' ? '[命令完成]' : '[命令执行中]'
          this.pushOutput(`${statusPrefix} ${cmd.command}\n  ${cmd.aggregated_output}`, 'stdout')
          if (cmd.exit_code !== undefined) {
            this.pushOutput(`  退出码: ${cmd.exit_code}\n`, 'stdout')
          }
        }
        break
      }

      case 'file_change': {
        // 文件变更 - 仅 verbose
        if (this.verbose) {
          const fileChange = item
          const changes = fileChange.changes.map((c) => `  ${c.kind}: ${c.path}`).join('\n')
          this.pushOutput(`[文件变更] ${fileChange.status}\n${changes}\n`, 'stdout')
        }
        break
      }

      case 'mcp_tool_call': {
        // MCP 工具调用 - 仅 verbose
        if (this.verbose) {
          const mcp = item
          this.pushOutput(`[MCP工具] ${mcp.server}/${mcp.tool} - ${mcp.status}\n`, 'stdout')
        }
        break
      }

      case 'web_search':
        // 网页搜索 - 仅 verbose
        if (this.verbose) {
          this.pushOutput(`[网页搜索] ${item.query}\n`, 'stdout')
        }
        break

      case 'todo_list': {
        // 待办列表 - 仅 verbose
        if (this.verbose) {
          const todos = item.items.map((t) => `  [${t.completed ? '✓' : ' '}] ${t.text}`).join('\n')
          this.pushOutput(`[待办]\n${todos}\n`, 'stdout')
        }
        break
      }

      case 'error':
        // Item 级别的错误 - 始终输出
        this.pushOutput(`[错误] ${item.message}\n`, 'stderr')
        break

      default:
        // 未知类型，忽略
        break
    }
  }

  protected doStop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }
}
