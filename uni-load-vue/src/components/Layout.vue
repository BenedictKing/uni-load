<template>
  <v-layout class="layout">
    <!-- 头部导航 -->
    <v-app-bar app color="primary" :elevation="2">
      <v-container class="header-content">
        <div class="header-left">
          <div class="logo">
            <v-icon size="28" color="white">mdi-rocket-launch</v-icon>
            <span class="logo-text">uni-load</span>
          </div>
          <div class="subtitle">AI站点自动配置工具</div>
        </div>

        <div class="header-right">
          <!-- 导航菜单 -->
          <v-tabs v-model="activeTab" bg-color="transparent" color="white" class="nav-tabs">
            <v-tab v-for="route in routes" :key="route.path" :value="route.path" :to="route.path">
              <v-icon size="18" class="mr-1">{{ route.icon }}</v-icon>
              {{ route.name }}
            </v-tab>
          </v-tabs>

          <!-- 头部操作 -->
          <div class="header-actions">
            <!-- 主题切换 -->
            <v-btn
              icon
              variant="text"
              color="white"
              @click="toggleTheme"
              :title="isDark ? '切换到亮色主题' : '切换到暗色主题'">
              <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
            </v-btn>

            <!-- 系统状态 -->
            <div class="status-indicator">
              <v-tooltip :text="systemStatusText" location="bottom">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" size="14" :color="statusColor"> mdi-circle </v-icon>
                </template>
              </v-tooltip>
            </div>
          </div>
        </div>
      </v-container>
    </v-app-bar>

    <!-- 主要内容区域 -->
    <v-main>
      <v-container>
        <slot />
      </v-container>
    </v-main>

    <!-- 页脚 -->
    <v-footer app color="surface" class="footer">
      <v-container>
        <div class="footer-content">
          <div class="footer-info">
            <span class="footer-text">© 2024 uni-load. 连接 uni-api 与 gpt-load</span>
          </div>

          <div class="footer-links">
            <v-btn
              v-for="link in footerLinks"
              :key="link.text"
              variant="text"
              size="small"
              :href="link.url"
              target="_blank"
              class="footer-link">
              <v-icon size="14" class="mr-1">{{ link.icon }}</v-icon>
              {{ link.text }}
            </v-btn>
          </div>
        </div>
      </v-container>
    </v-footer>
  </v-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from 'vuetify'

// Vuetify 主题
const vuetifyTheme = useTheme()
const route = useRoute()
const router = useRouter()

// 路由配置
const routes = [
  {
    path: '/',
    name: '站点配置',
    icon: 'mdi-cog',
  },
  {
    path: '/channels',
    name: '渠道管理',
    icon: 'mdi-connection',
  },
  {
    path: '/services',
    name: '服务状态',
    icon: 'mdi-chart-line',
  },
  {
    path: '/models',
    name: '模型管理',
    icon: 'mdi-robot',
  },
]

// 页脚链接
const footerLinks = [
  {
    text: 'Github主页',
    icon: 'mdi-book-open-variant',
    url: 'https://github.com/BenedictKing/uni-load',
  },
  {
    text: '论坛交流',
    icon: 'mdi-forum',
    url: 'https://linux.do/t/topic/918825',
  },
  {
    text: '问题反馈',
    icon: 'mdi-bug',
    url: 'https://github.com/BenedictKing/uni-load/issues',
  },
]

// 主题状态
const isDark = ref(false)

// 当前激活的标签
const activeTab = computed({
  get: () => route.path,
  set: path => router.push(path),
})

// 系统状态
const systemStatus = ref<'healthy' | 'warning' | 'error'>('healthy')
const systemStatusText = computed(() => {
  switch (systemStatus.value) {
    case 'healthy':
      return '系统运行正常'
    case 'warning':
      return '系统存在警告'
    case 'error':
      return '系统存在错误'
    default:
      return '状态未知'
  }
})

const statusColor = computed(() => {
  switch (systemStatus.value) {
    case 'healthy':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'grey'
  }
})

// 切换主题
const toggleTheme = () => {
  isDark.value = !isDark.value
  vuetifyTheme.global.name.value = isDark.value ? 'dark' : 'light'
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// 检查系统状态
const checkSystemStatus = async () => {
  try {
    // 这里可以调用 API 检查系统状态
    // const response = await api.get('/api/health')
    // systemStatus.value = response.data.status === 'healthy' ? 'healthy' : 'warning'
    systemStatus.value = 'healthy'
  } catch (error) {
    systemStatus.value = 'error'
  }
}

// 监听路由变化
watch(
  () => route.path,
  newPath => {
    activeTab.value = newPath
  }
)

// 初始化
onMounted(() => {
  // 恢复主题设置
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDark.value = true
    vuetifyTheme.global.name.value = 'dark'
  }

  // 检查系统状态
  checkSystemStatus()

  // 定期检查系统状态
  setInterval(checkSystemStatus, 30000) // 每30秒检查一次
})
</script>

<style scoped>
.layout {
  min-height: 100vh;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-text {
  font-size: 1.25rem;
  font-weight: 600;
  color: white;
}

.subtitle {
  font-size: 0.875rem;
  opacity: 0.9;
  color: white;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nav-tabs {
  border-radius: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  position: relative;
}

.footer {
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
}

.footer-text {
  color: rgba(0, 0, 0, 0.6);
  font-size: 0.875rem;
}

.footer-links {
  display: flex;
  gap: 8px;
}

.footer-link {
  text-transform: none;
  font-size: 0.875rem;
  padding: 4px 8px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }

  .header-right {
    width: 100%;
    justify-content: space-between;
  }

  .nav-tabs {
    flex: 1;
    overflow-x: auto;
  }

  .nav-text {
    display: none;
  }

  .footer-content {
    flex-direction: column;
    text-align: center;
    gap: 8px;
    padding: 12px 0;
  }

  .footer-text {
    white-space: normal;
    text-align: center;
    font-size: 0.75rem;
  }

  .footer-links {
    justify-content: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  .footer-link {
    font-size: 0.75rem;
    padding: 2px 6px;
  }
}

@media (max-width: 480px) {
  .logo-text {
    font-size: 1.125rem;
  }

  .subtitle {
    font-size: 0.75rem;
  }

  .header-actions {
    gap: 4px;
  }

  .footer-content {
    gap: 4px;
  }

  .footer-links {
    gap: 3px;
  }

  .footer-link {
    font-size: 0.625rem;
    padding: 1px 4px;
  }
}

/* 暗色主题优化 */
.v-theme--dark .footer {
  background: rgba(0, 0, 0, 0.2) !important;
  border-top-color: rgba(255, 255, 255, 0.1);
}

.v-theme--dark .footer-text {
  color: rgba(255, 255, 255, 0.6);
}
</style>
