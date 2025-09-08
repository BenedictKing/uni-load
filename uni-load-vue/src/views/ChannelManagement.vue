<template>
  <div class="page-container">
    <div class="content-wrapper">
      <!-- 页面头部 -->
      <v-card class="page-header" rounded="lg">
        <v-card-text class="header-content">
          <div class="header-info">
            <div class="d-flex align-center gap-3">
              <v-icon size="32" color="primary">mdi-connection</v-icon>
              <div>
                <h2 class="text-h4 font-weight-bold mb-1 text-on-surface">渠道管理</h2>
                <p class="text-body-2 opacity-90 text-on-surface">管理AI渠道、查看健康状态、执行维护操作</p>
              </div>
            </div>
          </div>
          <div class="header-actions">
            <v-btn
              @click="refreshData"
              color="primary"
              variant="outlined"
              :loading="isLoading"
              class="action-btn"
            >
              <v-icon class="mr-2">mdi-refresh</v-icon>
              刷新
            </v-btn>
            <v-btn
              @click="showHealthCheck = !showHealthCheck"
              color="primary"
              variant="outlined"
              class="action-btn"
            >
              <v-icon class="mr-2">mdi-heart-pulse</v-icon>
              健康检查
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <!-- 健康监控面板 -->
      <v-card class="content-panel" rounded="lg">
        <v-card-text class="pa-0">
          <div class="panel-header">
            <div class="d-flex align-center gap-2">
              <v-icon size="24" color="primary">mdi-stethoscope</v-icon>
              <h3 class="text-h6 font-weight-medium mb-0">渠道健康监控</h3>
            </div>
            <div class="panel-controls">
              <v-btn
                @click="toggleHealthMonitor"
                :color="healthStatus?.hasInterval ? 'error' : 'primary'"
                :variant="healthStatus?.hasInterval ? 'flat' : 'outlined'"
                size="small"
              >
                {{ healthStatus?.hasInterval ? '停止监控' : '启动监控' }}
              </v-btn>
              <v-btn
                @click="showFailedChannels"
                color="warning"
                variant="outlined"
                size="small"
              >
                <v-icon class="mr-1">mdi-alert</v-icon>
                失败渠道
              </v-btn>
            </div>
          </div>
          <div class="panel-content">
            <v-alert
              v-if="healthStatus"
              :type="healthStatus.isRunning ? 'info' : healthStatus.hasInterval ? 'success' : 'error'"
              variant="tonal"
            >
              <template v-slot:prepend>
                <v-icon :icon="healthStatus.isRunning ? 'mdi-sync' : healthStatus.hasInterval ? 'mdi-check-circle' : 'mdi-close-circle'"></v-icon>
              </template>
              <template v-slot:text>
                <div class="status-info">
                  <div class="status-text">
                    {{ getHealthStatusText(healthStatus) }}
                  </div>
                  <div class="status-details">
                    <div class="detail-item">
                      <v-icon size="16" class="mr-1">mdi-clock-outline</v-icon>
                      检查间隔: {{ healthStatus.intervalMinutes }} 分钟
                    </div>
                    <div class="detail-item">
                      <v-icon size="16" class="mr-1">mdi-alert-circle-outline</v-icon>
                      失败阈值: {{ healthStatus.failureThreshold }} 次
                    </div>
                    <div v-if="healthStatus.failureCount > 0" class="detail-item text-error">
                      <v-icon size="16" class="mr-1">mdi-alert</v-icon>
                      {{ healthStatus.failureCount }} 个渠道存在失败记录
                    </div>
                    <div v-if="healthStatus.nextCheck" class="detail-item">
                      <v-icon size="16" class="mr-1">mdi-calendar-clock</v-icon>
                      下次检查: {{ formatTime(healthStatus.nextCheck) }}
                    </div>
                  </div>
                </div>
              </template>
            </v-alert>

            <v-alert v-else type="info" variant="tonal">
              <template v-slot:text>
                <div class="d-flex align-center">
                  <v-progress-circular indeterminate size="16" class="mr-2"></v-progress-circular>
                  获取健康状态...
                </div>
              </template>
            </v-alert>
          </div>
        </v-card-text>
      </v-card>

      <!-- 渠道列表 -->
      <v-card class="content-panel" rounded="lg">
        <v-card-text class="pa-0">
          <div class="panel-header">
            <div class="d-flex align-center gap-2">
              <v-icon size="24" color="primary">mdi-format-list-bulleted</v-icon>
              <h3 class="text-h6 font-weight-medium mb-0">已配置的渠道</h3>
            </div>
            <div class="search-filter">
              <v-text-field
                v-model="searchQuery"
                label="搜索渠道..."
                variant="outlined"
                density="compact"
                hide-details
                class="search-input"
              >
                <template v-slot:prepend-inner>
                  <v-icon size="18">mdi-magnify</v-icon>
                </template>
              </v-text-field>
              <v-select
                v-model="filterType"
                :items="[
                  { title: '所有类型', value: '' },
                  { title: 'OpenAI', value: 'openai' },
                  { title: 'Anthropic', value: 'anthropic' },
                  { title: 'Gemini', value: 'gemini' }
                ]"
                variant="outlined"
                density="compact"
                hide-details
                class="filter-select"
              />
            </div>
          </div>

          <div class="panel-content">
            <div v-if="filteredChannels.length === 0" class="empty-state">
              <v-icon size="64" color="grey-lighten-2">mdi-inbox</v-icon>
              <p class="text-body-1 text-grey mt-4">
                {{ searchQuery || filterType ? '没有找到匹配的渠道' : '暂无已配置的渠道' }}
              </p>
            </div>

            <div v-else class="channels-grid">
              <v-card
                v-for="channel in filteredChannels"
                :key="channel.name"
                class="channel-card"
                :class="getChannelTypeClass(channel)"
                elevation="2"
              >
                <v-card-text>
                  <div class="card-header">
                    <div class="channel-info">
                      <h4 class="channel-name">{{ channel.name }}</h4>
                      <v-chip
                        :color="getChannelTypeColor(channel)"
                        size="small"
                        class="channel-type-badge"
                      >
                        {{ getChannelTypeLabel(channel) }}
                      </v-chip>
                    </div>
                    <div class="channel-status">
                      <v-tooltip :text="getChannelHealthText(channel)" location="top">
                        <template v-slot:activator="{ props }">
                          <v-icon
                            v-bind="props"
                            :color="getChannelHealthColor(channel)"
                            size="20"
                          >
                            mdi-circle
                          </v-icon>
                        </template>
                      </v-tooltip>
                    </div>
                  </div>

                  <div class="card-content">
                    <div class="channel-details">
                      <div class="detail-item">
                        <v-icon size="16" class="mr-2">mdi-map-marker</v-icon>
                        <span class="detail-label">站点:</span>
                        <span class="detail-value">{{ getSiteName(channel) }}</span>
                      </div>
                      <div class="detail-item">
                        <v-icon size="16" class="mr-2">mdi-server</v-icon>
                        <span class="detail-label">实例:</span>
                        <span class="detail-value">{{ channel._instance?.name || 'N/A' }}</span>
                      </div>
                      <div class="detail-item">
                        <v-icon size="16" class="mr-2">mdi-link</v-icon>
                        <span class="detail-label">上游:</span>
                        <span class="detail-value">{{ channel.upstreams?.[0]?.url || 'N/A' }}</span>
                      </div>
                      <div v-if="channel.lastCheck" class="detail-item">
                        <v-icon size="16" class="mr-2">mdi-clock</v-icon>
                        <span class="detail-label">最后检查:</span>
                        <span class="detail-value">{{ formatTime(channel.lastCheck) }}</span>
                      </div>
                    </div>
                  </div>

                  <v-divider></v-divider>

                  <div class="card-actions">
                    <div class="action-group">
                      <v-btn
                        @click="reassignChannel(channel.name, 'promote')"
                        color="info"
                        variant="outlined"
                        size="small"
                        class="promote-btn"
                      >
                        <v-icon size="16" class="mr-1">mdi-arrow-up</v-icon>
                        提级
                      </v-btn>
                      <v-btn
                        @click="reassignChannel(channel.name, 'demote')"
                        color="warning"
                        variant="outlined"
                        size="small"
                        class="demote-btn"
                      >
                        <v-icon size="16" class="mr-1">mdi-arrow-down</v-icon>
                        降级
                      </v-btn>
                    </div>
                    <div class="action-group">
                      <v-btn
                        @click="showUpdateModal(channel)"
                        color="success"
                        variant="outlined"
                        size="small"
                        class="update-btn"
                      >
                        <v-icon size="16" class="mr-1">mdi-refresh</v-icon>
                        更新
                      </v-btn>
                      <v-btn
                        @click="deleteChannel(channel.name)"
                        color="error"
                        variant="outlined"
                        size="small"
                        class="delete-btn"
                      >
                        <v-icon size="16" class="mr-1">mdi-delete</v-icon>
                        删除
                      </v-btn>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- 更新渠道模态框 -->
    <v-dialog
      v-model="showUpdateModalVisible"
      max-width="500"
      persistent
    >
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon size="24" class="mr-2">mdi-refresh</v-icon>
          更新渠道配置
          <v-spacer></v-spacer>
          <v-btn
            icon
            variant="text"
            size="small"
            @click="closeUpdateModal"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-card-text>
          <div class="info-group mb-4">
            <label class="text-body-2 font-weight-medium mb-2 d-block">渠道名称</label>
            <div class="info-display">{{ selectedChannel?.name }}</div>
          </div>
          
          <div class="info-group mb-4">
            <label class="text-body-2 font-weight-medium mb-2 d-block">原始地址</label>
            <div class="info-display">{{ selectedChannel?.upstreams?.[0]?.url }}</div>
          </div>
          
          <div class="form-group mb-4">
            <label class="text-body-2 font-weight-medium mb-2 d-block">
              <v-icon size="16" class="mr-1">mdi-key</v-icon>
              API 密钥 (可选)
            </label>
            <v-textarea
              v-model="updateForm.apiKeys"
              variant="outlined"
              density="comfortable"
              rows="4"
              placeholder="留空则保持现有密钥不变&#10;如需添加新密钥，请输入:&#10;sk-xxx...&#10;sk-yyy..."
              hint="留空则保持现有API密钥不变，填写则会添加新的密钥到现有密钥中"
              persistent-hint
            />
          </div>
        </v-card-text>

        <v-card-actions>
          <v-btn
            @click="submitUpdate"
            color="primary"
            variant="flat"
            :loading="isUpdating"
            block
          >
            <v-icon class="mr-2">mdi-refresh</v-icon>
            更新配置
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useApi, usePaginatedApi } from '@/composables/useApi'
import { Api } from '@/api'
import type { Channel, SiteGroup } from '@/types/api'

