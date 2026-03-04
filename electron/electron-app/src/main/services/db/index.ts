/**
 * SQLite 数据库服务（单例）
 * 数据库文件：{userData}/projectManager.db
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db

  const dbPath = path.join(app.getPath('userData'), 'projectManager.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  initSchema(db)
  return db
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS local_projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id   TEXT UNIQUE,               -- 服务端 UUID，NULL 表示纯本地未上报
      name        TEXT NOT NULL,
      git_url     TEXT NOT NULL DEFAULT '',
      description TEXT,
      platform    INTEGER NOT NULL DEFAULT 0, -- 对应 PLATFORM_OPTIONS.code
      tags        TEXT NOT NULL DEFAULT '',   -- 逗号分隔标签，如 "vue,ts"
      local_path  TEXT,
      branch      TEXT NOT NULL DEFAULT 'main',
      synced_at   TEXT,                      -- 从服务端关联的时间，NULL=纯本地
      uploaded_at TEXT,                      -- 上报到服务端的时间，NULL=未上报
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS local_tasks (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_task_id     INTEGER NOT NULL UNIQUE,  -- 服务端 task.id
      project_remote_id  INTEGER,                  -- 关联 local_projects.remote_id，NULL=工程未知
      content            TEXT NOT NULL,            -- 任务描述（从服务端同步）
      status             TEXT NOT NULL DEFAULT 'pending', -- pending/running/completed/failed
      prompt_path        TEXT,                     -- 生成的 task_{uuid}.md 文件绝对路径（本地独有）
      result             TEXT,                     -- 完成备注（用户填写后上报）
      logs               TEXT,                     -- 保留字段，暂不使用
      remote_created_at  TEXT,                     -- 服务端任务创建时间（展示用）
      local_started_at   TEXT,                     -- 本地点击「开始处理」的时间
      local_finished_at  TEXT,                     -- 本地点击「完成处理」的时间
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

// ==================== 类型 ====================

export interface LocalProjectRow {
  id: number
  remoteId?: number
  name: string
  gitUrl: string
  description?: string
  platform: number
  tags: string
  localPath?: string
  branch: string
  syncedAt?: string
  uploadedAt?: string
  createdAt: string
}

export type LocalProjectInsert = Omit<LocalProjectRow, 'id' | 'createdAt' | 'branch'> & {
  branch?: string
}

// ==================== 内部转换 ====================

function rowToProject(row: Record<string, unknown>): LocalProjectRow {
  return {
    id: row.id as number,
    remoteId: row.remote_id ? Number(row.remote_id) : undefined,
    name: row.name as string,
    gitUrl: (row.git_url as string) || '',
    description: (row.description as string) || undefined,
    platform: (row.platform as number) ?? 0,
    tags: (row.tags as string) || '',
    localPath: (row.local_path as string) || undefined,
    branch: (row.branch as string) || 'main',
    syncedAt: (row.synced_at as string) || undefined,
    uploadedAt: (row.uploaded_at as string) || undefined,
    createdAt: row.created_at as string
  }
}

// ==================== CRUD ====================

/** 获取所有本地工程（纯本地优先，按 created_at 倒序） */
export function dbGetAllLocalProjects(): LocalProjectRow[] {
  const rows = getDb()
    .prepare(
      `
      SELECT * FROM local_projects
      ORDER BY (remote_id IS NULL) DESC, created_at DESC
    `
    )
    .all() as Record<string, unknown>[]
  return rows.map(rowToProject)
}

