import { http } from './http'

export interface PageQuery {
  page: number
  pageSize: number
}

export interface TaskCreateItem {
  projectId: number
  machineId?: number
}

export interface TaskCreatePayload {
  title: string
  description?: string
  priority?: number
  list: TaskCreateItem[]
}

export interface ProjectCreatePayload {
  name: string
  gitUrl: string
  platform: number
  tags?: string
}

export const api = {
  machinesPageList(query: PageQuery) {
    return http.post('/machines/pageList', query)
  },
  projectsPageList(query: PageQuery) {
    return http.post('/projects/pageList', query)
  },
  tasksPageList(query: PageQuery) {
    return http.post('/tasks/pageList', query)
  },
  createProject(payload: ProjectCreatePayload) {
    return http.post('/projects/create', payload)
  },
  createTask(payload: TaskCreatePayload) {
    return http.post('/tasks/create', payload)
  },
}