// 响应式数据
const channels = ref<Channel[]>([])
const healthStatus = ref<any>(null)
const isLoading = ref(false)
const searchQuery = ref('')
const filterType = ref('')
const showHealthCheck = ref(false)

// 模态框相关
const showUpdateModalVisible = ref(false)
const selectedChannel = ref<Channel | null>(null)
const isUpdating = ref(false)
const updateForm = reactive({
  apiKeys: ''
})

// API 调用
const { data: channelsData, execute: loadChannels } = useApi(
  () => Api.Channel.getChannels(),
  { immediate: false }
)

const { data: healthData, execute: loadHealthStatus } = useApi(
  () => Api.Service.getServiceStatus(),
  { immediate: false }
)

// 计算属性
const filteredChannels = computed(() => {
  let filtered = channels.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(channel => 
      channel.name.toLowerCase().includes(query) ||
      channel.upstreams?.[0]?.url.toLowerCase().includes(query)
    )
  }

  if (filterType.value) {
    filtered = filtered.filter(channel => {
      const channelType = getChannelType(channel)
      return channelType === filterType.value
    })
  }

  return filtered
})

// 获取渠道类型
const getChannelType = (channel: Channel) => {
  const parts = channel.name.split('-')
  return parts[parts.length - 1]
}

// 获取渠道类型标签
const getChannelTypeLabel = (channel: Channel) => {
  const type = getChannelType(channel)
  const typeMap: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini'
  }
  return typeMap[type] || type.toUpperCase()
}

