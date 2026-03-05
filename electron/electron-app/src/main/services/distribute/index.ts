/**
 * 分布式任务分发服务 - IPC 处理器
 * 对应 defineHandlers.distribute 中的所有方法
 */
import axios, { type AxiosInstance } from 'axios'
import { Notification } from 'electron'
import DefaultStoreHandler from '@main/store/index'
import { WindowManager } from '@main/windowManager'
import { WsClient } from './wsClient'
import type {
  ConnectServerParams,
  RegisterMachineParams,
  RegisterMachineResponse,
  SavedDistConfig,
  DistProject,
  DistMachine,
  DistMachineProject,
  DistTask,
  DistTaskFilter,
  BindProjectParams,
  LocalDistProject,
  ConnectionStatusInfo,
  WsTaskAssignedPayload,
  AddLocalProjectParams
} from '@shared/types/distribute'
import fs from 'fs'
import {
  dbGetAllLocalProjects,
  dbGetLocalProjectById,
  dbInsertLocalProject,
  dbUpsertByRemoteId,
  dbUpdateLocalProject,
  dbMarkUploaded,
  dbDeleteLocalProject,
  dbInsertLocalTask,
  dbGetAllLocalTasks,
  dbGetLocalTaskById,
  dbUpdateLocalTask,
  type LocalProjectRow,
  type LocalTaskRow
} from '@main/services/db/index'

// ==================== Store Keys ====================
const STORE_KEY = {
  SERVER_URL: 'distribute:serverUrl',
  API_KEY: 'distribute:apiKey',
  MACHINE_ID: 'distribute:machineId',
  AUTO_CONNECT: 'distribute:autoConnect',
  LOCAL_PROJECTS: 'distribute:localProjects'
}

// ==================== HTTP 客户端 ====================

/** 为分布式任务服务端创建独立的 axios 实例 */
function createDistApi(): AxiosInstance {
  const serverUrl = DefaultStoreHandler.get<string>(STORE_KEY.SERVER_URL, '') || ''
  return axios.create({
    baseURL: serverUrl.replace(/\/$/, ''),
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' }
  })
}

/** 获取配置好的 axios 实例 */
function getApi(): AxiosInstance {
  return createDistApi()
}

// ==================== WebSocket 事件绑定 ====================

let wsEventsInitialized = false

function ensureWsEvents(): void {
  if (wsEventsInitialized) return
  wsEventsInitialized = true

  const ws = WsClient.getInstance()

  // 收到新任务时：写入本地 DB + 系统通知 + 推送到渲染进程
  ws.on('task-received', (payload: WsTaskAssignedPayload) => {
    // 写入本地 DB（幂等，重复下发不会重复插入）
    try {
      dbInsertLocalTask({
        remoteTaskId: payload.taskId,
        projectRemoteId: payload.projectId ?? undefined,
        content: payload.content,
        status: 'pending',
        remoteCreatedAt: new Date().toISOString()
      })
    } catch (e) {
      console.error('[distribute] 写入 local_tasks 失败:', e)
    }

    // 系统通知
    if (Notification.isSupported()) {
      new Notification({
        title: '收到新任务',
        body: payload.content?.substring(0, 100) || '有新的任务待处理'
      }).show()
    }

    // 推送到渲染进程
    const win = WindowManager.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('distribute:task-received', payload)
    }
  })

  // 连接状态变更推送到渲染进程
  ws.on('connection-change', (status) => {
    console.log(`[distribute] WS connection-change → ${status}`)
    const win = WindowManager.getMainWindow()
    if (win && !win.isDestroyed()) {
      console.log(`[distribute] 推送 connection-change 到渲染进程: ${status}`)
      win.webContents.send('distribute:connection-change', status)
    } else {
      console.warn('[distribute] mainWindow 不可用，无法推送 connection-change')
    }
  })

  // 错误推送到渲染进程
  ws.on('error', (payload) => {
    console.error('[distribute] WS error:', payload)
    const win = WindowManager.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('distribute:error', payload)
    }
  })
}

// ==================== IPC 处理函数 ====================

