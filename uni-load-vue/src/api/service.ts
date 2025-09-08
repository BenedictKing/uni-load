import { get, post } from './base'
import type { ApiResponse } from './base'
import type { 
  ServiceStatus, 
  ServiceControlRequest, 
  FailedChannel,
  HealthCheckResponse
} from '@/types/api'

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
   * 控制模型同步
   */
  static async controlModelSync(request: ServiceControlRequest): Promise<ApiResponse<void>> {
    return post('/api/sync-models/control', request)
  }

  /**
   * 控制渠道健康检查
   */
  static async controlChannelHealth(request: ServiceControlRequest): Promise<ApiResponse<void>> {
    return post('/api/check-channels/control', request)
  }

  /**
   * 获取失败的渠道
   */
  static async getFailedChannels(): Promise<ApiResponse<FailedChannel[]>> {
    return get('/api/failed-channels')
  }

  /**
   * 获取系统健康检查
   */
  static async getHealthCheck(): Promise<ApiResponse<HealthCheckResponse>> {
    return get('/api/health')
  }

  /**
   * 手动同步模型
   */
  static async syncModels(): Promise<ApiResponse<void>> {
    return post('/api/sync-models')
  }

  /**
   * 重置渠道失败状态
   */
  static async resetChannelFailures(): Promise<ApiResponse<void>> {
    return post('/api/reset-channel-failures')
  }

  /**
   * 触发渠道检查
   */
  static async triggerChannelCheck(): Promise<ApiResponse<void>> {
    return post('/api/check-channels')
  }

  /**
   * 获取多实例状态
   */
  static async getMultiInstances(): Promise<ApiResponse<any>> {
    return get('/api/multi-instances')
  }

  /**
   * 检查实例健康状态
   */
  static async checkInstances(): Promise<ApiResponse<void>> {
    return post('/api/check-instances')
  }

  /**
   * 初始化架构
   */
  static async initializeArchitecture(): Promise<ApiResponse<any>> {
    return post('/api/initialize-architecture')
  }

  /**
   * 获取架构状态
   */
  static async getArchitectureStatus(): Promise<ApiResponse<any>> {
    return get('/api/architecture-status')
  }

  /**
   * 获取架构统计
   */
  static async getArchitectureStats(): Promise<ApiResponse<any>> {
    return get('/api/architecture-stats')
  }

  /**
   * 手动恢复架构
   */
  static async manualRecovery(model: string, channel: string): Promise<ApiResponse<any>> {
    return post(`/api/manual-recovery/${model}/${channel}`)
  }

  /**
   * 删除模型分组
   */
  static async deleteModelGroups(): Promise<ApiResponse<any>> {
    return post('/api/maintenance/delete-model-groups')
  }

  /**
   * 清理临时分组
   */
  static async cleanupTempGroups(): Promise<ApiResponse<void>> {
    return post('/api/temp-groups/cleanup')
  }
}