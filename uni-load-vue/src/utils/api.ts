import axios from 'axios'
import type { 
  AxiosInstance, 
  AxiosRequestConfig, 
  AxiosResponse, 
  AxiosError,
  InternalAxiosRequestConfig
} from 'axios'
import type { ApiResponse } from '@/types/api'
import { ApiError } from '@/types/api'

// API 基础配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002'
const API_TIMEOUT = import.meta.env.VITE_API_TIMEOUT || 30000

// 请求队列和取消令牌
const pendingRequests = new Map<string, AbortController>()

class ApiClient {
  private instance: AxiosInstance
  private isRefreshing = false
  private failedQueue: Array<{
    resolve: (value: any) => void
    reject: (reason?: any) => void
  }> = []

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      withCredentials: false,
    })

    this.setupInterceptors()
  }

  /**
   * 生成请求唯一标识
   */
  private generateRequestKey(config: InternalAxiosRequestConfig): string {
    const { method, url, params, data } = config
    return [method, url, JSON.stringify(params), JSON.stringify(data)].join('&')
  }

  /**
   * 添加请求到队列
   */
  private addPendingRequest(config: InternalAxiosRequestConfig): void {
    const requestKey = this.generateRequestKey(config)
    const controller = new AbortController()
    config.signal = controller.signal
    pendingRequests.set(requestKey, controller)
  }

  /**
   * 从队列中移除请求
   */
  private removePendingRequest(config: InternalAxiosRequestConfig): void {
    const requestKey = this.generateRequestKey(config)
    if (pendingRequests.has(requestKey)) {
      const controller = pendingRequests.get(requestKey)
      controller?.abort()
      pendingRequests.delete(requestKey)
    }
  }

  /**
   * 取消所有请求
   */
  public cancelAllRequests(): void {
    pendingRequests.forEach(controller => {
      controller.abort()
    })
    pendingRequests.clear()
  }

  /**
   * 处理失败的队列
   */
  private processQueue(error: any, token: string | null = null): void {
    this.failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error)
      } else {
        prom.resolve(token)
      }
    })
    this.failedQueue = []
  }

  /**
   * 设置拦截器
   */
  private setupInterceptors(): void {
    // 请求拦截器
    this.instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // 取消重复请求
        this.removePendingRequest(config)
        this.addPendingRequest(config)

        // 添加认证信息
        const token = localStorage.getItem('token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }

        // 添加请求时间戳
        ;(config as any).metadata = { startTime: Date.now() }

        return config
      },
      (error: AxiosError) => {
        return Promise.reject(error)
      }
    )

    // 响应拦截器
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        // 从队列中移除请求
        this.removePendingRequest(response.config as InternalAxiosRequestConfig)

        // 计算请求耗时
        const endTime = Date.now()
        const startTime = (response.config as any).metadata?.startTime || endTime
        const duration = endTime - startTime

        // 记录请求日志（开发环境）
        if (import.meta.env.DEV) {
          console.log(`API Request: ${response.config.method?.toUpperCase()} ${response.config.url} - ${duration}ms`)
        }

        // 处理响应数据
        const { data } = response
        
        // 检查响应格式
        if (data && typeof data === 'object') {
          // 如果是标准 API 响应格式
          if ('success' in data) {
            if (data.success) {
              return data
            } else {
              // 业务错误
              return Promise.reject(new ApiError(data.message || 'Request failed', data.code || 400, data))
            }
          }
        }

        // 直接返回数据
        return data
      },
      async (error: AxiosError) => {
        // 从队列中移除请求
        if (error.config) {
          this.removePendingRequest(error.config as InternalAxiosRequestConfig)
        }

        // 处理取消的请求
        if (error.name === 'CanceledError') {
          return Promise.reject(new ApiError('Request canceled', 0, error))
        }

        // 处理网络错误
        if (!error.response) {
          return Promise.reject(new ApiError(
            'Network error. Please check your connection.',
            0,
            error
          ))
        }

        const { response, config } = error
        const status = response?.status || 0
        const url = config?.url || ''

        // 记录错误日志
        if (import.meta.env.DEV) {
          console.error(`API Error: ${status} ${url}`, error)
        }

        // 处理不同的错误状态码
        switch (status) {
          case 400:
            return Promise.reject(new ApiError('Bad request', status, response.data))
          
          case 401:
            // 处理 token 过期
            if (!this.isRefreshing) {
              this.isRefreshing = true
              try {
                // 这里可以添加刷新 token 的逻辑
                // const newToken = await refreshToken()
                // this.processQueue(null, newToken)
                this.isRefreshing = false
              } catch (refreshError) {
                this.processQueue(refreshError, null)
                this.isRefreshing = false
                // 跳转到登录页
                if (typeof window !== 'undefined') {
                  window.location.href = '/login'
                }
              }
            }
            
            // 将请求加入队列
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject })
            })
          
          case 403:
            return Promise.reject(new ApiError('Access denied', status, response.data))
          
          case 404:
            return Promise.reject(new ApiError('Resource not found', status, response.data))
          
          case 422:
            return Promise.reject(new ApiError('Validation error', status, response.data))
          
          case 429:
            return Promise.reject(new ApiError('Too many requests', status, response.data))
          
          case 500:
            return Promise.reject(new ApiError('Internal server error', status, response.data))
          
          case 502:
            return Promise.reject(new ApiError('Bad gateway', status, response.data))
          
          case 503:
            return Promise.reject(new ApiError('Service unavailable', status, response.data))
          
          default:
            return Promise.reject(new ApiError(
              `Request failed with status ${status}`,
              status,
              response.data
            ))
        }
      }
    )
  }

  /**
   * GET 请求
   */
  public async get<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.instance.get(url, config)
  }

  /**
   * POST 请求
   */
  public async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.instance.post(url, data, config)
  }

  /**
   * PUT 请求
   */
  public async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.instance.put(url, data, config)
  }

  /**
   * PATCH 请求
   */
  public async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.instance.patch(url, data, config)
  }

  /**
   * DELETE 请求
   */
  public async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.instance.delete(url, config)
  }

  /**
   * 上传文件
   */
  public async upload<T = any>(
    url: string,
    file: File,
    onProgress?: (progress: number) => void,
    additionalData?: Record<string, any>
  ): Promise<ApiResponse<T>> {
    const formData = new FormData()
    formData.append('file', file)
    
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value)
      })
    }

    return this.instance.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(progress)
        }
      },
    })
  }

  /**
   * 下载文件
   */
  public async download(
    url: string,
    filename?: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const response = await this.instance.get(url, {
      responseType: 'blob',
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(progress)
        }
      },
    })

    const blob = new Blob([response.data])
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename || 'download'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)
  }

  /**
   * 获取实例（用于特殊请求）
   */
  public getInstance(): AxiosInstance {
    return this.instance
  }

  /**
   * 更新基础 URL
   */
  public setBaseURL(baseURL: string): void {
    this.instance.defaults.baseURL = baseURL
  }

  /**
   * 更新认证头
   */
  public setAuthToken(token: string): void {
    this.instance.defaults.headers.Authorization = `Bearer ${token}`
  }

  /**
   * 清除认证头
   */
  public clearAuthToken(): void {
    delete this.instance.defaults.headers.Authorization
  }

  /**
   * 更新超时时间
   */
  public setTimeout(timeout: number): void {
    this.instance.defaults.timeout = timeout
  }
}

// 创建 API 客户端实例
export const apiClient = new ApiClient()

// 导出默认实例
export default apiClient

// 导出便捷方法
export const get = <T = any>(url: string, config?: AxiosRequestConfig) => 
  apiClient.get<T>(url, config)

export const post = <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => 
  apiClient.post<T>(url, data, config)

export const put = <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => 
  apiClient.put<T>(url, data, config)

export const patch = <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => 
  apiClient.patch<T>(url, data, config)

export const del = <T = any>(url: string, config?: AxiosRequestConfig) => 
  apiClient.delete<T>(url, config)

export const upload = <T = any>(
  url: string,
  file: File,
  onProgress?: (progress: number) => void,
  additionalData?: Record<string, any>
) => apiClient.upload<T>(url, file, onProgress, additionalData)

export const download = (
  url: string,
  filename?: string,
  onProgress?: (progress: number) => void
) => apiClient.download(url, filename, onProgress)