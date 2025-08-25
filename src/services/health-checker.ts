/**
 * 通用健康检查服务
 * 
 * 提供统一的健康检查和连接性测试功能
 * 避免各模块重复实现HTTP检查逻辑
 */

import { HttpClientFactory } from './http-client-factory'
import { AxiosInstance } from 'axios'

export interface HealthCheckResult {
  healthy: boolean
  responseTime: number
  statusCode?: number
  error?: string
  timestamp: Date
}

export interface ConnectivityResult {
  accessible: boolean
  responseTime: number
  statusCode?: number
  error?: string
  timestamp: Date
}

export interface HealthCheckOptions {
  timeout?: number
  method?: 'GET' | 'HEAD' | 'OPTIONS'
  expectedStatus?: number[]
  headers?: Record<string, string>
  followRedirects?: boolean
}

export class HealthChecker {
  private healthClient: AxiosInstance
  private connectivityClient: AxiosInstance

  constructor() {
    this.healthClient = HttpClientFactory.createHealthClient()
    this.connectivityClient = HttpClientFactory.createConnectivityClient()
  }

  /**
   * 检查URL的健康状态
   * 使用GET请求，获取完整响应
   */
  async checkHealth(url: string, options: HealthCheckOptions = {}): Promise<HealthCheckResult> {
    const {
      timeout = 10000,
      method = 'GET',
      expectedStatus = [200, 204],
      headers = {},
      followRedirects = true
    } = options

    const startTime = Date.now()

    try {
      const response = await this.healthClient.request({
        url,
        method,
        timeout,
        headers,
        maxRedirects: followRedirects ? 5 : 0,
        validateStatus: () => true // 接受所有状态码，让我们自己判断
      })

      const responseTime = Date.now() - startTime
      const healthy = expectedStatus.includes(response.status)

      return {
        healthy,
        responseTime,
        statusCode: response.status,
        timestamp: new Date()
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime
      
      return {
        healthy: false,
        responseTime,
        error: error.message,
        statusCode: error.response?.status,
        timestamp: new Date()
      }
    }
  }

  /**
   * 测试连接性（轻量级检查）
   * 使用HEAD请求，不下载内容
   */
  async testConnectivity(url: string, options: HealthCheckOptions = {}): Promise<ConnectivityResult> {
    const {
      timeout = 5000,
      headers = {},
      followRedirects = true
    } = options

    const startTime = Date.now()

    try {
      // 首先尝试HEAD请求
      const response = await this.connectivityClient.head(url, {
        timeout,
        headers,
        maxRedirects: followRedirects ? 5 : 0,
        validateStatus: () => true
      })

      const responseTime = Date.now() - startTime
      
      // HEAD请求可能返回405，这时尝试OPTIONS
      if (response.status === 405) {
        return await this.testWithOptions(url, { timeout, headers, followRedirects })
      }

      const accessible = response.status >= 200 && response.status < 400

      return {
        accessible,
        responseTime,
        statusCode: response.status,
        timestamp: new Date()
      }
    } catch (error: any) {
      // HEAD失败时尝试OPTIONS
      if (error.response?.status !== 404) {
        return await this.testWithOptions(url, { timeout, headers, followRedirects })
      }

      const responseTime = Date.now() - startTime
      
      return {
        accessible: false,
        responseTime,
        error: error.message,
        statusCode: error.response?.status,
        timestamp: new Date()
      }
    }
  }

  /**
   * 使用OPTIONS方法测试连接性
   */
  private async testWithOptions(url: string, options: HealthCheckOptions): Promise<ConnectivityResult> {
    const { timeout = 5000, headers = {}, followRedirects = true } = options
    const startTime = Date.now()

    try {
      const response = await this.connectivityClient.options(url, {
        timeout,
        headers,
        maxRedirects: followRedirects ? 5 : 0,
        validateStatus: () => true
      })

      const responseTime = Date.now() - startTime
      const accessible = response.status >= 200 && response.status < 400

      return {
        accessible,
        responseTime,
        statusCode: response.status,
        timestamp: new Date()
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime
      
      return {
        accessible: false,
        responseTime,
        error: error.message,
        statusCode: error.response?.status,
        timestamp: new Date()
      }
    }
  }

  /**
   * 批量健康检查
   */
  async checkMultipleHealth(urls: string[], options: HealthCheckOptions = {}): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>()
    
    // 并发执行所有检查
    const promises = urls.map(async url => {
      const result = await this.checkHealth(url, options)
      results.set(url, result)
    })

    await Promise.all(promises)
    return results
  }

  /**
   * 批量连接性测试
   */
  async testMultipleConnectivity(urls: string[], options: HealthCheckOptions = {}): Promise<Map<string, ConnectivityResult>> {
    const results = new Map<string, ConnectivityResult>()
    
    // 并发执行所有测试
    const promises = urls.map(async url => {
      const result = await this.testConnectivity(url, options)
      results.set(url, result)
    })

    await Promise.all(promises)
    return results
  }

  /**
   * 检查API端点的可用性
   * 针对API接口进行优化的检查
   */
  async checkApiEndpoint(baseUrl: string, endpoint: string = '/health', token?: string): Promise<HealthCheckResult> {
    const url = `${baseUrl.replace(/\/$/, '')}${endpoint}`
    const headers: Record<string, string> = {}

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return await this.checkHealth(url, {
      headers,
      expectedStatus: [200, 204, 404], // 404也认为是可达的
      timeout: 15000
    })
  }

  /**
   * 检查gpt-load实例的健康状态
   */
  async checkGptloadInstanceHealth(instanceUrl: string, token?: string): Promise<HealthCheckResult> {
    return await this.checkApiEndpoint(instanceUrl, '/api/health', token)
  }

  /**
   * 测试站点的可访问性
   * 用于验证实例是否能访问特定的AI站点
   */
  async testSiteAccessibility(siteUrl: string, timeout: number = 10000): Promise<ConnectivityResult> {
    // 对AI站点进行特殊处理
    const testUrl = siteUrl.includes('/v1') ? siteUrl : `${siteUrl}/v1`
    
    return await this.testConnectivity(testUrl, {
      timeout,
      expectedStatus: [200, 401, 403] // 401/403表示可达但需要认证
    })
  }

  /**
   * 获取健康检查统计信息
   */
  getHealthStatistics(results: HealthCheckResult[]): {
    total: number
    healthy: number
    unhealthy: number
    avgResponseTime: number
    healthyPercentage: number
  } {
    const total = results.length
    const healthy = results.filter(r => r.healthy).length
    const unhealthy = total - healthy
    const avgResponseTime = total > 0 ? 
      results.reduce((sum, r) => sum + r.responseTime, 0) / total : 0

    return {
      total,
      healthy,
      unhealthy,
      avgResponseTime: Math.round(avgResponseTime),
      healthyPercentage: total > 0 ? Math.round((healthy / total) * 100) : 0
    }
  }

  /**
   * 创建用于特定用途的健康检查器
   */
  static createCustomChecker(timeout: number = 10000): HealthChecker {
    const checker = new HealthChecker()
    
    // 重新配置客户端
    checker.healthClient = HttpClientFactory.createHealthClient({ timeout })
    checker.connectivityClient = HttpClientFactory.createConnectivityClient({ timeout })
    
    return checker
  }
}

export default HealthChecker