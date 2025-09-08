<template>
  <v-layout class="layout">
    <!-- 头部导航 -->
    <v-app-bar app color="primary" :elevation="4" class="header">
      <v-container class="header-content">
        <div class="header-left">
          <div class="logo">
            <v-icon size="32" color="white">mdi-rocket-launch</v-icon>
            <span class="logo-text">uni-load</span>
          </div>
          <div class="subtitle">AI站点自动配置工具</div>
        </div>

        <div class="header-right">
          <!-- 导航菜单 -->
          <v-tabs v-model="activeTab" bg-color="transparent" color="white" class="nav-tabs">
            <v-tab v-for="route in routes" :key="route.path" :value="route.path" :to="route.path" class="nav-tab">
              <v-icon size="18" class="nav-icon">{{ route.icon }}</v-icon>
              <span class="nav-text">{{ route.name }}</span>
            </v-tab>
          </v-tabs>

          <!-- 头部操作 -->
          <div class="header-actions">
            <!-- 主题切换 -->
            <v-btn
              icon
              variant="text"
              color="white"
              size="small"
              @click="toggleTheme"
              :title="isDark ? '切换到亮色主题' : '切换到暗色主题'">
              <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
            </v-btn>

            <!-- 系统状态 -->
            <div class="status-indicator">
              <v-tooltip :text="systemStatusText" location="bottom">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" size="16" :color="statusColor" class="status-icon"> mdi-circle </v-icon>
                </template>
              </v-tooltip>
            </div>
          </div>
        </div>
      </v-container>
    </v-app-bar>

    <!-- 主要内容区域 -->
    <v-main class="main-content">
      <v-container class="main-container">
        <slot />
      </v-container>
    </v-main>

    <!-- 页脚 -->
    <v-footer app color="surface" class="footer" elevation="2">
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
            color="on-surface"
            :href="link.url"
            target="_blank"
            class="footer-link">
            <v-icon size="14" class="link-icon">{{ link.icon }}</v-icon>
            {{ link.text }}
          </v-btn>
        </div>
      </div>
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
    text: '文档',
    icon: 'mdi-book-open-variant',
    url: 'https://github.com',
  },
  {
    text: '支持',
    icon: 'mdi-forum',
    url: 'https://github.com',
  },
  {
    text: '反馈',
    icon: 'mdi-bug',
    url: 'https://github.com',
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

/* 头部样式 */
.header {
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)) 0%, rgb(var(--v-theme-secondary)) 100%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
  backdrop-filter: blur(10px) !important;
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
  font-size: 1.5rem;
  font-weight: 600;
  background: linear-gradient(135deg, #ffffff 0%, #e0e7ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.subtitle {
  font-size: 0.875rem;
  opacity: 0.9;
  font-weight: 400;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 导航样式 */
.nav-tabs {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(5px);
  padding: 4px;
}

.nav-tab {
  text-transform: none;
  letter-spacing: 0.5px;
  font-weight: 500;
  min-width: unset;
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 0.3s ease;
  color: rgba(255, 255, 255, 0.8) !important;
}

.nav-tab:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff !important;
}

.nav-tab.v-tab--selected {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff !important;
  font-weight: 600;
}

.nav-icon {
  margin-right: 4px;
}

.nav-text {
  font-size: 0.875rem;
}

/* 头部操作 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  position: relative;
}

.status-icon {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.8);
  }
}

/* 主要内容区域 */
.main-content {
  background: transparent;
}

.main-container {
  padding: 24px 16px;
}

/* 页脚样式 */
.footer {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  max-width: 100%;
  width: 100%;
  margin: 0 auto;
}

.footer-info {
  flex: 0 1 auto;
  min-width: unset;
  margin-right: 16px;
}

.footer-text {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8rem;
  white-space: nowrap;
}

.footer-links {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 0 1 auto;
  max-width: 200px;
  justify-content: flex-end;
}

.footer-link {
  text-transform: none;
  letter-spacing: 0.5px;
  font-weight: 500;
  font-size: 0.8rem;
  padding: 4px 8px;
  min-width: unset;
}

.link-icon {
  margin-right: 4px;
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

  .main-container {
    padding: 16px 8px;
  }

  .footer-content {
    flex-direction: column;
    text-align: center;
    gap: 6px;
    padding: 8px 12px;
  }

  .footer-info {
    margin-right: 0;
    margin-bottom: 2px;
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
    max-width: 180px;
    margin: 0 auto;
  }

  .footer-link {
    font-size: 0.7rem;
    padding: 1px 4px;
  }
}

@media (max-width: 480px) {
  .logo-text {
    font-size: 1.2rem;
  }

  .subtitle {
    font-size: 0.75rem;
  }

  .header-actions {
    gap: 4px;
  }

  .nav-tab {
    padding: 0 8px;
  }

  .footer-content {
    gap: 4px;
    padding: 6px 8px;
  }

  .footer-links {
    gap: 3px;
    max-width: 160px;
  }

  .footer-link {
    font-size: 0.65rem;
    padding: 1px 3px;
  }

  .link-icon {
    margin-right: 1px;
    font-size: 12px;
  }
}

/* 暗色主题优化 */
.v-theme--dark .footer {
  background: rgba(0, 0, 0, 0.3) !important;
  border-top-color: rgba(255, 255, 255, 0.1);
}

.v-theme--dark .footer-text {
  color: rgba(255, 255, 255, 0.6);
}
</style>
