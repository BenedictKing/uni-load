/**
 * 实例健康检查管理器
 * 
 * 职责：专门负责gpt-load实例的健康检查、连接测试和状态管理
 * 从 multi-gptload.ts 中分离的健康检查逻辑
 */

import { AxiosInstance } from 'axios'
import { HttpClientFactory } from './http-client-factory'
import { GptloadInstance } from './instance-config-manager'

export interface HealthResult {
  healthy: boolean
  responseTime: number
  statusCode?: number
  error?: string
  lastCheck: Date
}

export interface ConnectivityResult {
  accessible: boolean
  responseTime: number
  error?: string
  statusCode?: number
}

export interface InstanceHealthStatus extends GptloadInstance {
  health: HealthResult
  apiClient: AxiosInstance
}

export class InstanceHealthManager {
  private healthCache = new Map<string, HealthResult>()
  private readonly healthCheckTimeout = 10000 // 10秒超时

  /**
   * 检查单个实例的健康状态
   */
  async checkInstanceHealth(instance: GptloadInstance): Promise<HealthResult> {
    const startTime = Date.now()
    const result: HealthResult = {
      healthy: false,
      responseTime: 0,
      lastCheck: new Date()
    }

    try {
      console.log(`🔍 检查实例健康状态: ${instance.name} (${instance.url})`)

      // 创建专门用于健康检查的客户端（不包含 /api 前缀）
      const healthClient = HttpClientFactory.createHealthClient({
        baseURL: instance.url,
        timeout: this.healthCheckTimeout
      })

      const response = await healthClient.get('/health')

      result.responseTime = Date.now() - startTime
      result.statusCode = response.status

      if (response.status === 200) {
        result.healthy = true
        console.log(`✅ 实例 ${instance.name} 健康检查通过 (${result.responseTime}ms)`)
      } else {
        result.error = `HTTP ${response.status}`
        console.warn(`⚠️ 实例 ${instance.name} 返回非200状态: ${response.status}`)
      }

    } catch (error: any) {
      result.responseTime = Date.now() - startTime
      result.error = error.message
      
      if (error.code === 'ECONNREFUSED') {
        result.error = '连接被拒绝'
      } else if (error.code === 'ETIMEDOUT') {
        result.error = '连接超时'
      } else if (error.response) {
        result.statusCode = error.response.status
        result.error = `HTTP ${error.response.status}`
      }

      console.error(`❌ 实例 ${instance.name} 健康检查失败: ${result.error}`)
    }

    // 缓存结果
    this.healthCache.set(instance.id, result)
    return result
  }

  /**
   * 批量检查多个实例的健康状态
   */
  async checkAllInstancesHealth(instances: GptloadInstance[]): Promise<Map<string, HealthResult>> {
    const results = new Map<string, HealthResult>()
    
    console.log(`🩺 开始批量健康检查 (${instances.length} 个实例)`)
    
    const checkPromises = instances.map(async (instance) => {
      const result = await this.checkInstanceHealth(instance)
      results.set(instance.id, result)
      return { instanceId: instance.id, result }
    })

    await Promise.allSettled(checkPromises)

    const healthyCount = Array.from(results.values()).filter(r => r.healthy).length
    console.log(`📊 健康检查完成: ${healthyCount}/${instances.length} 个实例健康`)

    return results
  }

  /**
   * 测试实例对特定站点的连接性
   */
  async testSiteAccessibility(instance: GptloadInstance, targetUrl: string): Promise<ConnectivityResult> {
    const startTime = Date.now()
    const result: ConnectivityResult = {
      accessible: false,
      responseTime: 0
    }

    try {
      console.log(`🔗 测试连接性: ${instance.name} -> ${targetUrl}`)

      const apiClient = this.createApiClient(instance)
      
      // 通过实例测试目标站点的连接性
      const testEndpoint = '/test-connectivity'
      const response = await apiClient.post(testEndpoint, {
        url: targetUrl,
        timeout: 5000
      }, { timeout: this.healthCheckTimeout })

      result.responseTime = Date.now() - startTime
      result.statusCode = response.status

      if (response.status === 200 && response.data.accessible) {
        result.accessible = true
        console.log(`✅ ${instance.name} 可以访问 ${targetUrl} (${result.responseTime}ms)`)
      } else {
        result.error = response.data.error || '连接测试失败'
        console.warn(`⚠️ ${instance.name} 无法访问 ${targetUrl}: ${result.error}`)
      }

    } catch (error: any) {
      result.responseTime = Date.now() - startTime
      result.error = error.message

      if (error.response?.status === 404) {
        // 如果实例不支持连接性测试，假设可以访问
        console.log(`💡 ${instance.name} 不支持连接性测试，假设可以访问`)
        result.accessible = true
        result.error = undefined
      } else {
        console.error(`❌ 连接性测试失败: ${instance.name} -> ${targetUrl}: ${result.error}`)
      }
    }

    return result
  }

