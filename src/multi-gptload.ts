import axios from 'axios'
import https from 'https'
import modelConfig from './model-config'
import instanceConfigManager, { GptloadInstance } from './services/instance-config-manager'
import instanceHealthManager, { HealthResult, InstanceHealthStatus } from './services/instance-health-manager'

/**
 * 多实例协调器
 *
 * 职责：协调多个gpt-load实例的选择、分配和管理
 * 依赖分离的配置管理器和健康检查管理器
 */
export class MultiGptloadManager {
  private instances = new Map<string, GptloadInstance>() // gptload实例配置
  private _siteAssignments = new Map<string, string>() // 站点到实例的分配
  private httpsAgent: https.Agent

  constructor() {
    // 创建允许自签名证书的 HTTPS Agent
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, // 允许自签名证书和无效证书
    })

    // 异步初始化实例
    this.initializeInstances().catch((error) => {
      console.error('初始化实例失败:', error)
      process.exit(1) // 如果配置文件不存在，强制退出
    })
  }

  /**
   * 初始化gptload实例配置
   */
  async initializeInstances() {
    try {
      // 使用配置管理器加载配置
      const instancesConfig = await instanceConfigManager.loadInstancesConfig()

      // 按优先级排序并添加实例
      const sortedInstances = instanceConfigManager.sortInstancesByPriority(instancesConfig)

      for (const config of sortedInstances) {
        this.addInstance(config)
      }

      console.log(`🌐 初始化了 ${this.instances.size} 个 gpt-load 实例`)

      // 立即进行一次健康检查
      setTimeout(() => {
        this.checkAllInstancesHealth().catch((error) => {
          console.error('初始健康检查失败:', error)
        })
      }, 1000) // 延迟1秒执行，让服务器完全启动
    } catch (error) {
      console.error('初始化实例配置失败:', error.message)
      throw error
    }
  }

  /**
   * 添加gptload实例
   */
  addInstance(config: GptloadInstance): void {
    // 验证实例连接配置
    if (!instanceConfigManager.validateInstanceConnection(config)) {
      console.error(`❌ 实例配置无效，跳过: ${config.name}`)
      return
    }

    // 创建API客户端
    const apiClient = instanceHealthManager.createApiClient(config)

    const instance: InstanceHealthStatus = {
      ...config,
      health: {
        healthy: false,
        responseTime: 0,
        lastCheck: new Date(),
      },
      apiClient,
    }

    this.instances.set(config.id, instance)
    console.log(`➕ 添加实例: ${instanceConfigManager.getInstanceDisplayInfo(config)}`)
  }

  /**
   * 检查所有实例的健康状态
   */
  async checkAllInstancesHealth(): Promise<Map<string, HealthResult>> {
    const instances = Array.from(this.instances.values())
    const healthResults = await instanceHealthManager.checkAllInstancesHealth(instances)

    // 更新本地健康状态
    for (const [instanceId, health] of healthResults) {
      const instance = this.instances.get(instanceId)
      if (instance) {
        instance.health = health
      }
    }

    return healthResults
  }

  /**
   * 获取健康的实例列表
   */
  async getHealthyInstances(): Promise<InstanceHealthStatus[]> {
    const allInstances = Array.from(this.instances.values())
    return instanceHealthManager.getHealthyInstances(allInstances) as InstanceHealthStatus[]
  }

  /**
   * 选择最佳实例
   */
  async selectBestInstance(siteUrl: string = ''): Promise<InstanceHealthStatus | null> {
    // 检查是否有预分配的实例
    const assignedInstanceId = this._siteAssignments.get(siteUrl)
    if (assignedInstanceId) {
      const assignedInstance = this.instances.get(assignedInstanceId)
      if (assignedInstance && assignedInstance.health.healthy) {
        console.log(`🎯 使用预分配实例: ${assignedInstance.name} for ${siteUrl}`)
        return assignedInstance
      } else {
        console.warn(`⚠️ 预分配实例不健康，重新选择: ${assignedInstanceId}`)
        this._siteAssignments.delete(siteUrl)
      }
    }

    // 获取健康实例并按优先级排序
    const healthyInstances = await this.getHealthyInstances()

    if (healthyInstances.length === 0) {
      console.error('❌ 没有健康的gptload实例可用')
      return null
    }

    // 如果提供了站点URL，测试连接性
    if (siteUrl) {
      for (const instance of healthyInstances) {
        const connectivityResult = await instanceHealthManager.testSiteAccessibility(instance, siteUrl)
        if (connectivityResult.accessible) {
          console.log(`✅ 选择实例: ${instance.name} for ${siteUrl}`)
          // 记录分配
          this._siteAssignments.set(siteUrl, instance.id)
          return instance
        }
      }

      console.warn(`⚠️ 没有实例能访问 ${siteUrl}，使用默认实例`)
    }

    // 返回第一个健康实例（按优先级排序）
    const selectedInstance = healthyInstances[0]
    console.log(`🔀 选择默认实例: ${selectedInstance.name}`)

    if (siteUrl) {
      this._siteAssignments.set(siteUrl, selectedInstance.id)
    }

    return selectedInstance
  }

  /**
   * 获取指定实例
   */
  getInstance(instanceId: string): InstanceHealthStatus | undefined {
    return this.instances.get(instanceId)
  }

  /**
   * 获取所有实例
   */
  getAllInstances(): InstanceHealthStatus[] {
    return Array.from(this.instances.values())
  }

  /**
   * 重新分配站点到指定实例
   */
  async reassignSite(siteUrl: string, instanceId?: string): Promise<void> {
    if (instanceId) {
      const instance = this.instances.get(instanceId)
      if (!instance) {
        throw new Error(`实例不存在: ${instanceId}`)
      }

      this._siteAssignments.set(siteUrl, instanceId)
      console.log(`🔄 已将站点 ${siteUrl} 分配到实例 ${instance.name}`)
    } else {
      this._siteAssignments.delete(siteUrl)
      console.log(`🧹 已清除站点 ${siteUrl} 的分配`)
    }
  }

  /**
   * 获取多实例状态信息
   */
  getStatus(): any {
    const instances = this.getAllInstances()
    const stats = instanceHealthManager.getHealthStatistics(instances)

    return {
      total: stats.total,
      healthy: stats.healthy,
      unhealthy: stats.unhealthy,
      healthyPercentage: stats.healthyPercentage,
      instances: instances.map((instance) => ({
        id: instance.id,
        name: instance.name,
        url: instance.url,
        priority: instance.priority,
        healthy: instance.health.healthy,
        responseTime: instance.health.responseTime,
        lastCheck: instance.health.lastCheck,
        error: instance.health.error,
      })),
      siteAssignments: Array.from(this._siteAssignments.entries()).map(([site, instanceId]) => ({
        site,
        instanceId,
        instanceName: this.instances.get(instanceId)?.name,
      })),
    }
  }

  /**
   * 通过多实例获取模型列表
   */
  async getModelsViaMultiInstance(
    baseUrl: string,
    apiKey: string
  ): Promise<{
    models: any[]
    instanceId: string
    instanceName: string
  }> {
    const healthyInstances = await this.getHealthyInstances()

    if (healthyInstances.length === 0) {
      throw new Error('没有健康的gptload实例可用')
    }

    for (const instance of healthyInstances) {
      try {
        console.log(`🔍 尝试通过实例 ${instance.name} 获取模型...`)

        const response = await instance.apiClient.post('/models/fetch', {
          baseUrl,
          apiKey,
          timeout: 30000,
        })

        let models = []
        if (response.data && response.data.code === 0) {
          models = response.data.data || []
        } else if (Array.isArray(response.data)) {
          models = response.data
        }

        if (models.length > 0) {
          console.log(`✅ 实例 ${instance.name} 成功获取 ${models.length} 个模型`)
          return {
            models,
            instanceId: instance.id,
            instanceName: instance.name,
          }
        }
      } catch (error) {
        console.warn(`⚠️ 实例 ${instance.name} 获取模型失败: ${error.message}`)
        continue
      }
    }

    throw new Error('所有健康实例都无法获取模型列表')
  }

  /**
   * 启动定期健康检查
   */
  startPeriodicHealthCheck(intervalMs: number = 60000): NodeJS.Timeout {
    const instances = this.getAllInstances()
    return instanceHealthManager.startPeriodicHealthCheck(instances, intervalMs)
  }

  // 公开访问器，保持向后兼容
  get siteAssignments() {
    return this._siteAssignments
  }
}

export default MultiGptloadManager
