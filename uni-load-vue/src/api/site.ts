import { get, post } from './base'
import type { ApiResponse, QueryParams } from './base'
import type { SiteConfigRequest, SiteConfigResponse } from '@/types/api'

/**
 * 站点管理 API
 */
export class SiteApi {
  /**
   * 获取站点分组
   */
  static async getSiteGroups(params?: QueryParams): Promise<ApiResponse<any>> {
    return get('/api/channels/site-groups', { params })
  }

  /**
   * 创建或更新站点配置
   */
  static async upsertSiteConfig(request: SiteConfigRequest): Promise<ApiResponse<SiteConfigResponse>> {
    return post('/api/process-ai-site', request)
  }

  /**
   * 预览站点名称
   */
  static async previewSiteName(baseUrl: string): Promise<ApiResponse<{ siteName: string }>> {
    return post('/api/preview-site-name', { baseUrl })
  }

  /**
   * 重新分配站点
   */
  static async reassignSite(siteUrl: string, instanceId?: string): Promise<ApiResponse<void>> {
    return post('/api/reassign-site', { siteUrl, instanceId })
  }

  /**
   * 删除站点（通过删除对应的渠道）
   */
  static async deleteSite(channelName: string): Promise<ApiResponse<any>> {
    // 注意：这里使用删除渠道的API，因为站点在系统中表现为渠道
    return post('/api/channels/reassign', { 
      channelName, 
      action: 'demote' 
    })
  }
}