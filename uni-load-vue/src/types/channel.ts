import type { ChannelType, Channel } from './api'

// 渠道状态类型
export type ChannelStatus = 'online' | 'offline' | 'warning' | 'unknown'

// 扩展的渠道信息
export interface ChannelInfo extends Omit<Channel, 'lastCheck'> {
  status: ChannelStatus
  lastCheck?: Date
  responseTime?: number
  errorCount: number
  siteName: string
}

// 渠道统计信息
export interface ChannelStats {
  total: number
  online: number
  offline: number
  warning: number
  unknown: number
}

// 渠道过滤器
export interface ChannelFilter {
  type?: ChannelType
  status?: ChannelStatus
  instance?: string
  search?: string
}

// 渠道排序选项
export interface ChannelSortOption {
  field: 'name' | 'status' | 'lastCheck' | 'responseTime'
  order: 'asc' | 'desc'
}

// 渠道操作结果
export interface ChannelOperationResult {
  success: boolean
  message: string
  data?: {
    updatedModelGroups: string[]
    deletedModelGroups: string[]
  }
}

// 渠道重新分配结果
export interface ChannelReassignResult {
  success: boolean
  message: string
}

// 渠道健康检查结果
export interface ChannelHealthCheck {
  channelName: string
  isHealthy: boolean
  responseTime: number
  error?: string
  timestamp: Date
}

// 渠道配置表单数据
export interface ChannelConfigForm {
  name: string
  baseUrl: string
  channelTypes: ChannelType[]
  apiKeys: string[]
  validationEndpoints?: Record<string, string>
  manualModels?: string[]
}

// 渠道类型配置
export interface ChannelTypeConfig {
  type: ChannelType
  displayName: string
  color: string
  defaultValidationEndpoint: string
  icon: string
}

// 预定义的渠道类型配置
export const CHANNEL_TYPE_CONFIGS: Record<ChannelType, ChannelTypeConfig> = {
  openai: {
    type: 'openai',
    displayName: 'OpenAI',
    color: 'green',
    defaultValidationEndpoint: '/v1/chat/completions',
    icon: '🤖'
  },
  anthropic: {
    type: 'anthropic',
    displayName: 'Anthropic',
    color: 'purple',
    defaultValidationEndpoint: '/v1/messages',
    icon: '🧠'
  },
  gemini: {
    type: 'gemini',
    displayName: 'Gemini',
    color: 'blue',
    defaultValidationEndpoint: '/v1beta/models',
    icon: '💎'
  }
}