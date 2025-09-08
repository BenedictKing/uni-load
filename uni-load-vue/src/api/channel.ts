import { get, post, del } from './base'
import type { ApiResponse } from './base'
import type { ChannelReassignRequest } from '@/types/api'

/**
 * 渠道管理 API
 */
export class ChannelApi {
  /**
   * 删除渠道
   */
  static async deleteChannel(name: string): Promise<ApiResponse<void>> {
    return del(`/api/channels/${name}`)
  }

  /**
   * 重新分配渠道
   */
  static async reassignChannel(request: ChannelReassignRequest): Promise<ApiResponse<void>> {
    return post('/api/channels/reassign', request)
  }

  /**
   * 获取失败的渠道
   */
  static async getFailedChannels(): Promise<ApiResponse<any>> {
    return get('/api/failed-channels')
  }

  /**
   * 重置渠道失败状态
   */
  static async resetChannelFailures(channelName?: string): Promise<ApiResponse<void>> {
    return post('/api/reset-channel-failures', { channelName })
  }
}