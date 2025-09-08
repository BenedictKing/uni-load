<template>
  <div class="site-config-page">
    <!-- 配置表单卡片 -->
    <v-card class="config-card enhanced-card">
      <v-card-title class="card-header">
        <div class="header-content">
          <v-icon size="32" color="primary">mdi-cog</v-icon>
          <div class="header-text">
            <h3>AI站点配置</h3>
            <p class="subtitle">配置新的AI站点，自动创建渠道和模型分组</p>
          </div>
        </div>
      </v-card-title>

      <v-card-text>
        <v-form 
          @submit.prevent="handleSubmit" 
          v-model="validForm"
          ref="formRef"
        >
          <!-- 基础地址输入 -->
          <v-text-field
            v-model="form.baseUrl"
            label="API 基础地址"
            placeholder="https://api.example.com"
            :rules="baseUrlRules"
            variant="outlined"
            density="comfortable"
            @input="debouncedUpdateSiteName"
            class="mb-4"
          >
            <template v-slot:append-inner>
              <v-chip
                :color="siteNameChipColor"
                size="small"
                :title="siteNameTooltip"
                class="site-name-chip"
              >
                <v-icon size="14" class="mr-1">{{ siteNameChipIcon }}</v-icon>
                {{ siteNameDisplay }}
              </v-chip>
            </template>
          </v-text-field>
          <div class="help-text mb-4">
            AI站点的API地址，系统会自动生成站点名称
          </div>

          <!-- API格式类型选择 -->
          <div class="mb-4">
            <label class="text-subtitle-1 font-weight-medium mb-2 d-block">
              API 格式类型
            </label>
            <v-chip-group
              v-model="form.channelTypes"
              multiple
              selected-class="text-primary"
              @update:model-value="updateValidationEndpoints"
              class="channel-types-group"
            >
              <v-chip
                v-for="type in channelTypes"
                :key="type.value"
                :value="type.value"
                filter
                variant="outlined"
                class="channel-type-chip"
              >
                <v-icon size="16" class="mr-1">{{ type.icon }}</v-icon>
                {{ type.label }}
              </v-chip>
            </v-chip-group>
            <div class="help-text">
              选择该AI站点支持的API格式（可多选）
            </div>
          </div>

          <!-- API密钥输入 -->
          <v-textarea
            v-model="form.apiKeys"
            label="API 密钥"
            :rules="apiKeysRules"
            variant="outlined"
            density="comfortable"
            rows="6"
            placeholder="sk-xxx...&#10;sk-yyy..., sk-zzz...&#10;sk-aaa... sk-bbb...; sk-ccc...&#10;&#10;支持分隔符：换行、空格、逗号、分号"
            counter="10000"
            class="mb-4"
          />
          <div class="help-text mb-4">
            每行一个密钥，支持多种分隔符（换行、空格、逗号、分号）
          </div>

          <!-- 手动指定模型 - 可折叠 -->
          <v-expansion-panels v-model="activePanels" class="mb-4">
            <v-expansion-panel value="models" title="手动指定模型 (可选)">
              <v-expansion-panel-text>
                <v-textarea
                  v-model="form.manualModels"
                  label="手动指定模型"
                  variant="outlined"
                  density="comfortable"
                  rows="4"
                  placeholder="如果站点无法自动获取模型列表，可以手动指定：&#10;gpt-3.5-turbo&#10;gpt-4&#10;claude-3-sonnet&#10;deepseek-chat&#10;&#10;每行一个模型名称"
                />
                <div class="help-text">
                  仅当自动获取模型失败时使用。每行一个模型名称。
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <!-- 验证端点配置 -->
          <div v-if="form.channelTypes.length > 0" class="validation-endpoints mb-4">
            <div 
              v-for="type in form.channelTypes" 
              :key="type"
              class="mb-3"
            >
              <v-text-field
                v-model="form.customValidationEndpoints[type]"
                :label="`验证端点 (${getChannelTypeLabel(type)} 格式)`"
                :placeholder="getValidationEndpointPlaceholder(type)"
                variant="outlined"
                density="comfortable"
              />
              <div class="help-text">
                用于 {{ getChannelTypeLabel(type) }} 格式的健康检查端点，留空则使用默认值
              </div>
            </div>
          </div>

          <!-- 提交按钮 -->
          <div class="d-flex justify-center">
            <v-btn
              color="primary"
              size="large"
              :loading="isSubmitting"
              :disabled="isSubmitting || !validForm"
              @click="handleSubmit"
              class="submit-btn enhanced-button"
            >
              <v-icon class="mr-2">mdi-cog</v-icon>
              {{ isSubmitting ? '配置中...' : '开始配置' }}
            </v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>

    <!-- 配置结果 -->
    <v-card v-if="result" class="result-card enhanced-card mt-6">
      <v-card-title class="result-header">
        <v-icon :color="result.success ? 'success' : 'error'" class="mr-2">
          {{ result.success ? 'mdi-check-circle' : 'mdi-close-circle' }}
        </v-icon>
        {{ result.success ? '配置成功！' : '配置失败' }}
      </v-card-title>
      
      <v-card-text>
        <div v-if="result.success">
          <!-- 成功信息展示 -->
          <v-list class="result-list">
            <v-list-item>
              <v-list-item-title>站点名称</v-list-item-title>
              <v-list-item-subtitle>{{ result.data.siteName }}</v-list-item-subtitle>
            </v-list-item>
            <v-list-item>
              <v-list-item-title>API格式</v-list-item-title>
              <v-list-item-subtitle>{{ result.data.channelTypes.join(', ') }}</v-list-item-subtitle>
            </v-list-item>
            <v-list-item>
              <v-list-item-title>创建分组</v-list-item-title>
              <v-list-item-subtitle>{{ result.data.groupsCreated }} 个</v-list-item-subtitle>
            </v-list-item>
            <v-list-item>
              <v-list-item-title>发现模型</v-list-item-title>
              <v-list-item-subtitle>
                {{ result.data.modelsCount }} 个
                <v-chip v-if="result.data.usingManualModels" color="info" size="small" class="ml-2">
                  手动指定
                </v-chip>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
          
          <!-- 模型列表展示 -->
          <div v-if="result.data.modelsByChannel" class="models-section mt-4">
            <h4 class="text-subtitle-1 font-weight-medium mb-3">模型列表:</h4>
            <v-expansion-panels v-model="modelsPanels">
              <v-expansion-panel 
                v-for="(models, channelType) in result.data.modelsByChannel" 
                :key="channelType"
                :value="channelType"
              >
                <v-expansion-panel-title>
                  {{ getChannelTypeLabel(String(channelType)) }} 格式模型 ({{ models.length }}个)
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="models-chips">
                    <v-chip
                      v-for="model in models" 
                      :key="model" 
                      size="small"
                      variant="outlined"
                      class="ma-1"
                    >
                      {{ model }}
                    </v-chip>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
          
          <!-- 成功提示 -->
          <v-alert
            type="success"
            variant="tonal"
            class="mt-4"
          >
            <template v-slot:text>
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-sparkles</v-icon>
                现在可以通过 uni-api 访问这些模型了！
              </div>
            </template>
          </v-alert>
        </div>
        
        <!-- 失败信息展示 -->
        <div v-else>
          <v-alert
            type="error"
            variant="tonal"
          >
            <template v-slot:text>
              <div>
                <strong>{{ result.error }}</strong>
                <p class="mb-0 mt-2">请检查输入的信息是否正确，或查看控制台获取更多详情。</p>
              </div>
            </template>
          </v-alert>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useApi } from '@/composables/useApi'
