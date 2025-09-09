<template>
  <div class="service-status">
    <div class="status-container">
      <!-- 页面头部 -->
      <v-card class="content-panel page-header" rounded="lg">
        <v-card-text class="header-content">
          <div class="header-info">
            <div class="d-flex align-center gap-6">
              <v-icon size="32" color="primary">mdi-chart-line</v-icon>
              <div>
                <h2 class="text-h4 font-weight-bold mb-1 text-on-surface">服务状态</h2>
                <p class="text-body-2 opacity-90 text-on-surface">监控系统服务运行状态，执行维护操作</p>
              </div>
            </div>
          </div>
          <div class="header-actions">
            <v-btn
              @click="refreshAllStatus"
              color="primary"
              variant="outlined"
              :loading="isRefreshing"
              class="action-btn">
              <v-icon class="mr-2">mdi-refresh</v-icon>
              刷新状态
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <!-- 模型同步服务 -->
      <v-card class="content-panel service-panel" rounded="lg">
        <v-card-text class="pa-0">
          <div class="panel-header">
            <div class="panel-title">
              <div class="d-flex align-center gap-2">
                <v-icon size="20" :color="getSyncStatusColor()">{{ getSyncStatusIcon() }}</v-icon>
                <h3 class="text-h6 font-weight-medium mb-0">模型同步服务</h3>
              </div>
            </div>
            <div class="panel-controls">
              <v-btn
                @click="triggerManualSync"
                :color="getSyncStatusColor()"
                variant="outlined"
                size="small"
                :loading="isSyncing">
                <v-icon class="mr-1">mdi-sync</v-icon>
                手动同步
              </v-btn>
              <v-btn
                @click="toggleSyncService"
                :color="syncStatus?.hasInterval ? 'error' : 'primary'"
                :variant="syncStatus?.hasInterval ? 'flat' : 'outlined'"
                size="small">
                {{ syncStatus?.hasInterval ? '停止服务' : '启动服务' }}
              </v-btn>
              <v-btn @click="cleanupAndReset" color="warning" variant="outlined" size="small">
                <v-icon class="mr-1">mdi-delete</v-icon>
                清理重置
              </v-btn>
            </div>
          </div>

          <div class="service-status-content">
            <v-alert v-if="syncStatus" :type="getSyncStatusVuetifyType()" variant="tonal" class="status-details">
              <template v-slot:text>
                <div class="status-info">
                  <div class="info-item">
                    <span class="info-label">服务状态:</span>
                    <span class="info-value">{{
                      syncStatus.isRunning ? '正在同步' : syncStatus.hasInterval ? '运行中' : '已停止'
                    }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">同步间隔:</span>
                    <span class="info-value">{{ syncStatus.intervalMinutes }} 分钟</span>
                  </div>
                  <div v-if="syncStatus.nextSync" class="info-item">
                    <span class="info-label">下次同步:</span>
                    <span class="info-value">{{ formatTime(syncStatus.nextSync) }}</span>
                  </div>
                </div>
              </template>
            </v-alert>

            <v-alert v-else type="info" variant="tonal">
              <template v-slot:text>
                <div class="d-flex align-center">
                  <v-progress-circular indeterminate size="16" class="mr-2"></v-progress-circular>
                  获取同步服务状态...
                </div>
              </template>
            </v-alert>
          </div>
        </v-card-text>
      </v-card>

      <!-- 渠道健康监控 -->
      <v-card class="content-panel service-panel" rounded="lg">
        <v-card-text class="pa-0">
          <div class="panel-header">
            <div class="panel-title">
              <div class="d-flex align-center gap-2">
                <v-icon size="20" :color="getHealthStatusColor()">{{ getHealthStatusIcon() }}</v-icon>
                <h3 class="text-h6 font-weight-medium mb-0">渠道健康监控</h3>
              </div>
            </div>
            <div class="panel-controls">
              <v-btn
                @click="triggerChannelCheck"
                :color="getHealthStatusColor()"
                variant="outlined"
                size="small"
                :loading="isChecking">
                <v-icon class="mr-1">mdi-heart-pulse</v-icon>
                健康检查
              </v-btn>
              <v-btn
                @click="toggleHealthMonitor"
                :color="healthStatus?.hasInterval ? 'error' : 'primary'"
                :variant="healthStatus?.hasInterval ? 'flat' : 'outlined'"
                size="small">
                {{ healthStatus?.hasInterval ? '停止监控' : '启动监控' }}
              </v-btn>
              <v-btn @click="showFailedChannels" color="warning" variant="outlined" size="small">
                <v-icon class="mr-1">mdi-alert</v-icon>
                失败渠道
              </v-btn>
            </div>
          </div>

          <div class="service-status-content">
            <v-alert v-if="healthStatus" :type="getHealthStatusVuetifyType()" variant="tonal" class="status-details">
              <template v-slot:text>
                <div class="status-info">
                  <div class="info-item">
                    <span class="info-label">监控状态:</span>
                    <span class="info-value">{{
                      healthStatus.isRunning ? '正在检查' : healthStatus.hasInterval ? '监控中' : '已停止'
                    }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">检查间隔:</span>
                    <span class="info-value">{{ healthStatus.intervalMinutes }} 分钟</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">失败阈值:</span>
                    <span class="info-value">{{ healthStatus.failureThreshold }} 次</span>
                  </div>
                  <div v-if="healthStatus.failureCount > 0" class="info-item">
                    <span class="info-label text-error">失败计数:</span>
                    <span class="info-value text-error">{{ healthStatus.failureCount }} 个渠道</span>
                  </div>
                  <div v-if="healthStatus.nextCheck" class="info-item">
                    <span class="info-label">下次检查:</span>
                    <span class="info-value">{{ formatTime(healthStatus.nextCheck) }}</span>
                  </div>
                </div>
              </template>
            </v-alert>

            <v-alert v-else type="info" variant="tonal">
              <template v-slot:text>
                <div class="d-flex align-center">
                  <v-progress-circular indeterminate size="16" class="mr-2"></v-progress-circular>
                  获取健康监控状态...
                </div>
              </template>
            </v-alert>
          </div>
        </v-card-text>
      </v-card>

      <!-- 临时分组清理 -->
      <v-card class="content-panel service-panel" rounded="lg">
        <v-card-text class="pa-0">
          <div class="panel-header">
            <div class="panel-title">
              <div class="d-flex align-center gap-2">
                <v-icon size="20" :color="getTempGroupStatusColor()">{{ getTempGroupStatusIcon() }}</v-icon>
                <h3 class="text-h6 font-weight-medium mb-0">临时分组清理</h3>
              </div>
            </div>
            <div class="panel-controls">
              <v-btn
                @click="refreshTempGroupStats"
                color="info"
                variant="outlined"
                size="small"
                :loading="isTempGroupLoading">
                <v-icon class="mr-1">mdi-refresh</v-icon>
                刷新统计
              </v-btn>
              <v-btn @click="cleanupOldTempGroups" color="secondary" variant="outlined" size="small">
                <v-icon class="mr-1">mdi-clock-outline</v-icon>
                清理24小时前
              </v-btn>
              <v-btn @click="cleanupAllTempGroups" color="warning" variant="outlined" size="small">
                <v-icon class="mr-1">mdi-delete</v-icon>
                清理所有分组
              </v-btn>
            </div>
          </div>

          <div class="service-status-content">
            <div v-if="tempGroupStats" class="temp-group-stats">
              <v-alert v-if="tempGroupStats.totalTempGroups === 0" type="success" variant="tonal" class="mb-0">
                <template v-slot:text>
                  <div class="d-flex align-center">
                    <v-icon class="mr-2">mdi-check-circle</v-icon>
                    无临时分组需要清理
                  </div>
                </template>
              </v-alert>

              <div v-else class="temp-group-details">
                <div class="stats-summary">
                  <span class="stats-number">{{ tempGroupStats.totalTempGroups }}</span>
                  <span class="stats-label">个临时分组需要清理</span>
                </div>
                <div class="instance-stats">
                  <v-expansion-panels>
                    <v-expansion-panel v-for="instance in tempGroupStats.instanceStats" :key="instance.instanceName">
                      <v-expansion-panel-title>
                        <div class="d-flex align-center">
                          <strong>{{ instance.instanceName }}:</strong>
                          <span class="instance-count ml-2">{{ instance.tempGroups.length }} 个分组</span>
                        </div>
                      </v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <div class="temp-groups-list">
                          <div v-for="group in instance.tempGroups" :key="group.id" class="temp-group-item">
                            <v-icon size="16" class="mr-2">
                              {{ group.name.startsWith('debug-models-') ? 'mdi-tools' : 'mdi-flask' }}
                            </v-icon>
                            <span class="group-name">{{ group.name }}</span>
                            <span class="group-id ml-2 text-caption">(ID: {{ group.id }})</span>
                          </div>
                        </div>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>
                </div>
              </div>
            </div>

            <v-alert v-else type="info" variant="tonal">
              <template v-slot:text>
                <div class="d-flex align-center">
                  <v-progress-circular indeterminate size="16" class="mr-2"></v-progress-circular>
                  获取临时分组统计...
                </div>
              </template>
            </v-alert>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- 通知 Snackbar -->
    <v-snackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="4000"
      location="top"
      elevation="24">
      {{ snackbarText }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snackbar = false">
          关闭
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useApi } from '@/composables/useApi'
import { Api } from '@/api'
import type { 
  ServiceStatus, 
  SystemInfoResponse, 
  ModelSyncStatus, 
  ChannelHealthStatus, 
  TempGroupStats 
} from '@/types/api'

// 响应式数据
const syncStatus = ref<ModelSyncStatus | null>(null)
const healthStatus = ref<ChannelHealthStatus | null>(null)
const tempGroupStats = ref<TempGroupStats | null>(null)

// 加载状态
const isRefreshing = ref(false)
const isSyncing = ref(false)
const isChecking = ref(false)
const isTempGroupLoading = ref(false)

// 通知状态
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

// 显示通知
const showNotification = (text: string, color: string = 'success') => {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

// 定时刷新
let refreshInterval: number | null = null

// 计算属性
const overallStatus = computed(() => {
  const hasError = healthStatus.value?.failureCount > 0
  const isServiceDown = !syncStatus.value?.hasInterval && !healthStatus.value?.hasInterval

  if (hasError) {
    return {
      class: 'warning',
      icon: '⚠️',
      text: '存在警告',
    }
  }

  if (isServiceDown) {
    return {
      class: 'error',
      icon: '❌',
      text: '服务异常',
    }
  }

  return {
    class: 'healthy',
    icon: '✅',
    text: '运行正常',
  }
})

// API 调用
const { execute: loadServiceStatus } = useApi(() => Api.Service.getStatus(), { immediate: false })

const { execute: loadTempGroupStats } = useApi(() => Api.Maintenance.getTempGroupStats(), { immediate: false })

// 获取同步状态颜色
const getSyncStatusColor = () => {
  if (!syncStatus.value) return 'grey'
  if (syncStatus.value.isRunning) return 'info'
  if (syncStatus.value.hasInterval) return 'success'
  return 'error'
}

// 获取同步状态图标
const getSyncStatusIcon = () => {
  if (!syncStatus.value) return 'mdi-help-circle'
  if (syncStatus.value.isRunning) return 'mdi-sync'
  if (syncStatus.value.hasInterval) return 'mdi-check-circle'
  return 'mdi-close-circle'
}

// 获取同步状态 Vuetify 类型
const getSyncStatusVuetifyType = () => {
  if (!syncStatus.value) return 'info'
  if (syncStatus.value.isRunning) return 'info'
  if (syncStatus.value.hasInterval) return 'success'
  return 'error'
}

// 获取健康状态颜色
const getHealthStatusColor = () => {
  if (!healthStatus.value) return 'grey'
  if (healthStatus.value.isRunning) return 'info'
  if (healthStatus.value.hasInterval) return 'success'
  return 'error'
}

// 获取健康状态图标
const getHealthStatusIcon = () => {
  if (!healthStatus.value) return 'mdi-help-circle'
  if (healthStatus.value.isRunning) return 'mdi-heart-pulse'
  if (healthStatus.value.hasInterval) return 'mdi-check-circle'
  return 'mdi-close-circle'
}

// 获取健康状态 Vuetify 类型
const getHealthStatusVuetifyType = () => {
  if (!healthStatus.value) return 'info'
  if (healthStatus.value.isRunning) return 'info'
  if (healthStatus.value.hasInterval) return 'success'
  return 'error'
}

// 获取临时分组状态颜色
const getTempGroupStatusColor = () => {
  if (!tempGroupStats.value) return 'grey'
  return tempGroupStats.value.totalTempGroups > 0 ? 'warning' : 'success'
}

// 获取临时分组状态图标
const getTempGroupStatusIcon = () => {
  if (!tempGroupStats.value) return 'mdi-help-circle'
  return tempGroupStats.value.totalTempGroups > 0 ? 'mdi-alert' : 'mdi-check-circle'
}

// 刷新服务状态
const refreshServiceStatus = async () => {
  try {
    const response = await loadServiceStatus()
    if (response?.data) {
      syncStatus.value = response.data.modelSync || null
      healthStatus.value = response.data.channelHealth || null
    }
  } catch (error) {
    console.error('刷新服务状态失败:', error)
    // TODO: 使用更好的错误提示方式
  }
}

// 刷新临时分组统计
const refreshTempGroupStats = async () => {
  isTempGroupLoading.value = true
  try {
    const response = await loadTempGroupStats()
    if (response?.data) {
      tempGroupStats.value = response.data
    }
  } catch (error) {
    console.error('刷新临时分组统计失败:', error)
    // TODO: 使用更好的错误提示方式
  } finally {
    isTempGroupLoading.value = false
  }
}

// 清理和重置
const cleanupAndReset = async () => {
  if (!confirm('您确定要清理所有自动生成的模型分组和相关的uni-api配置吗？\n\n此操作不可逆！')) {
    return
  }

  try {
    await Api.Maintenance.cleanupModelGroups()
    showNotification('✅ 清理重置成功', 'success')
    await refreshServiceStatus()
  } catch (error) {
    console.error('清理重置失败:', error)
    showNotification('❌ 清理重置失败', 'error')
  }
}

// 刷新所有状态
const refreshAllStatus = async () => {
  isRefreshing.value = true
  try {
    await Promise.all([refreshServiceStatus(), refreshTempGroupStats()])
  } catch (error) {
    console.error('刷新状态失败:', error)
  } finally {
    isRefreshing.value = false
  }
}

// 手动触发渠道检查
const triggerChannelCheck = async () => {
  isChecking.value = true
  try {
    await Api.Service.triggerChannelCheck()
    showNotification('✅ 手动健康检查已启动', 'success')
    setTimeout(refreshServiceStatus, 2000)
  } catch (error) {
    console.error('手动健康检查失败:', error)
    showNotification('❌ 手动健康检查失败', 'error')
  } finally {
    isChecking.value = false
  }
}

// 切换健康监控
const toggleHealthMonitor = async () => {
  try {
    const action = healthStatus.value?.hasInterval ? 'stop' : 'start'
    await Api.Service.controlChannelHealth({ action })
    showNotification(`✅ 健康监控已${action === 'start' ? '启动' : '停止'}`, 'success')
    await refreshServiceStatus()
  } catch (error) {
    console.error('切换健康监控失败:', error)
    showNotification('❌ 切换健康监控失败', 'error')
  }
}

// 显示失败渠道
const showFailedChannels = async () => {
  try {
    const response = await Api.Service.getFailedChannels()

    if (response?.data?.length === 0) {
      alert('✅ 当前没有失败的渠道')
      return
    }

    let message = '🚨 失败的渠道列表:\n\n'
    response?.data?.forEach((channel: any) => {
      message += `• ${channel.name}: ${channel.failures}/${channel.threshold} 次失败`
      if (channel.willBeRemoved) {
        message += ' (将被移除)'
      }
      message += '\n'
    })

    alert(message)
  } catch (error) {
    console.error('获取失败渠道失败:', error)
  }
}

// 清理过期临时分组
const cleanupOldTempGroups = async () => {
  if (!confirm('您确定要清理24小时前创建的临时分组吗？')) {
    return
  }

  try {
    await Api.Maintenance.cleanupOldTempGroups({ hoursOld: 24 })
    alert('✅ 清理过期临时分组成功')
    await refreshTempGroupStats()
  } catch (error) {
    console.error('清理过期临时分组失败:', error)
  }
}

// 清理所有临时分组
const cleanupAllTempGroups = async () => {
  if (!confirm('您确定要清理所有临时分组吗？\n\n这将删除所有临时分组！')) {
    return
  }

  try {
    await Api.Maintenance.cleanupTempGroups({})
    alert('✅ 清理所有临时分组成功')
    await refreshTempGroupStats()
  } catch (error) {
    console.error('清理所有临时分组失败:', error)
  }
}

// 手动触发模型同步
const triggerManualSync = async () => {
  isSyncing.value = true
  try {
    await Api.Service.triggerManualSync()
    alert('✅ 手动同步已启动')
    setTimeout(refreshServiceStatus, 2000)
  } catch (error: any) {
    console.error('手动同步失败:', error)
    alert(`❌ 手动同步失败: ${error.response?.data?.message || error.message || '未知错误'}`)
  } finally {
    isSyncing.value = false
  }
}

// 切换模型同步服务
const toggleSyncService = async () => {
  try {
    const action = syncStatus.value?.hasInterval ? 'stop' : 'start'
    await Api.Service.controlModelSync({ action })
    alert(`✅ 模型同步服务已${action === 'start' ? '启动' : '停止'}`)
    await refreshServiceStatus()
  } catch (error: any) {
    console.error('切换同步服务失败:', error)
    alert(`❌ 切换同步服务失败: ${error.response?.data?.message || error.message || '未知错误'}`)
  }
}

// 格式化时间
const formatTime = (time: string | Date): string => {
  if (!time) return 'N/A'
  const date = new Date(time)
  return date.toLocaleString()
}

// 初始化和清理
onMounted(() => {
  refreshAllStatus()

  // 设置定时刷新
  refreshInterval = setInterval(() => {
    refreshAllStatus()
  }, 30000) // 每30秒刷新一次
})

onBeforeUnmount(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>
<style scoped>
.service-status {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.status-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* 统一的卡片样式 */
.content-panel {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 16px !important;
}

/* 页面头部样式 */
.page-header .header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1.5rem;
}

.page-header h2,
.page-header p {
  color: var(--v-theme-on-surface) !important;
}

.header-info h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.8rem;
  font-weight: 600;
}

.header-info p {
  margin: 0;
  opacity: 0.9;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  text-transform: none;
  letter-spacing: 0.5px;
  font-weight: 500;
}

/* 健康总览样式 */
.health-overview {
  padding: 2rem;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.health-overview h3 {
  margin: 0 0 1.5rem 0;
  font-size: 1.3rem;
  color: #333;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 12px;
  border: 2px solid transparent;
  transition: all 0.3s ease;
}

/* 服务面板样式 */
.service-panel {
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e5e9;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.panel-title h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

.panel-controls {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.service-status-content {
  padding: 2rem;
}

.status-details {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  border: 1px solid #e1e5e9;
}

.status-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #666;
}

.info-value {
  font-size: 0.9rem;
  color: #333;
}

/* 临时分组样式 */
.temp-group-stats {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  border: 1px solid #e1e5e9;
}

.temp-group-details {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.stats-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.stats-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--v-theme-warning);
}

.stats-label {
  font-weight: 600;
  color: #333;
}

.instance-stats {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.temp-groups-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.temp-group-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #666;
}

.group-name {
  font-weight: 500;
  color: #333;
}

.group-id {
  color: #999;
  font-size: 0.8rem;
}

/* 指标面板样式 */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  background: white;
  border-radius: 12px;
  border: 1px solid #e1e5e9;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.metric-content {
  flex: 1;
}

.metric-content h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: #333;
}

.metric-value {
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.metric-bar {
  width: 100%;
  height: 6px;
  background: #e1e5e9;
  border-radius: 3px;
  overflow: hidden;
}

/* 系统信息模态框样式 */
.system-info-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .service-status {
    padding: 1rem 0.5rem;
  }

  .page-header {
    padding: 1.5rem;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .health-overview,
  .service-status-content {
    padding: 1.5rem;
  }

  .panel-header {
    padding: 1rem 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .status-info {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .header-actions,
  .panel-controls {
    width: 100%;
    justify-content: center;
  }

  .status-card {
    flex-direction: column;
    text-align: center;
    gap: 0.5rem;
  }

  .metric-card {
    flex-direction: column;
    text-align: center;
    gap: 0.5rem;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }
}

/* 暗色主题优化 */
.v-theme--dark .health-overview,
.v-theme--dark .service-panel {
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.1);
}

.v-theme--dark .panel-header {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}

.v-theme--dark .status-details,
.v-theme--dark .temp-group-stats {
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.1);
}

.v-theme--dark .metric-card {
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.1);
}

.v-theme--dark .info-label {
  color: rgba(255, 255, 255, 0.7);
}

.v-theme--dark .info-value {
  color: rgba(255, 255, 255, 0.9);
}

.v-theme--dark .health-overview h3,
.v-theme--dark .panel-title h3 {
  color: rgba(255, 255, 255, 0.9);
}

.v-theme--dark .metric-content h4 {
  color: rgba(255, 255, 255, 0.9);
}

.v-theme--dark .metric-value {
  color: rgba(255, 255, 255, 0.7);
}
</style>