/** 按自增 id 查询 */
export function dbGetLocalProjectById(id: number): LocalProjectRow | null {
  const row = getDb().prepare('SELECT * FROM local_projects WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToProject(row) : null
}

/** 按 remote_id 查询 */
export function dbGetLocalProjectByRemoteId(remoteId: number): LocalProjectRow | null {
  const row = getDb().prepare('SELECT * FROM local_projects WHERE remote_id = ?').get(remoteId) as
    | Record<string, unknown>
    | undefined
  return row ? rowToProject(row) : null
}

/** 插入新工程，返回插入后的完整记录 */
export function dbInsertLocalProject(p: LocalProjectInsert): LocalProjectRow {
  try {
    const info = getDb()
      .prepare(
        `
        INSERT INTO local_projects
          (remote_id, name, git_url, description, platform, tags, local_path, branch, synced_at, uploaded_at)
        VALUES
          (@remoteId, @name, @gitUrl, @description, @platform, @tags, @localPath, @branch, @syncedAt, @uploadedAt)
      `
      )
      .run({ ...p, branch: p.branch ?? 'main' })
    return dbGetLocalProjectById(info.lastInsertRowid as number)!
  } catch (error) {
    console.error(error)
    throw error
  }
}

/** 按 remote_id upsert（有则更新元数据，无则插入） */
export function dbUpsertByRemoteId(p: LocalProjectInsert & { remoteId: number }): LocalProjectRow {
  try {
    getDb()
      .prepare(
        `
        INSERT INTO local_projects
          (remote_id, name, git_url, description, platform, tags, local_path, branch, synced_at, uploaded_at)
        VALUES
          (@remoteId, @name, @gitUrl, @description, @platform, @tags, @localPath, COALESCE(@branch, 'main'), @syncedAt, @uploadedAt)
        ON CONFLICT(remote_id) DO UPDATE SET
          name        = excluded.name,
          git_url     = excluded.git_url,
          description = excluded.description,
          platform    = excluded.platform,
          tags        = excluded.tags,
          local_path  = COALESCE(local_projects.local_path, excluded.local_path),
          branch      = COALESCE(local_projects.branch, excluded.branch),
          synced_at   = excluded.synced_at,
          uploaded_at = COALESCE(local_projects.uploaded_at, excluded.uploaded_at)
      `
      )
      .run(p)
    return dbGetLocalProjectByRemoteId(p.remoteId)!
  } catch (error) {
    console.error(error)
    throw error
  }
}

/** 更新单条记录的可编辑字段 */
export function dbUpdateLocalProject(
  id: number,
  fields: Partial<
    Pick<
      LocalProjectRow,
      'name' | 'gitUrl' | 'description' | 'platform' | 'tags' | 'localPath' | 'branch'
    >
  >
): LocalProjectRow | null {
  const sets: string[] = []
  const params: Record<string, unknown> = { id }

  if (fields.name !== undefined) {
    sets.push('name = @name')
    params.name = fields.name
  }
  if (fields.gitUrl !== undefined) {
    sets.push('git_url = @gitUrl')
    params.gitUrl = fields.gitUrl
  }
  if (fields.description !== undefined) {
    sets.push('description = @description')
    params.description = fields.description
  }
  if (fields.platform !== undefined) {
    sets.push('platform = @platform')
    params.platform = fields.platform
  }
  if (fields.tags !== undefined) {
    sets.push('tags = @tags')
    params.tags = fields.tags
  }
  if (fields.localPath !== undefined) {
    sets.push('local_path = @localPath')
    params.localPath = fields.localPath
  }
  if (fields.branch !== undefined) {
    sets.push('branch = @branch')
    params.branch = fields.branch
  }

  if (sets.length === 0) return dbGetLocalProjectById(id)

  getDb()
    .prepare(`UPDATE local_projects SET ${sets.join(', ')} WHERE id = @id`)
    .run(params)
  return dbGetLocalProjectById(id)
}

/** 将纯本地工程标记为已上报（写入 remote_id + uploaded_at + synced_at） */
export function dbMarkUploaded(id: number, remoteId: number): LocalProjectRow | null {
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `
      UPDATE local_projects
      SET remote_id = ?, uploaded_at = ?, synced_at = ?
      WHERE id = ?
    `
    )
    .run(remoteId, now, now, id)
  return dbGetLocalProjectById(id)
}

/** 删除本地工程记录 */
export function dbDeleteLocalProject(id: number): void {
  getDb().prepare('DELETE FROM local_projects WHERE id = ?').run(id)
}

/** 应用退出时关闭连接 */
export function closeDb(): void {
  db?.close()
  db = null
}

// ==================== local_tasks 类型 ====================

export interface LocalTaskRow {
  id: number
  remoteTaskId: number
  projectRemoteId?: number
  content: string
  /** pending | running | completed | failed */
  status: string
  promptPath?: string
  result?: string
  logs?: string
  remoteCreatedAt?: string
  localStartedAt?: string
  localFinishedAt?: string
  createdAt: string
}

export type LocalTaskInsert = Pick<
  LocalTaskRow,
  'remoteTaskId' | 'projectRemoteId' | 'content' | 'status' | 'remoteCreatedAt'
>

