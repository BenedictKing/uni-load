import { get, post, del } from '@/utils/api'
import type { ApiResponse } from '@/types/api'
import type {
  SiteConfigRequest,
  ServiceControlRequest,
  ChannelReassignRequest,
  TempGroupCleanupRequest,
} from '@/types/api'

/**
 * 站点配置 API
 */
class SiteApi {
  static process(request: SiteConfigRequest): Promise<ApiResponse<any>> {
    return post('/api/process-ai-site', request)
  }
  static previewName(baseUrl: string): Promise<ApiResponse<{ siteName: string }>> {
    return post('/api/preview-site-name', { baseUrl })
  }
}

/**
 * 渠道管理 API
 */
class ChannelApi {
  static getSiteGroups(): Promise<ApiResponse<any>> {
    return get('/api/channels/site-groups')
  }
  static delete(channelName: string): Promise<ApiResponse<any>> {
    return del(`/api/channels/${channelName}`)
  }
  static reassign(request: ChannelReassignRequest): Promise<ApiResponse<any>> {
    return post('/api/channels/reassign', request)
  }
}

/**
 * 服务与监控 API
 */
class ServiceApi {
  static getStatus(): Promise<ApiResponse<any>> {
    return get('/api/status')
  }
  static controlModelSync(request: ServiceControlRequest): Promise<ApiResponse<any>> {
    return post('/api/sync-models/control', request)
  }
  static triggerManualSync(): Promise<ApiResponse<any>> {
    return post('/api/sync-models')
  }
  static controlChannelHealth(request: ServiceControlRequest): Promise<ApiResponse<any>> {
    return post('/api/check-channels/control', request)
  }
  static triggerChannelCheck(): Promise<ApiResponse<any>> {
    return post('/api/check-channels')
  }
  static getFailedChannels(): Promise<ApiResponse<any>> {
    return get('/api/failed-channels')
  }
  static resetChannelFailures(channelName?: string): Promise<ApiResponse<any>> {
    return post('/api/reset-channel-failures', { channelName })
  }
}

/**
 * 维护与清理 API
 */
class MaintenanceApi {
  static getTempGroupStats(): Promise<ApiResponse<any>> {
    return get('/api/temp-groups/stats')
  }
  static cleanupTempGroups(request: TempGroupCleanupRequest = {}): Promise<ApiResponse<any>> {
    return post('/api/temp-groups/cleanup', request)
  }
  static cleanupOldTempGroups(request: TempGroupCleanupRequest): Promise<ApiResponse<any>> {
    return post('/api/temp-groups/cleanup-old', request)
  }
  static cleanupModelGroups(): Promise<ApiResponse<any>> {
    return post('/api/maintenance/delete-model-groups')
  }
}

/**
 * 统一的API导出对象
 */
export const Api = {
  Site: SiteApi,
  Channel: ChannelApi,
  Service: ServiceApi,
  Maintenance: MaintenanceApi,
}
