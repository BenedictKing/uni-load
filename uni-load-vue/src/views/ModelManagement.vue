<template>
  <div class="page-container">
    <div class="content-wrapper">
      <!-- 页面头部 -->
      <v-card class="page-header" rounded="lg">
        <v-card-text class="header-content">
          <div class="header-info">
            <div class="d-flex align-center gap-3">
              <v-icon size="32" color="primary">mdi-robot</v-icon>
              <div>
                <h2 class="text-h4 font-weight-bold mb-1 text-on-surface">模型管理</h2>
                <p class="text-body-2 opacity-90 text-on-surface">查看和管理AI模型列表</p>
              </div>
            </div>
          </div>
          <div class="header-actions">
            <v-btn
              @click="refreshModels"
              color="primary"
              variant="outlined"
              :loading="isLoading"
              class="action-btn"
            >
              <v-icon class="mr-2">mdi-refresh</v-icon>
              刷新
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <!-- 搜索和筛选 -->
      <!-- 模型列表 -->
      <v-card class="content-panel" rounded="lg">
        <v-card-text class="pa-0">
          <div class="panel-header">
            <div class="d-flex align-center gap-2">
              <v-icon size="24" color="primary">mdi-format-list-bulleted</v-icon>
              <h3 class="text-h6 font-weight-medium mb-0">模型列表</h3>
            </div>
            <div class="search-controls">
              <v-text-field
                v-model="searchQuery"
                label="搜索模型..."
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
                v-model="filterProvider"
                :items="[
                  { title: '所有提供商', value: '' },
                  { title: 'OpenAI', value: 'openai' },
                  { title: 'Anthropic', value: 'anthropic' },
                  { title: 'Google', value: 'gemini' }
                ]"
                label="提供商"
                variant="outlined"
                density="compact"
                hide-details
                class="filter-select"
              />
            </div>
          </div>

          <div class="panel-content">
            <div v-if="filteredModels.length === 0" class="empty-state">
              <v-icon size="64" color="grey-lighten-2">mdi-robot</v-icon>
              <p class="text-body-1 text-grey mt-4">
                {{ searchQuery || filterProvider ? '没有找到匹配的模型' : '暂无模型数据' }}
              </p>
            </div>

            <div v-else class="models-grid">
              <v-card
                v-for="model in filteredModels"
                :key="model.id"
                class="model-card"
                :class="getProviderColor(model.provider)"
                elevation="2"
              >
                <v-card-text>
                  <div class="card-header">
                    <div class="model-info">
                      <h3 class="model-name">{{ model.name }}</h3>
                      <div class="model-badges">
                        <v-chip
                          :color="getProviderColor(model.provider)"
                          size="small"
                          class="provider-badge"
                        >
                          {{ getProviderLabel(model.provider) }}
                        </v-chip>
                        <v-chip
                          :color="model.isActive ? 'success' : 'error'"
                          variant="outlined"
                          size="small"
                          class="status-badge"
                        >
                          <v-icon size="14" class="mr-1">
                            {{ model.isActive ? 'mdi-check-circle' : 'mdi-close-circle' }}
                          </v-icon>
                          {{ model.isActive ? '活跃' : '未激活' }}
                        </v-chip>
                      </div>
                    </div>
                  </div>

                  <div class="card-content">
                    <div class="model-details">
                      <div class="detail-item">
                        <v-icon size="16" class="mr-2">mdi-identifier</v-icon>
                        <span class="detail-label">模型ID:</span>
                        <span class="detail-value">{{ model.id }}</span>
                      </div>
                      <div v-if="model.description" class="detail-item">
                        <v-icon size="16" class="mr-2">mdi-text</v-icon>
                        <span class="detail-label">描述:</span>
                        <span class="detail-value">{{ model.description }}</span>
                      </div>
                      <div v-if="model.maxTokens" class="detail-item">
                        <v-icon size="16" class="mr-2">mdi-counter</v-icon>
                        <span class="detail-label">最大令牌:</span>
                        <span class="detail-value">{{ model.maxTokens.toLocaleString() }}</span>
                      </div>
                      <div v-if="model.pricing" class="detail-item">
                        <v-icon size="16" class="mr-2">mdi-currency-usd</v-icon>
                        <span class="detail-label">定价:</span>
                        <span class="detail-value">
                          输入: ${{ model.pricing.input }}/1K · 输出: ${{ model.pricing.output }}/1K
                        </span>
                      </div>
                      <div v-if="model.createdAt" class="detail-item">
                        <v-icon size="16" class="mr-2">mdi-clock</v-icon>
                        <span class="detail-label">创建时间:</span>
                        <span class="detail-value">{{ formatTime(model.createdAt) }}</span>
                      </div>
                    </div>
                  </div>

                  <v-divider></v-divider>

                  <div class="card-actions">
                    <v-btn
                      v-if="!model.isActive"
                      @click="activateModel(model.id)"
                      color="success"
                      variant="outlined"
                      size="small"
                      class="activate-btn"
                    >
                      <v-icon size="16" class="mr-1">mdi-play</v-icon>
                      激活
                    </v-btn>
                    <v-btn
                      v-else
                      @click="deactivateModel(model.id)"
                      color="warning"
                      variant="outlined"
                      size="small"
                      class="deactivate-btn"
                    >
                      <v-icon size="16" class="mr-1">mdi-pause</v-icon>
                      停用
                    </v-btn>
                    <v-btn
                      @click="viewModelDetails(model)"
                      color="info"
                      variant="outlined"
                      size="small"
                      class="info-btn"
                    >
                      <v-icon size="16" class="mr-1">mdi-information</v-icon>
                      详情
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </div>

        </v-card-text>
      </v-card>
    </div>

    <!-- 模型详情模态框 -->
    <v-dialog
      v-model="showModelModal"
      max-width="600"
      persistent
    >
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon size="24" class="mr-2">mdi-robot</v-icon>
          模型详情
          <v-spacer></v-spacer>
          <v-btn
            icon
            variant="text"
            size="small"
            @click="closeModelModal"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-card-text>
          <div v-if="selectedModel" class="model-info">
            <v-expansion-panels>
              <v-expansion-panel title="基本信息">
                <v-expansion-panel-text>
                  <div class="info-grid">
                    <div class="info-item">
                      <span class="info-label">模型名称:</span>
                      <span class="info-value">{{ selectedModel.name }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">模型ID:</span>
                      <span class="info-value">{{ selectedModel.id }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">提供商:</span>
                      <span class="info-value">{{ getProviderLabel(selectedModel.provider) }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">状态:</span>
                      <v-chip
                        :color="selectedModel.isActive ? 'success' : 'error'"
                        size="small"
                        class="status-chip"
                      >
                        {{ selectedModel.isActive ? '活跃' : '未激活' }}
                      </v-chip>
                    </div>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>

              <v-expansion-panel v-if="selectedModel.capabilities" title="能力支持">
                <v-expansion-panel-text>
                  <div class="capabilities-grid">
                    <v-chip
                      v-for="capability in selectedModel.capabilities"
                      :key="capability"
                      color="primary"
                      size="small"
                      class="capability-chip"
                    >
                      {{ formatCapability(capability) }}
                    </v-chip>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>

              <v-expansion-panel v-if="selectedModel.description" title="模型描述">
                <v-expansion-panel-text>
                  <p class="model-description">{{ selectedModel.description }}</p>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'

// 模拟模型数据接口
interface Model {
  id: string
  name: string
  provider: string
  description?: string
  maxTokens?: number
  pricing?: {
    input: number
    output: number
  }
  capabilities?: string[]
  isActive: boolean
  createdAt?: string
}

// 响应式数据
const models = ref<Model[]>([])
const searchQuery = ref('')
const filterProvider = ref('')
const isLoading = ref(false)

// 模态框相关
const showModelModal = ref(false)
const selectedModel = ref<Model | null>(null)

// 模拟数据
const mockModels: Model[] = [
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    description: 'GPT-4是OpenAI的最新大型语言模型，具有更强的推理能力',
    maxTokens: 8192,
    pricing: { input: 0.03, output: 0.06 },
    capabilities: ['text', 'chat', 'reasoning'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    description: '优化过的GPT-3.5模型，响应更快',
    maxTokens: 4096,
    pricing: { input: 0.001, output: 0.002 },
    capabilities: ['text', 'chat'],
    isActive: true,
    createdAt: '2023-06-01T00:00:00Z'
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    description: 'Anthropic的最强大模型，擅长复杂推理',
    maxTokens: 200000,
    pricing: { input: 0.015, output: 0.075 },
    capabilities: ['text', 'chat', 'reasoning', 'analysis'],
    isActive: true,
    createdAt: '2024-03-01T00:00:00Z'
  },
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'gemini',
    description: 'Google的多模态AI模型',
    maxTokens: 32768,
    pricing: { input: 0.0005, output: 0.0015 },
    capabilities: ['text', 'chat', 'vision', 'multimodal'],
    isActive: false,
    createdAt: '2024-02-01T00:00:00Z'
  }
]

// 计算属性
const filteredModels = computed(() => {
  let filtered = models.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(model => 
      model.name.toLowerCase().includes(query) ||
      model.id.toLowerCase().includes(query)
    )
  }

  if (filterProvider.value) {
    filtered = filtered.filter(model => model.provider === filterProvider.value)
  }

  return filtered.sort((a, b) => {
    // 活跃模型排在前面
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    return a.name.localeCompare(b.name)
  })
})

// 获取提供商颜色
const getProviderColor = (provider: string) => {
  const colorMap: Record<string, string> = {
    openai: 'green',
    anthropic: 'purple',
    gemini: 'blue'
  }
  return colorMap[provider] || 'grey'
}

// 获取提供商标签
const getProviderLabel = (provider: string) => {
  const labelMap: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Google'
  }
  return labelMap[provider] || provider.toUpperCase()
}

