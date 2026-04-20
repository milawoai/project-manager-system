import { createOpencode, createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk'
import { BaseAgent } from './BaseAgent'

/**
 * 单实例 opencode server/client
 * opencode 采用单实例架构，多个工程通过 session 的 directory 参数区分上下文
 */
let serverInstance: { url: string; close(): void } | null = null
let serverStarting: Promise<{ url: string; close(): void }> | null = null
let currentClient: OpencodeClient | null = null

async function getOrCreateClient(): Promise<OpencodeClient> {
  // 1. 尝试复用已有 client
  if (currentClient && serverInstance) {
    try {
      await currentClient.session.list()
      return currentClient
    } catch {
      // server 已死，清理后重建
      currentClient = null
      serverInstance = null
    }
  }

  // 2. 尝试连接已有的 opencode server（用户可能已经手动启动了）
  try {
    const existingClient = createOpencodeClient()
    await existingClient.session.list()
    currentClient = existingClient
    return currentClient
  } catch {
    // 没有已有的 server，继续启动新的
  }

  // 3. 防止并发重复启动
  if (!serverStarting) {
    serverStarting = (async () => {
      const result = await createOpencode()
      serverInstance = result.server
      currentClient = result.client
      return result.server
    })()
  }

  await serverStarting
  return currentClient!
}

/**
 * Opencode Agent
 * 连接本机单实例 opencode server，通过 directory 参数区分工程上下文
 * 使用 event.subscribe 流式接收 delta 推送到渲染进程
 *
 * 支持两种模式：
 * 1. 会话模式（this.sessionId 存在）：复用已有 session，继续对话
 * 2. 单次任务模式（this.sessionId 为空）：创建新 session，执行后删除
 */
export class OpencodeAgent extends BaseAgent {
  private opencodeSessionId: string | null = null
  private abortController: AbortController | null = null

  protected async doExecute(taskContent: string, projectPath: string): Promise<void> {
    if (this.verbose) {
      this.pushOutput(`[opencode] 正在连接 server...\n`)
    }
    const client = await getOrCreateClient()
    if (this.verbose) {
      this.pushOutput(`[opencode] server 已就绪\n`)
    }

    // 会话模式：复用已有 session；单次任务：创建新 session
    if (this.sessionId) {
      // 会话模式：使用从 BaseAgent 继承的 sessionId
      this.opencodeSessionId = this.sessionId
      if (this.verbose) {
        this.pushOutput(`[opencode] 使用已有 session：${this.opencodeSessionId}\n`)
      }
    } else {
      // 单次任务模式：创建新 session
      if (this.verbose) {
        this.pushOutput(`[opencode] 创建 session，工程目录：${projectPath}\n`)
      }
      const sessionResp = await client.session.create({
        query: { directory: projectPath }
      })
      this.opencodeSessionId = sessionResp.data!.id
      // 通知 BaseAgent session 已创建（便于事件推送）
      this.setSessionId(this.opencodeSessionId)
      if (this.verbose) {
        this.pushOutput(`[opencode] session 已创建：${this.opencodeSessionId}\n`)
      }
    }

    const ac = new AbortController()
    this.abortController = ac

    // 订阅当前工程目录的事件流（server 按 directory 过滤）
    const { stream } = await client.event.subscribe({
      query: { directory: projectPath }
    })

    if (this.verbose) {
      this.pushOutput(`[opencode] 发送任务..., 任务描述: ${taskContent}\n\n`)
    }
    // 发送 prompt（fire-and-forget，结果通过事件流消费）
    client.session.prompt({
      path: { id: this.opencodeSessionId! },
      query: { directory: projectPath },
      body: {
        parts: [{ type: 'text', text: taskContent }]
      }
    })

    // 流式消费事件直到 session.idle
    for await (const event of stream) {
      if (ac.signal.aborted) break

      if (event.type === 'message.part.updated') {
        const { part, delta } = event.properties
        if (part.sessionID !== this.opencodeSessionId) continue

        this.handlePart(part, delta)
      } else if (event.type === 'session.error') {
        const props = event.properties as { sessionID: string; error?: string }
        if (props.sessionID === this.opencodeSessionId) {
          const msg = props.error ?? 'opencode session error'
          this.pushOutput(`[opencode] ✗ 错误：${msg}\n`, 'stderr')
          this.pushError(msg)
          ac.abort()
        }
      } else if (event.type === 'session.idle') {
        if (event.properties.sessionID === this.opencodeSessionId) {
          this.pushOutput(`\n[完成] 任务执行完成\n`)
          ac.abort()
        }
      } else if (this.verbose) {
        // 其他事件类型 - 仅 verbose 输出
        this.handleVerboseEvent(event)
      }
    }

    // 清理 session：仅单次任务模式需要删除，会话模式保持 session
    if (!this.sessionId && this.opencodeSessionId) {
      try {
        await client.session.delete({ path: { id: this.opencodeSessionId } })
      } catch {
        // 忽略清理失败，不影响主流程
      }
    }

    this.opencodeSessionId = null
    this.abortController = null
    this.pushDone(0)
  }

  /**
   * 处理 message part 事件
   * 非 verbose：只输出 text
   * verbose：输出所有详细信息
   */
  private handlePart(part: { type: string; [key: string]: unknown }, delta?: string): void {
    switch (part.type) {
      case 'text': {
        // AI 输出文本 - 可能是增量 delta 或完整文本 part.text
        const textPart = part as { text?: string }
        const output = delta || textPart.text
        if (output) {
          this.pushOutput(output, 'stdout')
        }
        break
      }

      case 'reasoning': {
        // 推理过程 - 仅 verbose
        if (this.verbose) {
          const reasoningPart = part as { text?: string }
          this.pushOutput(`[推理] ${reasoningPart.text || delta || ''}\n`, 'stdout')
        }
        break
      }

      case 'tool': {
        // 工具调用状态变化 - 仅 verbose
        if (this.verbose) {
          const tool = part as unknown as { tool: string; state: { status: string } }
          switch (tool.state.status) {
            case 'pending':
              this.pushOutput(`[工具] ${tool.tool} 准备调用...\n`, 'stdout')
              break
            case 'running':
              this.pushOutput(`[工具] ${tool.tool} 执行中\n`, 'stdout')
              break
            case 'completed':
              this.pushOutput(`[工具] ${tool.tool} ✓ 完成\n`, 'stdout')
              break
            case 'error':
              this.pushOutput(`[工具] ${tool.tool} ✗ 失败\n`, 'stderr')
              break
          }
        }
        break
      }

      case 'step-start': {
        // 步骤开始 - 仅 verbose
        if (this.verbose) {
          this.pushOutput(`\n--- 步骤开始 ---\n`, 'stdout')
        }
        break
      }

      case 'step-finish': {
        // 步骤完成 - 仅 verbose
        if (this.verbose) {
          const stepFinish = part as { reason?: string; cost?: number; tokens?: { input: number; output: number } }
          const cost = stepFinish.cost?.toFixed(4) || '0'
          const tokens = stepFinish.tokens
          const tokenInfo = tokens ? `${tokens.input + tokens.output}` : 'N/A'
          this.pushOutput(
            `--- 步骤完成（花费 $${cost}，tokens: ${tokenInfo}）---\n`,
            'stdout'
          )
        }
        break
      }

      case 'file': {
        // 文件操作 - 仅 verbose
        if (this.verbose) {
          const filePart = part as { filename?: string; path?: string }
          this.pushOutput(`[文件] ${filePart.filename || filePart.path || 'unknown'}\n`, 'stdout')
        }
        break
      }

      case 'subtask': {
        // 子任务 - 仅 verbose
        if (this.verbose) {
          const subtask = part as { description?: string; agent?: string }
          this.pushOutput(`[子任务] ${subtask.description} (${subtask.agent})\n`, 'stdout')
        }
        break
      }

      case 'retry': {
        // 重试 - 仅 verbose
        if (this.verbose) {
          const retryPart = part as { attempt?: number; error?: { message?: string } }
          this.pushOutput(
            `[重试] 第 ${retryPart.attempt} 次尝试${retryPart.error?.message ? `: ${retryPart.error.message}` : ''}\n`,
            'stdout'
          )
        }
        break
      }

      case 'compaction': {
        // 压缩会话 - 仅 verbose
        if (this.verbose) {
          this.pushOutput(`[压缩] 会话压缩中...\n`, 'stdout')
        }
        break
      }

      default:
        // 其他未知类型，忽略
        break
    }
  }

  /**
   * 处理 verbose 模式下的其他事件类型
   */
  private handleVerboseEvent(event: { type: string; properties: { [key: string]: unknown } }): void {
    switch (event.type) {
      case 'file.edited': {
        const props = event.properties as { file?: string }
        this.pushOutput(`[文件编辑] ${props.file || 'unknown'}\n`, 'stdout')
        break
      }

      case 'permission.updated': {
        const props = event.properties as { title?: string; type?: string }
        this.pushOutput(`[权限请求] ${props.title || props.type || 'unknown'}\n`, 'stdout')
        break
      }

      case 'permission.replied': {
        const props = event.properties as { permissionID?: string; response?: string }
        this.pushOutput(`[权限响应] ${props.permissionID}: ${props.response}\n`, 'stdout')
        break
      }

      case 'session.status': {
        const props = event.properties as { status?: { type: string } }
        this.pushOutput(`[会话状态] ${props.status?.type || 'unknown'}\n`, 'stdout')
        break
      }

      case 'session.compacted': {
        this.pushOutput(`[会话压缩] 完成\n`, 'stdout')
        break
      }

      case 'todo.updated': {
        this.pushOutput(`[待办更新]\n`, 'stdout')
        break
      }

      case 'command.executed': {
        const props = event.properties as { command?: string; exitCode?: number }
        this.pushOutput(`[命令执行] ${props.command} (退出码: ${props.exitCode})\n`, 'stdout')
        break
      }

      default:
        // 其他未知事件，忽略
        break
    }
  }

  protected doStop(): void {
    this.abortController?.abort()
    this.abortController = null

    if (this.opencodeSessionId) {
      // 异步中止 session，不阻塞 doStop 调用方
      getOrCreateClient()
        .then((client) => client.session.abort({ path: { id: this.opencodeSessionId! } }))
        .catch(() => {})
      this.opencodeSessionId = null
    }
  }
}
