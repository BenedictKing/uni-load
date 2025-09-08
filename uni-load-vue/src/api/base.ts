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
  QueryParams,
  PaginatedResponse
} from '@/types/api'

// 导出基础方法
export { get, post, put, patch, del, upload, download }

// 导出API客户端
export { apiClient }

// 导出类型
export type { ApiResponse, QueryParams, PaginatedResponse }

// API基础配置
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// 基础API类
export abstract class BaseApi {
  protected static get client() {
    return apiClient
  }

  protected static handleRequest<T>(request: Promise<T>): Promise<T> {
    return request
  }
}