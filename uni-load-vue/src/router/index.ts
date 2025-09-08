import { createRouter, createWebHistory } from 'vue-router'
import SiteConfig from '@/views/SiteConfig.vue'
import ChannelManagement from '@/views/ChannelManagement.vue'
import ServiceStatus from '@/views/ServiceStatus.vue'

const routes = [
  {
    path: '/',
    name: 'SiteConfig',
    component: SiteConfig,
    meta: {
      title: '站点配置'
    }
  },
  {
    path: '/channels',
    name: 'ChannelManagement', 
    component: ChannelManagement,
    meta: {
      title: '渠道管理'
    }
  },
  {
    path: '/services',
    name: 'ServiceStatus',
    component: ServiceStatus,
    meta: {
      title: '服务状态'
    }
  },
  {
    path: '/models',
    name: 'ModelManagement',
    component: () => import('@/views/ModelManagement.vue'),
    meta: {
      title: '模型管理'
    }
  },
  // 重定向到首页
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

// 路由守卫 - 设置页面标题
router.beforeEach((to, from, next) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} - uni-load`
  } else {
    document.title = 'uni-load - AI站点配置器'
  }
  
  next()
})

export default router