// 获取渠道类型样式类
const getChannelTypeClass = (channel: Channel) => {
  const type = getChannelType(channel)
  return type.toLowerCase()
}

// 获取站点名称
const getSiteName = (channel: Channel) => {
  const parts = channel.name.split('-')
  return parts.slice(0, -1).join('-')
}

// 获取渠道类型颜色
const getChannelTypeColor = (channel: Channel) => {
  const type = getChannelType(channel)
  const colorMap: Record<string, string> = {
    openai: 'green',
    anthropic: 'purple',
    gemini: 'blue'
  }
  return colorMap[type] || 'grey'
}

// 获取渠道健康状态颜色
const getChannelHealthColor = (channel: Channel) => {
  // 这里可以根据渠道的实际健康状态返回不同的颜色
  return 'success' // 默认显示为健康
}

// 获取健康状态样式类
const getHealthStatusClass = (status: any) => {
  if (status.isRunning) return 'running'
  if (status.hasInterval) return 'idle'
  return 'stopped'
}

// 获取健康状态文本
const getHealthStatusText = (status: any) => {
  if (status.isRunning) return '正在检查渠道健康...'
  if (status.hasInterval) return `监控运行中，每 ${status.intervalMinutes} 分钟检查一次`
  return '监控已停止'
}

// 获取渠道健康状态类
const getChannelHealthClass = (channel: Channel) => {
  // 这里可以根据渠道的实际健康状态返回不同的类
  return 'healthy' // 默认显示为健康
}

// 获取渠道健康状态文本
const getChannelHealthText = (channel: Channel) => {
  return '渠道状态正常'
}

// 格式化时间
const formatTime = (time: string | Date) => {
  const date = new Date(time)
  return date.toLocaleString()
}