/** 测试服务端连通性（GET /api/projects） */
export const testConnection = async (
  serverUrl: string
): Promise<{ reachable: boolean; message: string }> => {
  const url = serverUrl.replace(/\/$/, '')
  console.log(`[distribute] testConnection → GET ${url}/api/projects`)
  try {
    const res = await axios.post(`${url}/api/projects/list`, {}, { timeout: 5000 })
    console.log(`[distribute] testConnection ✓ status=${res.status}`)
    return { reachable: true, message: '服务端连接正常' }
  } catch (e: any) {
    console.error(`[distribute] testConnection ✗ code=${e.code} msg=${e.message}`)
    const msg =
      e.code === 'ECONNREFUSED' ? '无法连接到服务端，请检查地址是否正确' : e.message || '连接失败'
    return { reachable: false, message: msg }
  }
}

/** 清除本机注册信息，下次连接时触发重新注册流程 */
export const resetRegistration = async (): Promise<void> => {
  // 断开当前 WS
  const ws = WsClient.getInstance()
  ws.disconnect()

  // 清除 apiKey 和 machineId，保留 serverUrl 方便下次快速连接
  DefaultStoreHandler.delete(STORE_KEY.API_KEY)
  DefaultStoreHandler.delete(STORE_KEY.MACHINE_ID)

  console.log('[distribute] resetRegistration: apiKey/machineId cleared')
}

/** 获取已保存的连接配置 */
export const getSavedConfig = async (): Promise<SavedDistConfig> => {
  return {
    serverUrl: DefaultStoreHandler.get<string>(STORE_KEY.SERVER_URL, '') || '',
    apiKey: DefaultStoreHandler.get<string>(STORE_KEY.API_KEY, '') || '',
    machineId: DefaultStoreHandler.get<string>(STORE_KEY.MACHINE_ID, '') || ''
  }
}

/** 连接到分布式任务服务端（apiKey 从 store 自动读取） */
export const connectServer = async (params: ConnectServerParams) => {
  const { serverUrl } = params
  const apiKey = DefaultStoreHandler.get<string>(STORE_KEY.API_KEY, '') || ''

  console.log(`[distribute] connectServer serverUrl=${serverUrl} hasApiKey=${!!apiKey}`)

  if (!apiKey) {
    throw new Error('未找到 API Key，请先注册本机')
  }

  // 保存服务端地址
  DefaultStoreHandler.set(STORE_KEY.SERVER_URL, serverUrl)

  ensureWsEvents()

  const ws = WsClient.getInstance()
  ws.connect(serverUrl, apiKey)

  return { message: '正在连接服务端...' }
}

/** 断开服务端连接 */
export const disconnectServer = async () => {
  const ws = WsClient.getInstance()
  ws.disconnect()
  return { message: '已断开连接' }
}

/** 业务层就绪，通知服务端开始补推离线任务 */
export const sendReady = async () => {
  const ws = WsClient.getInstance()
  ws.sendReady()
  return { message: 'READY 信号已发送' }
}

/** 获取当前连接状态 */
export const getConnectionStatus = async (): Promise<ConnectionStatusInfo> => {
  const ws = WsClient.getInstance()
  return ws.getStatus()
}

/** 获取服务端工程列表 */
export const getDistProjects = async (): Promise<DistProject[]> => {
  const api = getApi()
  const { data } = await api.post('/api/projects/list')
  return data
}

/** 获取工作机器列表 */
export const getDistMachines = async (): Promise<DistMachine[]> => {
  const api = getApi()
  const { data } = await api.post('/api/machines/list')
  return data
}

/** 注册本机为工作机器，注册后自动保存凭证并触发 WebSocket 连接 */
export const registerMachine = async (
  params: RegisterMachineParams
): Promise<RegisterMachineResponse> => {
  const api = getApi()
  const { data } = await api.post('/api/machines/create', params)

  // 保存返回的 apiKey 和 machineId
  if (data.apiKey) {
    DefaultStoreHandler.set(STORE_KEY.API_KEY, data.apiKey)
  }
  if (data.machine?.id) {
    DefaultStoreHandler.set(STORE_KEY.MACHINE_ID, data.machine.id)
  }

  // 自动触发 WebSocket 连接
  const serverUrl = DefaultStoreHandler.get<string>(STORE_KEY.SERVER_URL, '') || ''
  if (serverUrl && data.apiKey) {
    ensureWsEvents()
    const ws = WsClient.getInstance()
    ws.connect(serverUrl, data.apiKey)
  }

  return data
}

