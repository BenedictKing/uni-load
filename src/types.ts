// 通用接口定义
export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: string
  details?: string | object
}

export interface ApiErrorResponse {
  error: string
  details?: string | object
}

export interface SiteGroup {
  id: string
  name: string
  sort: number
  _instance?: GptloadInstance
  upstreams?: any[]
}

export interface GptloadInstance {
  id: string
  name: string
  url: string
  token?: string
  priority: number
  description?: string
  upstream_addresses?: string[]
}

export interface HealthResult {
  healthy: boolean
  responseTime: number
  statusCode?: number
  error?: string
  lastCheck: Date
}

export interface ConnectivityResult {
  accessible: boolean
  responseTime: number
  error?: string
  statusCode?: number
}

export interface InstanceHealthStatus extends GptloadInstance {
  health: HealthResult
  apiClient: any // AxiosInstance类型
}

export interface Model {
  id: string
  name: string
  object?: string
  created?: number
  owned_by?: string
}

export interface ApiKey {
  key: string
  name?: string
}

export interface ProcessAiSiteRequest {
  baseUrl: string
  apiKeys?: string[]
  channelTypes?: string[]
  customValidationEndpoints?: any
  models?: string[]
}

export interface CleanupOptions {
  dryRun?: boolean
  force?: boolean
}

export interface CleanupResult {
  deleted: string[]
  failed: Array<{ name: string; reason: string }>
}

export interface ChannelHealthStatus {
  status: string
  failedChannels: string[]
  lastCheck?: Date
}

export interface ModelSyncStatus {
  isRunning: boolean
  lastSync?: Date
  nextSync?: Date
}

export interface ServiceStatus {
  gptload: any
  uniApi: any
  modelSync: ModelSyncStatus
  channelHealth: ChannelHealthStatus
  channelCleanup: any
}

// 层级配置相关类型
export interface LayerConfig {
  sort: number
  blacklist_threshold: number
}

export interface LayerConfigs {
  siteGroup: LayerConfig
  modelChannelGroup: LayerConfig
  aggregateGroup: LayerConfig
}

// 站点配置服务相关类型
export interface ProcessResult {
  success: boolean
  message: string
  data: {
    siteName: string
    baseUrl: string
    channelTypes: string[]
    groupsCreated: number
    modelsCount: number
    models: string[]
    siteGroups: any[]
    modelGroups: number
    usingManualModels?: boolean
    successfulInstance?: {
      id: string
      name: string
    }
    emptyModelListHandling?: boolean
    cleanupResult?: any
  }
}
