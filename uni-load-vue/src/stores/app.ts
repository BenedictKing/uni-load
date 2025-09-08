import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppStore = defineStore('app', () => {
  // 状态
  const loading = ref(false)
  const theme = ref<'light' | 'dark'>('light')
  const sidebarCollapsed = ref(false)
  
  // 计算属性
  const isDark = computed(() => theme.value === 'dark')
  const isLight = computed(() => theme.value === 'light')
  
  // 动作
  function setLoading(value: boolean) {
    loading.value = value
  }
  
  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    // 保存到localStorage
    try {
      localStorage.setItem('theme', theme.value)
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error)
    }
  }
  
  function setTheme(newTheme: 'light' | 'dark') {
    theme.value = newTheme
    try {
      localStorage.setItem('theme', newTheme)
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error)
    }
  }
  
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }
  
  function setSidebarCollapsed(collapsed: boolean) {
    sidebarCollapsed.value = collapsed
  }
  
  // 初始化主题
  function initTheme() {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      theme.value = savedTheme
    } else {
      // 检测系统主题偏好
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        theme.value = 'dark'
      }
    }
  }
  
  return {
    // 状态
    loading,
    theme,
    sidebarCollapsed,
    
    // 计算属性
    isDark,
    isLight,
    
    // 动作
    setLoading,
    toggleTheme,
    setTheme,
    toggleSidebar,
    setSidebarCollapsed,
    initTheme,
  }
})