/** 绑定工程到机器 */
export const bindProject = async (
  machineId: number,
  params: BindProjectParams
): Promise<DistMachineProject> => {
  const api = getApi()
  const { data } = await api.post('/api/machines/bindProject', { machineId, ...params })
  return data
}

/** 解绑工程 */
export const unbindProject = async (machineId: number, projectId: number) => {
  const api = getApi()
  const { data } = await api.post('/api/machines/unbindProject', { machineId, projectId })
  return data
}

/** 获取机器绑定的工程列表 */
export const getMachineProjects = async (machineId: number): Promise<DistMachineProject[]> => {
  const api = getApi()
  const { data } = await api.post('/api/machines/boundProjects', { machineId })
  return data
}

/** 获取任务列表（仅返回下发给本机的任务） */
export const getDistTasks = async (filter?: DistTaskFilter): Promise<DistTask[]> => {
  const api = getApi()
  const machineId = Number(DefaultStoreHandler.get<string>(STORE_KEY.MACHINE_ID, '') || 0)
  const { data } = await api.post('/api/tasks/pageList', {
    ...filter,
    machineId: machineId || undefined,
    page: 1,
    pageSize: 100,
  })
  // pageList 返回 { list, total, page, pageSize }
  return data?.list ?? data ?? []
}

/** 获取任务详情 */
export const getDistTaskDetail = async (taskId: number): Promise<DistTask> => {
  const api = getApi()
  const { data } = await api.post('/api/tasks/detail', { id: taskId })
  return data
}

/** 开始执行任务 */
export const startTask = async (taskId: number) => {
  const machineId = Number(DefaultStoreHandler.get<string>(STORE_KEY.MACHINE_ID, '') || 0)
  const api = getApi()
  const { data } = await api.post('/api/tasks/updateStatus', {
    taskId,
    status: 'running',
    machineId
  })
  return data
}

/** 标记任务完成 */
export const completeTask = async (taskId: number, result?: string, logs?: string) => {
  const ws = WsClient.getInstance()
  if (ws.isConnected) {
    ws.sendTaskResult(taskId, 'completed', result, logs)
    return { message: '任务完成结果已上报' }
  }

  // WebSocket 未连接时走 HTTP 降级
  const machineId = Number(DefaultStoreHandler.get<string>(STORE_KEY.MACHINE_ID, '') || 0)
  const api = getApi()
  const { data } = await api.post('/api/tasks/updateStatus', {
    taskId,
    status: 'completed',
    result,
    logs,
    machineId
  })
  return data
}

/** 标记任务失败 */
export const failTask = async (taskId: number, errorMsg?: string, logs?: string) => {
  const ws = WsClient.getInstance()
  if (ws.isConnected) {
    ws.sendTaskResult(taskId, 'failed', errorMsg, logs)
    return { message: '任务失败结果已上报' }
  }

  // WebSocket 未连接时走 HTTP 降级
  const machineId = Number(DefaultStoreHandler.get<string>(STORE_KEY.MACHINE_ID, '') || 0)
  const api = getApi()
  const { data } = await api.post('/api/tasks/updateStatus', {
    taskId,
    status: 'failed',
    result: errorMsg,
    logs,
    machineId
  })
  return data
}

// ==================== 本地工程管理（SQLite） ====================

/** DB 行 → LocalDistProject */
function rowToLocalProject(row: LocalProjectRow): LocalDistProject {
  return {
    id: row.id,
    remoteId: row.remoteId,
    name: row.name,
    gitUrl: row.gitUrl,
    description: row.description,
    platform: row.platform ?? 0,
    tags: row.tags ?? '',
    localPath: row.localPath,
    branch: row.branch ?? 'main',
    syncedAt: row.syncedAt,
    uploadedAt: row.uploadedAt,
    createdAt: row.createdAt
  }
}

/** 获取所有本地工程（纯本地排最前） */
export const getLocalDistProjects = async (): Promise<LocalDistProject[]> =>
  dbGetAllLocalProjects().map(rowToLocalProject)

/**
 * 将单个远端工程 upsert 到本地 DB
 * - 已存在：更新元数据，保留 localPath / branch / uploadedAt
 * - 不存在：插入新记录
 */