export type LocalTaskUpdateFields = Partial<
  Pick<LocalTaskRow, 'status' | 'promptPath' | 'result' | 'logs' | 'localStartedAt' | 'localFinishedAt'>
>

// ==================== local_tasks 内部转换 ====================

function rowToTask(row: Record<string, unknown>): LocalTaskRow {
  return {
    id: row.id as number,
    remoteTaskId: row.remote_task_id as number,
    projectRemoteId: row.project_remote_id ? Number(row.project_remote_id) : undefined,
    content: row.content as string,
    status: row.status as string,
    promptPath: (row.prompt_path as string) || undefined,
    result: (row.result as string) || undefined,
    logs: (row.logs as string) || undefined,
    remoteCreatedAt: (row.remote_created_at as string) || undefined,
    localStartedAt: (row.local_started_at as string) || undefined,
    localFinishedAt: (row.local_finished_at as string) || undefined,
    createdAt: row.created_at as string
  }
}

// ==================== local_tasks CRUD ====================

/** 按自增 id 查询 */
export function dbGetLocalTaskById(id: number): LocalTaskRow | null {
  const row = getDb().prepare('SELECT * FROM local_tasks WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToTask(row) : null
}

/** 按 remote_task_id 查询（幂等写入前先检查） */
export function dbGetLocalTaskByRemoteId(remoteTaskId: number): LocalTaskRow | null {
  const row = getDb()
    .prepare('SELECT * FROM local_tasks WHERE remote_task_id = ?')
    .get(remoteTaskId) as Record<string, unknown> | undefined
  return row ? rowToTask(row) : null
}

/** 获取所有本地任务，按 created_at 倒序 */
export function dbGetAllLocalTasks(): LocalTaskRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM local_tasks ORDER BY created_at DESC')
    .all() as Record<string, unknown>[]
  return rows.map(rowToTask)
}

/** 按状态过滤任务 */
export function dbGetLocalTasksByStatus(status: string | string[]): LocalTaskRow[] {
  const statuses = Array.isArray(status) ? status : [status]
  const placeholders = statuses.map(() => '?').join(', ')
  const rows = getDb()
    .prepare(`SELECT * FROM local_tasks WHERE status IN (${placeholders}) ORDER BY created_at DESC`)
    .all(...statuses) as Record<string, unknown>[]
  return rows.map(rowToTask)
}

/**
 * 插入新任务（幂等：remote_task_id 已存在则跳过，返回现有记录）
 */
export function dbInsertLocalTask(p: LocalTaskInsert): LocalTaskRow {
  const existing = dbGetLocalTaskByRemoteId(p.remoteTaskId)
  if (existing) return existing

  const info = getDb()
    .prepare(
      `INSERT INTO local_tasks
        (remote_task_id, project_remote_id, content, status, remote_created_at)
       VALUES
        (@remoteTaskId, @projectRemoteId, @content, @status, @remoteCreatedAt)`
    )
    .run(p)
  return dbGetLocalTaskById(info.lastInsertRowid as number)!
}

/** 更新任务字段（status / promptPath / result / logs / localStartedAt / localFinishedAt） */
export function dbUpdateLocalTask(id: number, fields: LocalTaskUpdateFields): LocalTaskRow | null {
  const sets: string[] = []
  const params: Record<string, unknown> = { id }

  if (fields.status !== undefined) {
    sets.push('status = @status')
    params.status = fields.status
  }
  if (fields.promptPath !== undefined) {
    sets.push('prompt_path = @promptPath')
    params.promptPath = fields.promptPath
  }
  if (fields.result !== undefined) {
    sets.push('result = @result')
    params.result = fields.result
  }
  if (fields.logs !== undefined) {
    sets.push('logs = @logs')
    params.logs = fields.logs
  }
  if (fields.localStartedAt !== undefined) {
    sets.push('local_started_at = @localStartedAt')
    params.localStartedAt = fields.localStartedAt
  }
  if (fields.localFinishedAt !== undefined) {
    sets.push('local_finished_at = @localFinishedAt')
    params.localFinishedAt = fields.localFinishedAt
  }

  if (sets.length === 0) return dbGetLocalTaskById(id)

  getDb()
    .prepare(`UPDATE local_tasks SET ${sets.join(', ')} WHERE id = @id`)
    .run(params)
  return dbGetLocalTaskById(id)
}
