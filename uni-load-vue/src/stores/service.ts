import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ServiceApi } from '@/api'

interface ServiceStatus {
  status: 'running' | 'stopped' | 'error'
  uptime: number
  memory: number
  cpu: number
  connections: number
  requests: number
  errors: number
  lastSync: string | null
  version: string
}

interface SystemMetrics {
  totalMemory: number
  usedMemory: number
  cpuUsage: number
  diskUsage: number
  networkIn: number
  networkOut: number
}

export const useServiceStore = defineStore('service', () => {
  // 状态
  const serviceStatus = ref<ServiceStatus>({
    status: 'stopped',
    uptime: 0,
    memory: 0,
    cpu: 0,
    connections: 0,
    requests: 0,
    errors: 0,
    lastSync: null,
    version: '1.0.0'
  })
  
  const systemMetrics = ref<SystemMetrics>({
    totalMemory: 0,
    usedMemory: 0,
    cpuUsage: 0,
    diskUsage: 0,
    networkIn: 0,
    networkOut: 0
  })
  
  const loading = ref(false)
  const error = ref<string | null>(null)
  const autoRefresh = ref(true)
  const refreshInterval = ref<number | null>(null)
  
  // 计算属性
  const isServiceRunning = computed(() => serviceStatus.value.status === 'running')
  const isServiceStopped = computed(() => serviceStatus.value.status === 'stopped')
  const isServiceError = computed(() => serviceStatus.value.status === 'error')
  
  const memoryUsagePercent = computed(() => {
    if (systemMetrics.value.totalMemory === 0) return 0
    return Math.round((systemMetrics.value.usedMemory / systemMetrics.value.totalMemory) * 100)
  })
  
  const uptimeFormatted = computed(() => {
    const uptime = serviceStatus.value.uptime
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    
    if (days > 0) {
      return `${days}天 ${hours}小时 ${minutes}分钟`
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`
    } else {
      return `${minutes}分钟`
    }
  })
  
  // 动作
  async function fetchServiceStatus() {
    loading.value = true
    error.value = null
    try {
      const response = await ServiceApi.getServiceStatus()
      if (response.data) {
        serviceStatus.value = response.data as ServiceStatus
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取服务状态失败'
      serviceStatus.value.status = 'error'
    } finally {
      loading.value = false
    }
  }
  
  async function fetchSystemMetrics() {
    try {
      const response = await ServiceApi.getMetrics()
      systemMetrics.value = response.data
    } catch (err) {
      console.warn('获取系统指标失败:', err)
    }
  }
  
  async function startModelSync() {
    loading.value = true
    error.value = null
    try {
      await ServiceApi.startModelSync()
      // 刷新状态
      await fetchServiceStatus()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '启动模型同步失败'
    } finally {
      loading.value = false
    }
  }
  
  async function stopModelSync() {
    loading.value = true
    error.value = null
    try {
      await ServiceApi.stopModelSync()
      await fetchServiceStatus()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '停止模型同步失败'
    } finally {
      loading.value = false
    }
  }
  
  async function restartService() {
    loading.value = true
    error.value = null
    try {
      await ServiceApi.restart()
      await fetchServiceStatus()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '重启服务失败'
    } finally {
      loading.value = false
    }
  }
  
  async function cleanupTempGroups() {
    loading.value = true
    error.value = null
    try {
      const response = await ServiceApi.cleanupTempGroups()
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : '清理临时组失败'
      throw err
    } finally {
      loading.value = false
    }
  }
  
  function startAutoRefresh(interval = 5000) {
    stopAutoRefresh()
    if (autoRefresh.value) {
      refreshInterval.value = setInterval(async () => {
        await Promise.all([
          fetchServiceStatus(),
          fetchSystemMetrics()
        ])
      }, interval)
    }
  }
  
  function stopAutoRefresh() {
    if (refreshInterval.value) {
      clearInterval(refreshInterval.value)
      refreshInterval.value = null
    }
  }
  
  function toggleAutoRefresh() {
    autoRefresh.value = !autoRefresh.value
    if (autoRefresh.value) {
      startAutoRefresh()
    } else {
      stopAutoRefresh()
    }
  }
  
  function clearError() {
    error.value = null
  }
  
  // 清理定时器
  function cleanup() {
    stopAutoRefresh()
  }
  
  return {
    // 状态
    serviceStatus,
    systemMetrics,
    loading,
    error,
    autoRefresh,
    
    // 计算属性
    isServiceRunning,
    isServiceStopped,
    isServiceError,
    memoryUsagePercent,
    uptimeFormatted,
    
    // 动作
    fetchServiceStatus,
    fetchSystemMetrics,
    startModelSync,
    stopModelSync,
    restartService,
    cleanupTempGroups,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh,
    clearError,
    cleanup,
  }
})