export const syncRemoteProject = async (remote: DistProject): Promise<LocalDistProject> => {
  const row = dbUpsertByRemoteId({
    remoteId: remote.id,
    name: remote.name,
    gitUrl: remote.gitUrl,
    description: remote.description,
    platform: remote.platform ?? 0,
    tags: remote.tags ?? '',
    localPath: undefined, // COALESCE 保留原值
    branch: 'main', // 新行默认值，已有行由 COALESCE 保留原值
    syncedAt: new Date().toISOString(),
    uploadedAt: undefined // 同上
  })
  return rowToLocalProject(row)
}

/** 从服务端拉取全部工程并同步到本地 DB */
export const syncProjects = async (projectIds?: number[]): Promise<LocalDistProject[]> => {
  const remotes = await getDistProjects()
  const toSync = projectIds ? remotes.filter((p) => projectIds.includes(p.id)) : remotes
  for (const p of toSync) await syncRemoteProject(p)
  return dbGetAllLocalProjects().map(rowToLocalProject)
}

/** 设置/更新工程的本地路径（通过自增 id 定位） */
export const setProjectLocalPath = async (
  localId: number,
  localPath: string
): Promise<LocalDistProject[]> => {
  dbUpdateLocalProject(localId, { localPath })
  return dbGetAllLocalProjects().map(rowToLocalProject)
}

/** 添加纯本地工程（未上报到服务端） */
export const addLocalProject = async (params: AddLocalProjectParams): Promise<LocalDistProject> => {
  const row = dbInsertLocalProject({
    remoteId: undefined,
    name: params.name,
    gitUrl: params.gitUrl ?? '',
    description: params.description,
    platform: params.platform ?? 0,
    tags: params.tags ?? '',
    localPath: params.localPath,
    branch: params.branch ?? 'main',
    syncedAt: undefined,
    uploadedAt: undefined
  })
  return rowToLocalProject(row)
}

/**
 * 将纯本地工程上报到服务端
 * 上报成功后写入 remote_id + uploaded_at，本地自增 id 不变
 */
export const uploadLocalProject = async (localId: number): Promise<LocalDistProject> => {
  const local = dbGetLocalProjectById(localId)
  if (!local) throw new Error(`本地工程 #${localId} 不存在`)
  if (local.remoteId) throw new Error(`工程已关联服务端 (remoteId=${local.remoteId})`)

  const api = getApi()
  const { data } = await api.post('/api/projects/create', {
    name: local.name,
    gitUrl: local.gitUrl,
    description: local.description,
    platform: local.platform,
    tags: local.tags
  })

  const serverProject: DistProject = data
  const row = dbMarkUploaded(localId, serverProject.id)!
  return rowToLocalProject(row)
}

/** 更新本地工程信息 */
export const updateLocalProject = async (
  localId: number,
  fields: Partial<Pick<LocalDistProject, 'name' | 'gitUrl' | 'description' | 'platform' | 'tags' | 'localPath' | 'branch'>>
): Promise<LocalDistProject[]> => {
  dbUpdateLocalProject(localId, fields)
  return dbGetAllLocalProjects().map(rowToLocalProject)
}

/** 移除本地工程记录（不影响服务端） */
export const removeLocalProject = async (localId: number): Promise<LocalDistProject[]> => {
  dbDeleteLocalProject(localId)
  return dbGetAllLocalProjects().map(rowToLocalProject)
}

// ==================== 本地任务管理 ====================

/** LocalTaskRow → 前端可用的 LocalTask 对象 */
function rowToLocalTask(row: LocalTaskRow) {
  // 找关联工程名（用于展示）
  const project = row.projectRemoteId
    ? dbGetAllLocalProjects().find((p) => p.remoteId === row.projectRemoteId)
    : undefined

  return {
    id: row.id,
    remoteTaskId: row.remoteTaskId,
    projectRemoteId: row.projectRemoteId,
    projectName: project?.name ?? '未知工程',
    projectLocalPath: project?.localPath,
    content: row.content,
    status: row.status,
    promptPath: row.promptPath,
    result: row.result,
    remoteCreatedAt: row.remoteCreatedAt,
    localStartedAt: row.localStartedAt,
    localFinishedAt: row.localFinishedAt,
    createdAt: row.createdAt
  }
}

/** 获取所有本地任务（附带工程名） */
export const getLocalTasks = async () => {
  return dbGetAllLocalTasks().map(rowToLocalTask)
}

