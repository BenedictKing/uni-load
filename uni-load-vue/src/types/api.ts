// API 错误类
export class ApiError extends Error {
  public readonly code: number
  public readonly data?: any
  public readonly timestamp: number

  constructor(
    message: string,
    code: number = 0,
    data?: any
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.data = data
    this.timestamp = Date.now()
    
    // 保持正确的原型链
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      data: this.data,
      timestamp: this.timestamp
    }
  }
}

// API 响应基础类型
export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

// 分页参数
export interface PaginationParams {
  page?: number
  limit?: number
  offset?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// 分页响应
export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// 查询参数
export interface QueryParams extends PaginationParams {
  filter?: Record<string, any>
  search?: string
  include?: string[]
  exclude?: string[]
}

// 批量操作响应
export interface BatchOperationResponse extends ApiResponse {
  processed: number
  failed: number
  results: Array<{
    id: string
    success: boolean
    error?: string
  }>
}

// 健康检查响应
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: string
  uptime: number
  version: string
  checks: {
    database: boolean
    redis: boolean
    external: boolean
  }
}

// 系统信息响应
export interface SystemInfoResponse {
  version: string
  environment: string
  nodeVersion: string
  memory: {
    total: number
    used: number
    free: number
  }
  cpu: {
    usage: number
    cores: number
  }
  disk: {
    total: number
    used: number
    free: number
  }
}

// 渠道类型
export type ChannelType = 'openai' | 'anthropic' | 'gemini' | string

// 渠道接口
export interface Channel {
  id: string
  name: string
  type: ChannelType
  url?: string
  enabled?: boolean
  status?: string
  lastCheck?: string
  upstreams: Upstream[]
  _instance: Instance
}

// 上游服务接口
export interface Upstream {
  url: string
  health?: boolean
}

// 实例接口
export interface Instance {
  name: string
  id: string
}

// 站点分组接口
export interface SiteGroup {
  name: string
  _instance: Instance
  upstreams?: Upstream[]
}

// 模型同步状态
export interface ModelSyncStatus {
  isRunning: boolean
  hasInterval: boolean
  intervalMinutes: number
  nextSync?: string
}

// 渠道健康状态
export interface ChannelHealthStatus {
  isRunning: boolean
  hasInterval: boolean
  intervalMinutes: number
  failureThreshold: number
  failureCount: number
  nextCheck?: string
}

// 服务状态
export interface ServiceStatus {
  modelSync?: ModelSyncStatus
  channelHealth?: ChannelHealthStatus
}

// 站点配置请求
export interface SiteConfigRequest {
  siteName: string
  baseUrl: string
  apiKeys: string[]
  channelTypes: ChannelType[]
  customValidationEndpoints?: Record<string, string>
  models?: string[]
  targetChannelName?: string
  operationType?: 'create' | 'update'
}

// 站点配置响应
export interface SiteConfigResponse {
  siteName: string
  channelTypes: ChannelType[]
  groupsCreated: number
  modelsCount: number
  usingManualModels: boolean
  modelsByChannel: Record<string, string[]>
}

// 临时分组统计
export interface TempGroupStats {
  totalTempGroups: number
  instanceStats: InstanceTempGroup[]
}

export interface InstanceTempGroup {
  instanceName: string
  tempGroups: TempGroup[]
}

export interface TempGroup {
  id: string
  name: string
}

// 失败渠道信息
export interface FailedChannel {
  name: string
  failures: number
  threshold: number
  willBeRemoved: boolean
}

// 失败渠道响应
export interface FailedChannelResponse extends ApiResponse<FailedChannel[]> {
  failedChannels: FailedChannel[]
}

// 渠道重新分配请求
export interface ChannelReassignRequest {
  channelName: string
  action: 'promote' | 'demote'
}

// 渠道更新请求
export interface ChannelUpdateRequest {
  baseUrl: string
  channelTypes: ChannelType[]
  targetChannelName: string
  operationType: 'update'
  apiKeys?: string[]
}

// 服务控制请求
export interface ServiceControlRequest {
  action: 'start' | 'stop'
}

// 临时分组清理请求
export interface TempGroupCleanupRequest {
  hoursOld?: number
}