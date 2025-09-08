import { 
  get, 
  post, 
  put, 
  patch, 
  del,
  upload,
  download,
  apiClient
} from '@/utils/api'
import type { 
  ApiResponse,
  Channel,
  SiteGroup,
  SiteConfigRequest,
  SiteConfigResponse,
  ServiceStatus,
  ModelSyncStatus,
  ChannelHealthStatus,
  FailedChannel,
  ChannelReassignRequest,
  ChannelUpdateRequest,
  ServiceControlRequest,
  TempGroupCleanupRequest,
  TempGroupStats,
  BatchOperationResponse,
  HealthCheckResponse,
  SystemInfoResponse,
  QueryParams,
  PaginatedResponse
} from '@/types/api'

/**
 * 渠道管理 API
 */
export class ChannelApi {
  /**
   * 获取所有渠道
   */
  static async getChannels(params?: QueryParams): Promise<ApiResponse<Channel[]>> {
    return get('/api/channels', { params })
  }

  /**
   * 获取渠道详情
   */
  static async getChannel(name: string): Promise<ApiResponse<Channel>> {
    return get(`/api/channels/${name}`)
  }

  /**
   * 创建渠道
   */
  static async createChannel(channel: Partial<Channel>): Promise<ApiResponse<Channel>> {
    return post('/api/channels', channel)
  }

  /**
   * 更新渠道
   */
  static async updateChannel(name: string, channel: Partial<Channel>): Promise<ApiResponse<Channel>> {
    return put(`/api/channels/${name}`, channel)
  }

  /**
   * 删除渠道
   */
  static async deleteChannel(name: string): Promise<ApiResponse<void>> {
    return del(`/api/channels/${name}`)
  }

  /**
   * 批量操作渠道
   */
  static async batchChannels(operation: string, channels: string[]): Promise<ApiResponse<any>> {
    return post('/api/channels/batch', { operation, channels })
  }

  /**
   * 重新分配渠道
   */
  static async reassignChannel(request: ChannelReassignRequest): Promise<ApiResponse<void>> {
    return post('/api/channels/reassign', request)
  }

  /**
   * 更新渠道配置
   */
  static async updateChannelConfig(request: ChannelUpdateRequest): Promise<ApiResponse<void>> {
    return patch('/api/channels/config', request)
  }
}

/**
 * 站点管理 API
 */
export class SiteApi {
  /**
   * 获取所有站点分组
   */
  static async getSiteGroups(params?: QueryParams): Promise<ApiResponse<SiteGroup[]>> {
    return get('/api/sites/groups', { params })
  }

  /**
   * 获取站点配置
   */
  static async getSiteConfig(siteName: string): Promise<ApiResponse<any>> {
    return get(`/api/sites/${siteName}/config`)
  }

  /**
   * 创建或更新站点配置
   */
  static async upsertSiteConfig(request: SiteConfigRequest): Promise<ApiResponse<SiteConfigResponse>> {
    return post('/api/sites/config', request)
  }

  /**
   * 删除站点配置
   */
  static async deleteSiteConfig(siteName: string): Promise<ApiResponse<void>> {
    return del(`/api/sites/${siteName}/config`)
  }

  /**
   * 验证站点配置
   */
  static async validateSiteConfig(request: Partial<SiteConfigRequest>): Promise<ApiResponse<boolean>> {
    return post('/api/sites/validate', request)
  }

  /**
   * 获取站点统计
   */
  static async getSiteStats(siteName: string): Promise<ApiResponse<any>> {
    return get(`/api/sites/${siteName}/stats`)
  }

  /**
   * 获取所有站点
   */
  static async getAllSites(): Promise<ApiResponse<SiteGroup[]>> {
    return get('/api/sites')
  }

  /**
   * 创建站点
   */
  static async createSite(siteData: SiteConfigRequest): Promise<ApiResponse<SiteGroup>> {
    return post('/api/sites', siteData)
  }

  /**
   * 更新站点
   */
  static async updateSite(id: string, siteData: SiteConfigRequest): Promise<ApiResponse<SiteGroup>> {
    return put(`/api/sites/${id}`, siteData)
  }

  /**
   * 删除站点
   */
  static async deleteSite(id: string): Promise<ApiResponse<void>> {
    return del(`/api/sites/${id}`)
  }

  /**
   * 生成站点名称
   */
  static async generateSiteName(baseUrl: string): Promise<ApiResponse<string>> {
    return post('/api/sites/generate-name', { baseUrl })
  }
}

/**
 * 服务管理 API
 */
