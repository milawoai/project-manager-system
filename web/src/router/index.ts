import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import MachinesView from '../views/MachinesView.vue'
import ProjectsView from '../views/ProjectsView.vue'
import TasksView from '../views/TasksView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/machines' },
  { path: '/machines', component: MachinesView },
  { path: '/projects', component: ProjectsView },
  { path: '/tasks', component: TasksView },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