  /**
   * 获取健康的实例列表
   */
  getHealthyInstances(instances: GptloadInstance[]): GptloadInstance[] {
    return instances.filter(instance => {
      const health = this.healthCache.get(instance.id)
      return health?.healthy === true
    })
  }

  /**
   * 获取实例的缓存健康状态
   */
  getCachedHealth(instanceId: string): HealthResult | undefined {
    return this.healthCache.get(instanceId)
  }

  /**
   * 清除健康状态缓存
   */
  clearHealthCache(instanceId?: string): void {
    if (instanceId) {
      this.healthCache.delete(instanceId)
      console.log(`🧹 已清除实例 ${instanceId} 的健康状态缓存`)
    } else {
      this.healthCache.clear()
      console.log(`🧹 已清除所有实例的健康状态缓存`)
    }
  }

  /**
   * 创建实例专用的API客户端
   */
  createApiClient(instance: GptloadInstance): AxiosInstance {
    // 使用HttpClientFactory创建统一的gptload客户端
    return HttpClientFactory.createGptloadClient(
      `${instance.url}/api`,
      instance.token,
      {
        timeout: this.healthCheckTimeout,
        userAgent: 'uni-load-health-checker/1.0.0'
      }
    )
  }

  /**
   * 获取实例健康统计信息
   */
  getHealthStatistics(instances: GptloadInstance[]): {
    total: number
    healthy: number
    unhealthy: number
    unknown: number
    healthyPercentage: number
  } {
    const total = instances.length
    let healthy = 0
    let unhealthy = 0
    let unknown = 0

    instances.forEach(instance => {
      const health = this.healthCache.get(instance.id)
      if (!health) {
        unknown++
      } else if (health.healthy) {
        healthy++
      } else {
        unhealthy++
      }
    })

    return {
      total,
      healthy,
      unhealthy,
      unknown,
      healthyPercentage: total > 0 ? (healthy / total) * 100 : 0
    }
  }

  /**
   * 执行深度健康检查
   */
  async performDeepHealthCheck(instance: GptloadInstance): Promise<{
    basic: HealthResult
    connectivity: ConnectivityResult[]
    details: {
      version?: string
      uptime?: number
      systemLoad?: number
    }
  }> {
    const basic = await this.checkInstanceHealth(instance)
    const connectivity: ConnectivityResult[] = []
    const details: any = {}

    if (basic.healthy) {
      try {
        const apiClient = this.createApiClient(instance)
        
        // 获取系统信息
        try {
          const systemResponse = await apiClient.get('/system/info')
          if (systemResponse.data) {
            details.version = systemResponse.data.version
            details.uptime = systemResponse.data.uptime
            details.systemLoad = systemResponse.data.load
          }
        } catch (error) {
          console.warn(`获取系统信息失败: ${error.message}`)
        }

        // 测试常见站点的连接性
        const testUrls = [
          'https://api.openai.com',
          'https://api.anthropic.com',
          'https://generativelanguage.googleapis.com'
        ]

        for (const url of testUrls) {
          const result = await this.testSiteAccessibility(instance, url)
          connectivity.push(result)
        }

      } catch (error) {
        console.warn(`深度健康检查失败: ${error.message}`)
      }
    }

    return { basic, connectivity, details }
  }

  /**
   * 定期健康检查任务
   */
  startPeriodicHealthCheck(instances: GptloadInstance[], intervalMs: number = 60000): NodeJS.Timeout {
    console.log(`🕐 启动定期健康检查，间隔: ${intervalMs / 1000}秒`)
    
    return setInterval(async () => {
      try {
        await this.checkAllInstancesHealth(instances)
      } catch (error) {
        console.error('定期健康检查失败:', error.message)
      }
    }, intervalMs)
  }
}

export default new InstanceHealthManager()