export class ServiceApi {
  /**
   * 获取服务状态
   */
  static async getServiceStatus(): Promise<ApiResponse<ServiceStatus>> {
    return get('/api/service/status')
  }

  /**
   * 获取模型同步状态
   */
  static async getModelSyncStatus(): Promise<ApiResponse<ModelSyncStatus>> {
    return get('/api/service/model-sync/status')
  }

  /**
   * 控制模型同步
   */
  static async controlModelSync(request: ServiceControlRequest): Promise<ApiResponse<void>> {
    return post('/api/service/model-sync/control', request)
  }

  /**
   * 控制渠道健康检查
   */
  static async controlChannelHealth(request: ServiceControlRequest): Promise<ApiResponse<void>> {
    return post('/api/service/channel-health/control', request)
  }

  /**
   * 获取失败的渠道
   */
  static async getFailedChannels(): Promise<ApiResponse<FailedChannel[]>> {
    return get('/api/service/failed-channels')
  }

  /**
   * 获取系统健康检查
   */
  static async getHealthCheck(): Promise<ApiResponse<HealthCheckResponse>> {
    return get('/api/service/health')
  }

  /**
   * 获取系统信息
   */
  static async getSystemInfo(): Promise<ApiResponse<SystemInfoResponse>> {
    return get('/api/service/system-info')
  }

  /**
   * 获取系统指标
   */
  static async getMetrics(): Promise<ApiResponse<any>> {
    return get('/api/service/metrics')
  }

  /**
   * 启动模型同步
   */
  static async startModelSync(): Promise<ApiResponse<void>> {
    return post('/api/service/model-sync/start')
  }

  /**
   * 停止模型同步
   */
  static async stopModelSync(): Promise<ApiResponse<void>> {
    return post('/api/service/model-sync/stop')
  }

  /**
   * 重启服务
   */
  static async restart(): Promise<ApiResponse<void>> {
    return post('/api/service/restart')
  }

  /**
   * 清理临时分组
   */
  static async cleanupTempGroups(): Promise<ApiResponse<void>> {
    return post('/api/service/cleanup-temp-groups')
  }

  /**
   * 重置渠道失败状态
   */
  static async resetChannelFailures(): Promise<ApiResponse<void>> {
    return post('/api/service/reset-channel-failures')
  }

  /**
   * 触发渠道检查
   */
  static async triggerChannelCheck(): Promise<ApiResponse<void>> {
    return post('/api/service/trigger-channel-check')
  }
}

/**
 * 临时分组管理 API
 */
export class TempGroupApi {
  /**
   * 获取临时分组统计
   */
  static async getTempGroupStats(): Promise<ApiResponse<TempGroupStats>> {
    return get('/api/temp-groups/stats')
  }

  /**
   * 清理临时分组
   */
  static async cleanupTempGroups(request: TempGroupCleanupRequest = {}): Promise<ApiResponse<void>> {
    return post('/api/temp-groups/cleanup', request)
  }

  /**
   * 获取临时分组列表
   */
  static async getTempGroups(params?: QueryParams): Promise<ApiResponse<PaginatedResponse<any>>> {
    return get('/api/temp-groups', { params })
  }

  /**
   * 删除临时分组
   */
  static async deleteTempGroup(groupId: string): Promise<ApiResponse<void>> {
    return del(`/api/temp-groups/${groupId}`)
  }

  /**
   * 批量删除临时分组
   */
  static async batchDeleteTempGroups(groupIds: string[]): Promise<ApiResponse<any>> {
    return post('/api/temp-groups/batch-delete', { groupIds })
  }
}

/**
 * 模型管理 API
 */
export class ModelApi {
  /**
   * 获取模型列表
   */
  static async getModels(params?: QueryParams): Promise<ApiResponse<PaginatedResponse<any>>> {
    return get('/api/models', { params })
  }

  /**
   * 获取模型详情
   */
  static async getModel(modelId: string): Promise<ApiResponse<any>> {
    return get(`/api/models/${modelId}`)
  }

  /**
   * 同步模型
   */
  static async syncModels(): Promise<ApiResponse<void>> {
    return post('/api/models/sync')
  }

  /**
   * 获取模型统计
   */
  static async getModelStats(): Promise<ApiResponse<any>> {
    return get('/api/models/stats')
  }

  /**
   * 搜索模型
   */
  static async searchModels(query: string, params?: QueryParams): Promise<ApiResponse<PaginatedResponse<any>>> {
    return get('/api/models/search', { params: { ...params, q: query } })
  }
}

/**
 * 上传管理 API
 */
export class UploadApi {
  /**
   * 上传文件
   */
  static async uploadFile(
    file: File,
    type: string = 'general',
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ url: string; filename: string }>> {
    return upload(`/api/upload/${type}`, file, onProgress)
  }

