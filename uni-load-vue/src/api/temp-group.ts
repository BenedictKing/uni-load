import { get, post } from './base'
import type { ApiResponse } from './base'

/**
 * 临时分组管理 API
 */
export class TempGroupApi {
  /**
   * 获取临时分组统计
   */
  static async getTempGroupStats(): Promise<ApiResponse<any>> {
    return get('/api/temp-groups/stats')
  }

  /**
   * 清理临时分组
   */
  static async cleanupTempGroups(): Promise<ApiResponse<void>> {
    return post('/api/temp-groups/cleanup')
  }

  /**
   * 清理过期临时分组
   */
  static async cleanupOldTempGroups(hoursOld: number = 24): Promise<ApiResponse<void>> {
    return post('/api/temp-groups/cleanup-old', { hoursOld })
  }
}