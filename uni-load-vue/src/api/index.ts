/**
 * API模块统一导出
 */

// 导出基础模块
export * from './base'

// 导出功能模块
export * from './channel'
export * from './site'
export * from './service'
export * from './temp-group'
export * from './model'
export * from './system'
export * from './upload'
export * from './user'
export * from './websocket'

// 导入具体的API类
import { ChannelApi } from './channel'
import { SiteApi } from './site'
import { ServiceApi } from './service'
import { TempGroupApi } from './temp-group'
import { ModelApi } from './model'
import { SystemApi } from './system'
import { UploadApi } from './upload'
import { UserApi } from './user'
import { WebSocketManager } from './websocket'

// 导入基础方法
import { get, post, put, patch, del, upload, download, apiClient } from './base'

/**
 * 统一的API导出对象
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
 * 便捷的API调用对象
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