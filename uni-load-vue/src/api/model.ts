import { get, post } from './base'
import type { ApiResponse, QueryParams } from './base'

/**
 * 模型管理 API
 */
export class ModelApi {
  /**
   * API探测
   */
  static async probeApi(baseUrl: string, apiKey?: string): Promise<ApiResponse<any>> {
    return post('/api/probe-api', { baseUrl, apiKey })
  }

  /**
   * 同步模型
   */
  static async syncModels(): Promise<ApiResponse<void>> {
    return post('/api/sync-models')
  }

  /**
   * 控制模型同步
   */
  static async controlModelSync(action: 'start' | 'stop'): Promise<ApiResponse<void>> {
    return post('/api/sync-models/control', { action })
  }

  /**
   * 获取架构统计信息
   */
  static async getArchitectureStats(): Promise<ApiResponse<any>> {
    return get('/api/architecture-stats')
  }

  /**
   * 删除模型分组（维护功能）
   */
  static async deleteModelGroups(): Promise<ApiResponse<any>> {
    return post('/api/maintenance/delete-model-groups')
  }
}