import { Api } from '@/api'

// 渠道类型配置
const channelTypes = [
  { value: 'openai', label: 'OpenAI 兼容格式', icon: 'mdi-robot' },
  { value: 'anthropic', label: 'Anthropic Claude 格式', icon: 'mdi-brain' },
  { value: 'gemini', label: 'Google Gemini 格式', icon: 'mdi-crystal-ball' }
]

// 表单数据
const form = reactive({
  baseUrl: '',
  channelTypes: ['openai'] as string[],
  apiKeys: '',
  manualModels: '',
  customValidationEndpoints: {} as Record<string, string>
})

// 站点名称相关状态
const siteName = ref('')
const siteNameStatus = ref<'loading' | 'success' | 'error'>('loading')

// Vuetify 相关状态
const activePanels = ref<string[]>([])
const modelsPanels = ref<string[]>([])
const formRef = ref()
const validForm = ref(false)

// 提交状态
const isSubmitting = ref(false)

// 结果数据
const result = ref<any>(null)

// 表单验证规则
const baseUrlRules = [
  (v: string) => !!v || '请输入API基础地址',
  (v: string) => {
    try {
      new URL(v)
      return true
    } catch {
      return '请输入正确的URL格式'
    }
  }
]

const apiKeysRules = [
  (v: string) => !!v || '请输入API密钥',
  (v: string) => v.length >= 10 || 'API密钥长度不能少于10个字符'
]

// 站点名称显示
const siteNameDisplay = computed(() => {
  switch (siteNameStatus.value) {
    case 'loading':
      return '生成中...'
    case 'success':
      return siteName.value
    case 'error':
      return '生成失败'
    default:
      return '请输入地址'
  }
})

// 站点名称芯片颜色
const siteNameChipColor = computed(() => {
  switch (siteNameStatus.value) {
    case 'loading':
      return 'warning'
    case 'success':
      return 'success'
    case 'error':
      return 'error'
    default:
      return 'grey'
  }
})

// 站点名称芯片图标
const siteNameChipIcon = computed(() => {
  switch (siteNameStatus.value) {
    case 'loading':
      return 'mdi-loading mdi-spin'
    case 'success':
      return 'mdi-check-circle'
    case 'error':
      return 'mdi-close-circle'
    default:
      return 'mdi-help-circle'
  }
})

const siteNameTooltip = computed(() => {
  if (siteNameStatus.value === 'success') {
    return `站点名称: ${siteName.value}`
  }
  return siteNameDisplay.value
})

