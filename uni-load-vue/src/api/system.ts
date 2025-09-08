import { get, post } from './base'
import type { ApiResponse } from './base'

/**
 * 系统管理 API
 */
export class SystemApi {
  /**
   * 获取系统指标
   */
  static async getSystemMetrics(): Promise<ApiResponse<any>> {
    return get('/api/architecture-stats')
  }

  /**
   * 清理模型
   */
  static async cleanupModels(): Promise<ApiResponse<void>> {
    return post('/api/maintenance/delete-model-groups')
  }

  /**
   * 渠道清理预览
   */
  static async previewChannelCleanup(options?: any): Promise<ApiResponse<any>> {
    return post('/api/cleanup-channels/preview', options)
  }

  /**
   * 执行渠道清理
   */
  static async cleanupChannels(options?: any): Promise<ApiResponse<void>> {
    return post('/api/cleanup-channels', options)
  }

  /**
   * 手动清理渠道
   */
  static async manualCleanupChannels(channelNames: string[], dryRun: boolean = false): Promise<ApiResponse<any>> {
    return post('/api/cleanup-channels/manual', { channelNames, dryRun })
  }

  /**
   * 获取清理历史
   */
  static async getCleanupHistory(): Promise<ApiResponse<any>> {
    return get('/api/cleanup-history')
  }

  /**
   * 获取架构状态
   */
  static async getArchitectureStatus(): Promise<ApiResponse<any>> {
    return get('/api/architecture-status')
  }

  /**
   * 初始化架构
   */
  static async initializeArchitecture(): Promise<ApiResponse<any>> {
    return post('/api/initialize-architecture')
  }
}