  /**
   * 上传图片
   */
  static async uploadImage(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ url: string; filename: string }>> {
    return upload('/api/upload/image', file, onProgress)
  }

  /**
   * 上传配置文件
   */
  static async uploadConfig(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ url: string; filename: string }>> {
    return upload('/api/upload/config', file, onProgress)
  }

  /**
   * 下载文件
   */
  static async downloadFile(
    fileUrl: string,
    filename?: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return download(fileUrl, filename, onProgress)
  }

  /**
   * 删除文件
   */
  static async deleteFile(fileUrl: string): Promise<ApiResponse<void>> {
    return del('/api/upload/file', { data: { url: fileUrl } })
  }
}

/**
 * 系统管理 API
 */
export class SystemApi {
  /**
   * 获取系统配置
   */
  static async getSystemConfig(): Promise<ApiResponse<any>> {
    return get('/api/system/config')
  }

  /**
   * 更新系统配置
   */
  static async updateSystemConfig(config: any): Promise<ApiResponse<void>> {
    return put('/api/system/config', config)
  }

  /**
   * 获取系统日志
   */
  static async getSystemLogs(params?: QueryParams): Promise<ApiResponse<PaginatedResponse<any>>> {
    return get('/api/system/logs', { params })
  }

  /**
   * 清理系统日志
   */
  static async clearSystemLogs(): Promise<ApiResponse<void>> {
    return del('/api/system/logs')
  }

  /**
   * 获取系统指标
   */
  static async getSystemMetrics(): Promise<ApiResponse<any>> {
    return get('/api/system/metrics')
  }

  /**
   * 重启系统
   */
  static async restartSystem(): Promise<ApiResponse<void>> {
    return post('/api/system/restart')
  }

  /**
   * 清理模型
   */
  static async cleanupModels(): Promise<ApiResponse<void>> {
    return post('/api/system/cleanup-models')
  }
}

/**
 * 用户管理 API
 */
export class UserApi {
  /**
   * 用户登录
   */
  static async login(username: string, password: string): Promise<ApiResponse<{ token: string; user: any }>> {
    return post('/api/auth/login', { username, password })
  }

  /**
   * 用户登出
   */
  static async logout(): Promise<ApiResponse<void>> {
    return post('/api/auth/logout')
  }

  /**
   * 刷新令牌
   */
  static async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    return post('/api/auth/refresh')
  }

  /**
   * 获取用户信息
   */
  static async getUserProfile(): Promise<ApiResponse<any>> {
    return get('/api/user/profile')
  }

  /**
   * 更新用户信息
   */
  static async updateUserProfile(profile: any): Promise<ApiResponse<any>> {
    return put('/api/user/profile', profile)
  }

  /**
   * 修改密码
   */
  static async changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    return post('/api/user/change-password', { oldPassword, newPassword })
  }

  /**
   * 获取用户权限
   */
  static async getUserPermissions(): Promise<ApiResponse<string[]>> {
    return get('/api/user/permissions')
  }
}

/**
 * WebSocket 管理
 */
export class WebSocketManager {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private listeners: Map<string, Function[]> = new Map()

  constructor(private url: string) {}

  /**
   * 连接 WebSocket
   */
  connect(): void {
    try {
      this.ws = new WebSocket(this.url)
      this.setupEventListeners()
    } catch (error) {
      console.error('WebSocket connection error:', error)
      this.scheduleReconnect()
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * 发送消息
   */
  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  /**
   * 监听事件
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  /**
   * 移除监听
   */
  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  private setupEventListeners(): void {
    if (!this.ws) return

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
      this.emit('connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emit('message', data)
      } catch (error) {
        console.error('WebSocket message parsing error:', error)
      }
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      this.emit('disconnected')
      this.scheduleReconnect()
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      this.emit('error', error)
    }
  }

  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(callback => callback(data))
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++
        this.connect()
      }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts))
    }
  }
}

/**
 * 导出所有 API 类
 */
export const Api = {
  Channel: ChannelApi,
  Site: SiteApi,
  Service: ServiceApi,
  TempGroup: TempGroupApi,
  Model: ModelApi,
  Upload: UploadApi,
  System: SystemApi,
  User: UserApi,
  WebSocket: WebSocketManager
}

/**
 * 导出便捷方法
 */
export const api = {
  // 基础方法
  get,
  post,
  put,
  patch,
  delete: del,
  upload,
  download,
  
  // API 类
  ...Api,
  
  // 客户端实例
  client: apiClient
}

export default api
