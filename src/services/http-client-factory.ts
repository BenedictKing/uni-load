/**
 * HTTP客户端工厂
 * 
 * 统一创建和配置axios实例，避免重复配置
 * 提供标准化的HTTP客户端，包括超时、重试、HTTPS设置等
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import https from 'https'

export interface HttpClientOptions {
  timeout?: number
  retries?: number
  rejectUnauthorized?: boolean
  userAgent?: string
  headers?: Record<string, string>
}

export class HttpClientFactory {
  /**
   * 创建标准的HTTP客户端
   * @param options 配置选项
   * @returns axios实例
   */
  static createDefaultClient(options: HttpClientOptions = {}): AxiosInstance {
    const {
      timeout = 15000,
      retries = 3,
      rejectUnauthorized = false,
      userAgent = 'uni-load/1.0',
      headers = {}
    } = options

    const httpsAgent = new https.Agent({
      rejectUnauthorized,
      timeout
    })

    const client = axios.create({
      timeout,
      httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        ...headers
      },
    })

    // 添加重试拦截器
    if (retries > 0) {
      client.interceptors.response.use(
        response => response,
        async error => {
          const config = error.config
          if (!config || !config.retry) {
            config.retry = 0
          }

          if (config.retry < retries && this.shouldRetry(error)) {
            config.retry++
            console.log(`🔄 重试请求 ${config.url} (第${config.retry}次)`)
            
            // 指数退避
            const delay = Math.pow(2, config.retry) * 1000
            await new Promise(resolve => setTimeout(resolve, delay))
            
            return client(config)
          }

          return Promise.reject(error)
        }
      )
    }

    return client
  }

  /**
   * 创建用于模型获取的HTTP客户端
   * 针对AI API调用进行优化
   */
  static createModelClient(options: HttpClientOptions = {}): AxiosInstance {
    return this.createDefaultClient({
      timeout: 30000,  // 模型API通常需要更长时间
      retries: 2,      // 减少重试次数避免过多API调用
      userAgent: 'uni-load-model-client/1.0',
      ...options
    })
  }

  /**
   * 创建用于健康检查的HTTP客户端
   * 快速失败，低延迟
   */
  static createHealthClient(options: HttpClientOptions = {}): AxiosInstance {
    return this.createDefaultClient({
      timeout: 10000,  // 健康检查需要快速响应
      retries: 1,      // 减少重试，快速失败
      userAgent: 'uni-load-health-client/1.0',
      ...options
    })
  }

  /**
   * 创建用于gpt-load API的HTTP客户端
   * 包含认证配置
   */
  static createGptloadClient(baseUrl: string, token?: string, options: HttpClientOptions = {}): AxiosInstance {
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return this.createDefaultClient({
      timeout: 20000,
      retries: 2,
      userAgent: 'uni-load-gptload-client/1.0',
      headers,
      ...options
    })
  }

  /**
   * 判断是否应该重试请求
   */
  private static shouldRetry(error: any): boolean {
    // 网络错误或服务器错误才重试
    if (!error.response) {
      return true // 网络错误
    }

    const status = error.response.status
    // 5xx 服务器错误重试
    // 429 限流错误重试
    // 408 请求超时重试
    return status >= 500 || status === 429 || status === 408
  }

  /**
   * 创建支持流式响应的客户端
   */
  static createStreamClient(options: HttpClientOptions = {}): AxiosInstance {
    return this.createDefaultClient({
      timeout: 60000,  // 流式响应可能需要更长时间
      retries: 0,      // 流式请求不适合重试
      headers: {
        'Accept': 'text/event-stream',
      },
      ...options
    })
  }

  /**
   * 为特定实例创建客户端
   * 根据实例配置自动设置认证和基础URL
   */
  static createInstanceClient(instanceUrl: string, token?: string, options: HttpClientOptions = {}): AxiosInstance {
    const client = this.createGptloadClient(instanceUrl, token, options)
    
    // 设置基础URL
    client.defaults.baseURL = instanceUrl
    
    return client
  }

  /**
   * 创建用于连接性测试的轻量级客户端
   * 只进行HEAD/OPTIONS请求，不下载内容
   */
  static createConnectivityClient(options: HttpClientOptions = {}): AxiosInstance {
    return this.createDefaultClient({
      timeout: 5000,   // 连接性测试需要快速响应
      retries: 0,      // 不重试，直接反映连接状态
      userAgent: 'uni-load-connectivity-test/1.0',
      ...options
    })
  }
}

export default HttpClientFactory