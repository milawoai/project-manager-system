import { http } from './http'

export interface PageQuery {
  page: number
  pageSize: number
}

export interface TasksPageQuery extends PageQuery {
  title?: string
  status?: string
  startDate?: string
  endDate?: string
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

export interface TaskUpdatePayload {
  id: number
  title?: string
  description?: string
  priority?: number
  list?: TaskCreateItem[]
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
  tasksPageList(query: TasksPageQuery) {
    return http.post('/tasks/pageList', query)
  },
  createProject(payload: ProjectCreatePayload) {
    return http.post('/projects/create', payload)
  },
  createTask(payload: TaskCreatePayload) {
    return http.post('/tasks/create', payload)
  },
  updateTask(payload: TaskUpdatePayload) {
    return http.post('/tasks/update', payload)
  },
  redispatchTask(id: number) {
    return http.post('/tasks/redispatch', { id })
  },
}