// 刷新数据
const refreshData = async () => {
  isLoading.value = true
  try {
    await Promise.all([
      loadChannels(),
      loadHealthStatus()
    ])
    
    if (channelsData.value) {
      channels.value = channelsData.value
    }
    
    if (healthData.value) {
      healthStatus.value = (healthData.value as any).channelHealth
    }
  } catch (error) {
    console.error('刷新数据失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 切换健康监控
const toggleHealthMonitor = async () => {
  try {
    const action = healthStatus.value?.hasInterval ? 'stop' : 'start'
    await Api.Service.controlChannelHealth({ action })
    await refreshData()
  } catch (error) {
    console.error('切换健康监控失败:', error)
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

    message += '\n是否要重置所有失败计数?'

    if (confirm(message)) {
      await resetAllChannelFailures()
    }
  } catch (error) {
    console.error('获取失败渠道失败:', error)
  }
}

// 重置所有渠道失败计数
const resetAllChannelFailures = async () => {
  try {
    await Api.Service.resetChannelFailures()
    alert('✅ 重置成功')
    await refreshData()
  } catch (error) {
    console.error('重置失败计数失败:', error)
  }
}

// 重新分配渠道
const reassignChannel = async (channelName: string, action: 'promote' | 'demote') => {
  const actionText = action === 'promote' ? '提级' : '降级'
  if (!confirm(`您确定要对渠道 "${channelName}" 执行 ${actionText} 操作吗？`)) {
    return
  }

  try {
    await Api.Channel.reassignChannel({ channelName, action })
    alert(`✅ ${actionText}成功`)
    await refreshData()
  } catch (error) {
    console.error(`${actionText}失败:`, error)
  }
}

// 显示更新模态框
const showUpdateModal = (channel: Channel) => {
  selectedChannel.value = channel
  updateForm.apiKeys = ''
  showUpdateModalVisible.value = true
}

// 关闭更新模态框
const closeUpdateModal = () => {
  showUpdateModalVisible.value = false
  selectedChannel.value = null
  updateForm.apiKeys = ''
}

// 提交更新
const submitUpdate = async () => {
  if (!selectedChannel.value) return

  try {
    isUpdating.value = true
    
    const channelType = getChannelType(selectedChannel.value)
    const apiKeys = updateForm.apiKeys.trim() ? 
      updateForm.apiKeys.split(/[\n\r\s,;]+/).filter(k => k.trim()) : 
      []

    await Api.Channel.updateChannelConfig({
      baseUrl: selectedChannel.value.upstreams?.[0]?.url || '',
      channelTypes: [channelType],
      targetChannelName: selectedChannel.value.name,
      operationType: 'update',
      apiKeys: apiKeys.length > 0 ? apiKeys : undefined
    })

    alert('✅ 更新成功')
    closeUpdateModal()
    await refreshData()
  } catch (error) {
    console.error('更新失败:', error)
  } finally {
    isUpdating.value = false
  }
}

// 删除渠道
const deleteChannel = async (channelName: string) => {
  if (!confirm(`您确定要彻底删除渠道 "${channelName}" 吗？\n\n此操作不可逆！`)) {
    return
  }

  try {
    await Api.Channel.deleteChannel(channelName)
    alert(`✅ 渠道 "${channelName}" 已成功删除`)
    await refreshData()
  } catch (error) {
    console.error('删除失败:', error)
  }
}

// 初始化
onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.page-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-header {
  padding: 1rem;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0;
}

.header-info h2 {
  font-size: 1.8rem;
}

.content-panel {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 16px !important;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.panel-content {
  padding: 1.5rem;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-text {
  font-weight: 500;
}

.status-details {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.9rem;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.search-filter {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-input {
  width: 250px;
}

.filter-select {
  width: 180px;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.channels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1.5rem;
}

.channel-card {
  border-radius: 12px !important;
  overflow: hidden;
  transition: all 0.3s ease;
  position: relative;
  padding-left: 4px;
  border: none;
}

.channel-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background-color: grey;
}
.channel-card.openai::before { background-color: rgb(var(--v-theme-success)); }
.channel-card.anthropic::before { background-color: rgb(var(--v-theme-purple)); }
.channel-card.gemini::before { background-color: rgb(var(--v-theme-info)); }

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.channel-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.channel-name {
  font-size: 1.1rem;
  font-weight: 600;
}

.card-content .detail-label {
  font-weight: 500;
  min-width: 70px;
}

.card-content .detail-value {
  color: rgba(var(--v-theme-on-surface), 0.7);
  word-break: break-all;
}

.card-actions {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 1rem;
}

.action-group {
  display: flex;
  gap: 0.5rem;
}

.info-display {
  background: rgba(var(--v-border-color), 0.1);
  padding: 0.75rem;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  word-break: break-all;
}

@media (max-width: 768px) {
  .page-container { padding: 1rem; }
  .panel-header, .search-filter { flex-direction: column; align-items: stretch; }
  .search-input, .filter-select { width: 100%; }
}
</style>
