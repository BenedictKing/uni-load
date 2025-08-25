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
  public instances = new Map<string, InstanceHealthStatus>() // gptload实例配置
  private _siteAssignments = new Map<string, string>() // 站点到实例的分配
  public healthStatus = new Map<string, HealthResult>() // 新增 healthStatus 属性

  constructor() {
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
   * 获取所有实例状态信息（返回对象格式，便于按ID访问）
   */
  getAllInstancesStatus(): Record<string, { id: string; name: string; url: string; priority: number; healthy: boolean; responseTime: number; lastCheck: Date; error?: string }> {
    const instances = this.getAllInstances()
    const result: Record<string, any> = {}
    
    instances.forEach((instance) => {
      result[instance.id] = {
        id: instance.id,
        name: instance.name,
        url: instance.url,
        priority: instance.priority,
        healthy: instance.health.healthy,
        responseTime: instance.health.responseTime,
        lastCheck: instance.health.lastCheck,
        error: instance.health.error,
      }
    })
    
    return result
  }

  /**
   * 获取站点分配信息
   */
  getSiteAssignments(): Record<string, any> {
    const result: Record<string, any> = {}
    
    this._siteAssignments.forEach((instanceId, site) => {
      result[site] = {
        instanceId,
        instanceName: this.instances.get(instanceId)?.name,
      }
    })
    
    return result
  }

  /**
   * 获取所有实例的分组信息
   */
  async getAllGroups(): Promise<any[]> {
    const allGroups: any[] = []
    
    for (const instance of this.getAllInstances()) {
      if (!instance.health.healthy) {
        console.warn(`⚠️ 跳过不健康的实例: ${instance.name}`)
        continue
      }
      
      try {
        const response = await instance.apiClient.get('/groups')
        
        let groups = []
        if (response.data && typeof response.data.code === 'number' && response.data.data) {
          // gptload 特定格式: { code: 0, message: "Success", data: [...] }
          groups = response.data.data
        } else if (Array.isArray(response.data)) {
          // 直接返回数组
          groups = response.data
        } else if (response.data) {
          // 其他格式
          groups = [response.data]
        }
        
        // 为每个分组添加实例信息
        const groupsWithInstance = groups.map((group: any) => ({
          ...group,
          _instance: {
            id: instance.id,
            name: instance.name,
            url: instance.url,
          }
        }))
        
        allGroups.push(...groupsWithInstance)
        console.log(`✅ 从实例 ${instance.name} 获取到 ${groups.length} 个分组`)
        
      } catch (error) {
        console.warn(`⚠️ 从实例 ${instance.name} 获取分组失败: ${error.message}`)
        continue
      }
    }
    
    console.log(`📊 总共获取到 ${allGroups.length} 个分组`)
    return allGroups
  }

  /**
   * 创建站点分组
   */
  async createSiteGroup(
    siteName: string,
    baseUrl: string,
    apiKeys: string[],
    channelType: string = 'openai',
    customValidationEndpoints: any = {},
    availableModels: string[] | null = null,
    isModelGroup: boolean = false
  ): Promise<any> {
    const bestInstance = await this.selectBestInstance(baseUrl)
    if (!bestInstance) {
      throw new Error('没有健康的实例可用于创建站点分组')
    }

    // 构建分组数据
    const groupData: any = {
      name: siteName,
      display_name: `${siteName} 渠道`,
      description: `${siteName} 通过 ${channelType} 格式提供API服务`,
      upstreams: [
        {
          url: baseUrl,
          weight: 1,
        },
      ],
      channel_type: channelType,
      validation_endpoint: customValidationEndpoints[channelType] || this.getChannelConfig(channelType).validation_endpoint,
      sort: isModelGroup ? 10 : 20, // 模型分组为10，站点分组为20
      param_overrides: {},
      config: {
        blacklist_threshold: 3,
        key_validation_interval_minutes: 30,
      },
    }

    // 如果有可用模型列表，设置测试模型
    if (availableModels && availableModels.length > 0) {
      groupData.test_model = availableModels[0]
    }

    // 设置tags
    if (isModelGroup) {
      groupData.tags = ['layer-3', 'aggregate']
      if (availableModels && availableModels.length > 0) {
        groupData.tags.push(availableModels[0])
      }
    } else {
      groupData.tags = ['layer-1', 'site', channelType]
    }

    try {
      // 调用API创建分组
      const response = await bestInstance.apiClient.post('/groups', groupData)

      // 处理响应
      let created
      if (response.data && typeof response.data.code === 'number') {
        if (response.data.code === 0) {
          created = response.data.data
        } else {
          throw new Error(`创建失败: ${response.data.message}`)
        }
      } else {
        created = response.data
      }

      // 添加实例信息
      created._instance = {
        id: bestInstance.id,
        name: bestInstance.name,
        url: bestInstance.url,
      }

      // 如果有API密钥，添加到分组
      if (apiKeys && apiKeys.length > 0) {
        await this.addApiKeysToGroup(bestInstance, created.id, apiKeys)
      }

      return created
    } catch (error) {
      throw new Error(`创建站点分组失败: ${error.message}`)
    }
  }

  /**
   * 获取渠道配置
   */
  getChannelConfig(channelType: string): any {
    // 暂时返回基本配置，需要根据实际需求实现
    const configs = {
      openai: {
        validation_endpoint: '/v1/models'
      },
      anthropic: {
        validation_endpoint: '/v1/models'
      },
      gemini: {
        validation_endpoint: '/v1/models'
      }
    }
    
    return configs[channelType] || configs.openai
  }

  /**
   * 选择测试模型
   */
  selectTestModel(availableModels: string[] | null, channelType: string): string {
    const defaultModels = {
      openai: 'gpt-3.5-turbo',
      anthropic: 'claude-3-haiku-20240307',
      gemini: 'gemini-pro'
    }
    
    if (availableModels && availableModels.length > 0) {
      return availableModels[0]
    }
    
    return defaultModels[channelType] || defaultModels.openai
  }

  /**
   * 向分组添加API密钥
   */
  async addApiKeysToGroup(instance: any, groupId: string, apiKeys: string[]): Promise<any> {
    try {
      const response = await instance.apiClient.post('/keys', {
        group_id: groupId,
        keys: apiKeys.map(key => ({
          key_value: key,
          status: 'active'
        }))
      })
      
      return response.data
    } catch (error) {
      console.error(`向分组 ${groupId} 添加API密钥失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 删除分组
   */
  async deleteGroup(instance: any, groupId: string): Promise<boolean> {
    try {
      await instance.apiClient.delete(`/groups/${groupId}`)
      return true
    } catch (error) {
      console.error(`删除分组 ${groupId} 失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 删除分组的所有API密钥
   */
  async deleteAllApiKeysFromGroup(instance: any, groupId: string): Promise<any> {
    try {
      // 先获取分组的所有密钥
      const response = await instance.apiClient.get('/keys', {
        params: { group_id: groupId }
      })
      
      if (response.data && response.data.data && response.data.data.items) {
        const keys = response.data.data.items
        
        // 删除每个密钥
        for (const keyItem of keys) {
          try {
            await instance.apiClient.delete(`/keys/${keyItem.id}`)
          } catch (error) {
            console.warn(`删除密钥 ${keyItem.id} 失败: ${error.message}`)
          }
        }
        
        return { deleted: keys.length }
      }
      
      return { deleted: 0 }
    } catch (error) {
      console.error(`删除分组 ${groupId} 的所有密钥失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 切换分组API密钥状态
   */
  async toggleApiKeysStatusForGroup(instance: any, groupId: string, status: string): Promise<any> {
    try {
      // 先获取分组的所有密钥
      const response = await instance.apiClient.get('/keys', {
        params: { group_id: groupId }
      })
      
      if (response.data && response.data.data && response.data.data.items) {
        const keys = response.data.data.items
        
        // 更新每个密钥的状态
        for (const keyItem of keys) {
          try {
            await instance.apiClient.put(`/keys/${keyItem.id}`, {
              status: status
            })
          } catch (error) {
            console.warn(`更新密钥 ${keyItem.id} 状态失败: ${error.message}`)
          }
        }
        
        return { updated: keys.length }
      }
      
      return { updated: 0 }
    } catch (error) {
      console.error(`切换分组 ${groupId} 密钥状态失败: ${error.message}`)
      throw error
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
