/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-21 16:38:15
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-02-12 11:44:57
 * @FilePath: /copy_code_desk/src/renderer/src/router/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import AppLayout from '@renderer/layout/AppLayout.vue'
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: AppLayout,
    children: [
      {
        path: '/',
        redirect: '/distribute'
      },
      {
        path: '/init',
        name: 'init',
        meta: {
          breadcrumb: ['工程列表']
        },
        component: () => import('@renderer/pages/init/index.vue')
      },
      {
        path: '/distribute',
        name: 'distribute',
        meta: {
          breadcrumb: ['任务分发']
        },
        component: () => import('@renderer/pages/distribute/index.vue')
      },
      {
        path: '/config',
        name: 'config',
        meta: {
          breadcrumb: ['配置页面']
        },
        component: () => import('@renderer/pages/config/index.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  console.log('beforeEach', to, from)
  next()
})

export default router