/**
 * 开始处理本地任务
 * 1. 互斥校验（同工程不能有两个 running）
 * 2. 生成 prompt md 文件
 * 3. 更新本地 DB 状态为 running
 * 4. 通过 WS 上报到远端
 * 返回：{ promptPath, promptContent } 供前端弹框展示
 */
export const startLocalTask = async (
  localTaskId: number
): Promise<{ promptPath: string; promptContent: string }> => {
  const task = dbGetLocalTaskById(localTaskId)
  if (!task) throw new Error(`本地任务 #${localTaskId} 不存在`)
  if (task.status === 'running') throw new Error('该任务已在处理中')

  // 互斥校验：同工程是否已有 running 任务
  if (task.projectRemoteId) {
    const allTasks = dbGetAllLocalTasks()
    const conflict = allTasks.find(
      (t) => t.id !== localTaskId && t.projectRemoteId === task.projectRemoteId && t.status === 'running'
    )
    if (conflict) throw new Error(`该工程已有处理中的任务 #${conflict.remoteTaskId}，请先完成后再开始新任务`)
  }

  // 找工程 localPath
  const project = task.projectRemoteId
    ? dbGetAllLocalProjects().find((p) => p.remoteId === task.projectRemoteId)
    : undefined

  if (!project?.localPath) {
    throw new Error('未找到工程本地路径，请先在「工程」Tab 中设置本地路径')
  }

  // 生成 prompt 文件
  const { randomUUID } = await import('crypto')
  const fileName = `task_${randomUUID()}.md`
  const promptPath = `${project.localPath}/${fileName}`
  const now = task.remoteCreatedAt ? new Date(task.remoteCreatedAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN')

  const promptContent = [
    `# 任务：${task.remoteTaskId}`,
    `工程：${project.name}`,
    `下发时间：${now}`,
    '',
    '## 任务描述',
    task.content,
    '',
    '## 执行说明',
    '请基于以上描述完成对应开发工作，完成后在 Electron 客户端标记为已完成。'
  ].join('\n')

  fs.writeFileSync(promptPath, promptContent, 'utf-8')

  // 更新本地 DB
  dbUpdateLocalTask(localTaskId, {
    status: 'running',
    promptPath,
    localStartedAt: new Date().toISOString()
  })

  // WS 上报 running 状态到远端
  const ws = WsClient.getInstance()
  if (ws.isConnected) {
    ws.sendTaskResult(task.remoteTaskId, 'running' as any)
  }

  return { promptPath, promptContent }
}

/**
 * 取消开始处理
 * 删除已生成的 prompt 文件，状态回退到 pending
 */
export const cancelStartLocalTask = async (localTaskId: number): Promise<void> => {
  const task = dbGetLocalTaskById(localTaskId)
  if (!task) throw new Error(`本地任务 #${localTaskId} 不存在`)

  if (task.promptPath) {
    try {
      fs.unlinkSync(task.promptPath)
    } catch (e) {
      console.warn('[distribute] 删除 prompt 文件失败（可能已不存在）:', e)
    }
  }

  dbUpdateLocalTask(localTaskId, {
    status: 'pending',
    promptPath: undefined
  })
}

/**
 * 完成处理本地任务
 * 更新本地 DB + WS 上报到远端
 */
export const finishLocalTask = async (
  localTaskId: number,
  params: { success: boolean; result?: string }
): Promise<void> => {
  const task = dbGetLocalTaskById(localTaskId)
  if (!task) throw new Error(`本地任务 #${localTaskId} 不存在`)

  const finalStatus = params.success ? 'completed' : 'failed'

  dbUpdateLocalTask(localTaskId, {
    status: finalStatus,
    result: params.result,
    localFinishedAt: new Date().toISOString()
  })

  const ws = WsClient.getInstance()
  if (ws.isConnected) {
    ws.sendTaskResult(task.remoteTaskId, finalStatus as 'completed' | 'failed', params.result)
  } else {
    // WS 断线时 HTTP 降级上报
    const machineId = Number(DefaultStoreHandler.get<string>(STORE_KEY.MACHINE_ID, '') || 0)
    const api = getApi()
    await api.post('/api/tasks/updateStatus', {
      taskId: task.remoteTaskId,
      status: finalStatus,
      result: params.result,
      machineId
    })
  }
}