// 格式化能力
const formatCapability = (capability: string) => {
  const capabilityMap: Record<string, string> = {
    text: '文本处理',
    chat: '对话',
    reasoning: '推理',
    analysis: '分析',
    vision: '视觉',
    multimodal: '多模态'
  }
  return capabilityMap[capability] || capability
}

// 格式化时间
const formatTime = (time: string) => {
  const date = new Date(time)
  return date.toLocaleDateString()
}

// 刷新模型列表
const refreshModels = async () => {
  isLoading.value = true
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000))
    models.value = mockModels
  } catch (error) {
    console.error('刷新模型列表失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 激活模型
const activateModel = async (modelId: string) => {
  try {
    const model = models.value.find(m => m.id === modelId)
    if (model) {
      model.isActive = true
      alert(`✅ 模型 ${model.name} 已激活`)
    }
  } catch (error) {
    console.error('激活模型失败:', error)
  }
}

// 停用模型
const deactivateModel = async (modelId: string) => {
  try {
    const model = models.value.find(m => m.id === modelId)
    if (model) {
      model.isActive = false
      alert(`⏸️ 模型 ${model.name} 已停用`)
    }
  } catch (error) {
    console.error('停用模型失败:', error)
  }
}

// 查看模型详情
const viewModelDetails = (model: Model) => {
  selectedModel.value = model
  showModelModal.value = true
}

// 关闭模型详情模态框
const closeModelModal = () => {
  showModelModal.value = false
  selectedModel.value = null
}

// 初始化
onMounted(() => {
  refreshModels()
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

.search-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  width: 300px;
}

.filter-select {
  width: 200px;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1.5rem;
}

.model-card {
  border-radius: 12px !important;
  overflow: hidden;
  transition: all 0.3s ease;
  position: relative;
  padding-left: 4px;
  border: 1px solid transparent;
}

.model-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--v-shadow-lg) !important;
}

.model-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background-color: grey;
}
.model-card.green::before { background-color: rgb(var(--v-theme-success)); }
.model-card.purple::before { background-color: rgb(var(--v-theme-purple)); }
.model-card.blue::before { background-color: rgb(var(--v-theme-info)); }

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.model-name {
  font-size: 1.2rem;
  font-weight: 600;
}

.model-badges {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
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
  gap: 0.5rem;
  padding-top: 1rem;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.info-label {
  font-weight: 600;
}

.info-value {
  color: rgba(var(--v-theme-on-surface), 0.7);
}

@media (max-width: 768px) {
  .page-container { padding: 1rem; }
  .panel-header { flex-direction: column; align-items: stretch; }
  .search-input, .filter-select { width: 100%; }
}
</style>