// API 调用
const { execute: generateSiteName } = useApi(
  () => Api.Site.generateSiteName(form.baseUrl),
  { immediate: false }
)

const { execute: submitConfig } = useApi(
  () => Api.Site.upsertSiteConfig({
    siteName: siteName.value,
    baseUrl: form.baseUrl,
    apiKeys: parseApiKeys(form.apiKeys),
    channelTypes: form.channelTypes,
    customValidationEndpoints: form.customValidationEndpoints,
    models: parseManualModels(form.manualModels) || undefined
  }),
  { immediate: false }
)

// 防抖更新站点名称
let debounceTimer: number
const debouncedUpdateSiteName = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(updateSiteName, 500)
}

// 更新站点名称
const updateSiteName = async () => {
  if (!form.baseUrl.trim()) {
    siteNameStatus.value = 'loading'
    return
  }

  try {
    siteNameStatus.value = 'loading'
    const response = await generateSiteName()
    
    if (response) {
      siteName.value = response
      siteNameStatus.value = 'success'
    } else {
      throw new Error('生成失败')
    }
  } catch (error) {
    siteNameStatus.value = 'error'
    console.error('生成站点名称失败:', error)
  }
}

// 更新验证端点显示
const updateValidationEndpoints = () => {
  // 移除未选中的验证端点
  Object.keys(form.customValidationEndpoints).forEach(type => {
    if (!form.channelTypes.includes(type)) {
      delete form.customValidationEndpoints[type]
    }
  })
}

// 获取渠道类型标签
const getChannelTypeLabel = (type: string) => {
  const channelType = channelTypes.find(t => t.value === type)
  return channelType ? channelType.label : type
}

// 获取验证端点占位符
const getValidationEndpointPlaceholder = (type: string) => {
  const placeholders = {
    openai: '留空则使用默认值 /v1/chat/completions',
    anthropic: '留空则使用默认值 /v1/messages',
    gemini: '留空则使用默认值 /v1beta/models'
  }
  return placeholders[type as keyof typeof placeholders] || '留空则使用默认值'
}

// 解析API密钥
const parseApiKeys = (text: string) => {
  if (!text || !text.trim()) {
    return []
  }

  return text
    .split(/[\n\r\s,;]+/)
    .map(key => key.trim())
    .filter(key => key.length > 0)
    .filter((key, index, arr) => arr.indexOf(key) === index)
}

// 解析手动模型
const parseManualModels = (text: string) => {
  if (!text || !text.trim()) {
    return []
  }

  return text
    .split(/[\n\r]+/)
    .map(model => model.trim())
    .filter(model => model.length > 0)
    .filter((model, index, arr) => arr.indexOf(model) === index)
}

// 处理表单提交
const handleSubmit = async () => {
  if (form.channelTypes.length === 0) {
    alert('请至少选择一种API格式类型')
    return
  }

  const apiKeys = parseApiKeys(form.apiKeys)
  if (apiKeys.length === 0) {
    alert('请至少输入一个API密钥')
    return
  }

  try {
    isSubmitting.value = true
    result.value = null

    const response = await submitConfig()
    
    if (response) {
      result.value = {
        success: true,
        data: response
      }
      
      // 重置表单
      form.baseUrl = ''
      form.channelTypes = ['openai']
      form.apiKeys = ''
      form.manualModels = ''
      form.customValidationEndpoints = {}
      siteName.value = ''
      siteNameStatus.value = 'loading'
      activePanels.value = []
      modelsPanels.value = []
    }
  } catch (error) {
    result.value = {
      success: false,
      error: error instanceof Error ? error.message : '配置失败'
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.site-config-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.config-card {
  border-radius: 16px !important;
}

.card-header {
  text-align: center;
  padding: 1.5rem;
}

.header-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.header-text h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.header-text .subtitle {
  color: #666;
  font-size: 0.9rem;
  margin: 0;
}

.help-text {
  font-size: 0.875rem;
  color: #6c757d;
}

.channel-types-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.channel-type-chip {
  border-radius: 20px !important;
}

.site-name-chip {
  border-radius: 16px !important;
}

.validation-endpoints {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  padding: 1rem;
}

.result-card {
  border-radius: 16px !important;
}

.result-header {
  display: flex;
  align-items: center;
  font-size: 1.2rem;
  font-weight: 600;
}

.result-list {
  background: transparent;
}

.models-section {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  padding: 1rem;
}

.models-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.submit-btn {
  min-width: 200px;
  border-radius: 12px !important;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .site-config-page {
    padding: 1rem;
  }
  
  .card-header {
    padding: 1rem;
  }
  
  .header-content {
    align-items: flex-start;
  }
  
  .channel-types-group {
    justify-content: center;
  }
  
  .submit-btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .header-text h3 {
    font-size: 1.2rem;
  }
  
  .header-text .subtitle {
    font-size: 0.8rem;
  }
  
  .site-name-chip {
    font-size: 0.75rem;
  }
}
</style>
