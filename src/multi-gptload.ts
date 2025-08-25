import axios from "axios";
import https from "https";
import modelConfig from "./model-config";
import instanceConfigManager, { GptloadInstance } from "./services/instance-config-manager";
import instanceHealthManager, { HealthResult, InstanceHealthStatus } from "./services/instance-health-manager";

/**
 * 多实例协调器
 * 
 * 职责：协调多个gpt-load实例的选择、分配和管理
 * 依赖分离的配置管理器和健康检查管理器
 */
export class MultiGptloadManager {
  private instances = new Map<string, GptloadInstance>() // gptload实例配置
  private siteAssignments = new Map<string, string>() // 站点到实例的分配
  private httpsAgent: https.Agent

  constructor() {
    // 创建允许自签名证书的 HTTPS Agent
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, // 允许自签名证书和无效证书
    });

    // 异步初始化实例
    this.initializeInstances().catch(error => {
      console.error("初始化实例失败:", error);
      process.exit(1); // 如果配置文件不存在，强制退出
    });
  }

  /**
   * 初始化gptload实例配置
   */
  async initializeInstances() {
    try {
      // 使用配置管理器加载配置
      const instancesConfig = await instanceConfigManager.loadInstancesConfig();
      
      // 按优先级排序并添加实例
      const sortedInstances = instanceConfigManager.sortInstancesByPriority(instancesConfig);
      
      for (const config of sortedInstances) {
        this.addInstance(config);
      }

      console.log(`🌐 初始化了 ${this.instances.size} 个 gpt-load 实例`);

      // 立即进行一次健康检查
      setTimeout(() => {
        this.checkAllInstancesHealth().catch((error) => {
          console.error("初始健康检查失败:", error);
        });
      }, 1000); // 延迟1秒执行，让服务器完全启动
    } catch (error) {
      console.error("初始化实例配置失败:", error.message);
      throw error;
    }
  }

  /**
   * 添加gptload实例
   */
  addInstance(config: GptloadInstance): void {
    // 验证实例连接配置
    if (!instanceConfigManager.validateInstanceConnection(config)) {
      console.error(`❌ 实例配置无效，跳过: ${config.name}`);
      return;
    }

    // 创建API客户端
    const apiClient = instanceHealthManager.createApiClient(config);

    const instance: InstanceHealthStatus = {
      ...config,
      health: {
        healthy: false,
        responseTime: 0,
        lastCheck: new Date()
      },
      apiClient
    };

    this.instances.set(config.id, instance);
    console.log(`➕ 添加实例: ${instanceConfigManager.getInstanceDisplayInfo(config)}`);
  }

  /**
   * 检查所有实例的健康状态
   */
  async checkAllInstancesHealth(): Promise<Map<string, HealthResult>> {
    const instances = Array.from(this.instances.values());
    const healthResults = await instanceHealthManager.checkAllInstancesHealth(instances);
    
    // 更新本地健康状态
    for (const [instanceId, health] of healthResults) {
      const instance = this.instances.get(instanceId);
      if (instance) {
        instance.health = health;
      }
    }
    
    return healthResults;
  }

  /**
   * 获取健康的实例列表
   */
  async getHealthyInstances(): Promise<InstanceHealthStatus[]> {
    const allInstances = Array.from(this.instances.values());
    return instanceHealthManager.getHealthyInstances(allInstances) as InstanceHealthStatus[];
  }

  /**
   * 选择最佳实例
   */
  async selectBestInstance(siteUrl: string = ''): Promise<InstanceHealthStatus | null> {
    // 检查是否有预分配的实例
    const assignedInstanceId = this.siteAssignments.get(siteUrl);
    if (assignedInstanceId) {
      const assignedInstance = this.instances.get(assignedInstanceId);
      if (assignedInstance && assignedInstance.health.healthy) {
        console.log(`🎯 使用预分配实例: ${assignedInstance.name} for ${siteUrl}`);
        return assignedInstance;
      } else {
        console.warn(`⚠️ 预分配实例不健康，重新选择: ${assignedInstanceId}`);
        this.siteAssignments.delete(siteUrl);
      }
    }

    // 获取健康实例并按优先级排序
    const healthyInstances = await this.getHealthyInstances();
    
    if (healthyInstances.length === 0) {
      console.error('❌ 没有健康的gptload实例可用');
      return null;
    }

    // 如果提供了站点URL，测试连接性
    if (siteUrl) {
      for (const instance of healthyInstances) {
        const connectivityResult = await instanceHealthManager.testSiteAccessibility(instance, siteUrl);
        if (connectivityResult.accessible) {
          console.log(`✅ 选择实例: ${instance.name} for ${siteUrl}`);
          // 记录分配
          this.siteAssignments.set(siteUrl, instance.id);
          return instance;
        }
      }
      
      console.warn(`⚠️ 没有实例能访问 ${siteUrl}，使用默认实例`);
    }

    // 返回第一个健康实例（按优先级排序）
    const selectedInstance = healthyInstances[0];
    console.log(`🔀 选择默认实例: ${selectedInstance.name}`);
    
    if (siteUrl) {
      this.siteAssignments.set(siteUrl, selectedInstance.id);
    }
    
    return selectedInstance;
  }

  /**
   * 获取指定实例
   */
  getInstance(instanceId: string): InstanceHealthStatus | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * 获取所有实例
   */
  getAllInstances(): InstanceHealthStatus[] {
    return Array.from(this.instances.values());
  }

  /**
   * 重新分配站点到指定实例
   */
  async reassignSite(siteUrl: string, instanceId?: string): Promise<void> {
    if (instanceId) {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`实例不存在: ${instanceId}`);
      }
      
      this.siteAssignments.set(siteUrl, instanceId);
      console.log(`🔄 已将站点 ${siteUrl} 分配到实例 ${instance.name}`);
    } else {
      this.siteAssignments.delete(siteUrl);
      console.log(`🧹 已清除站点 ${siteUrl} 的分配`);
    }
  }

  /**
   * 获取多实例状态信息
   */
  getStatus(): any {
    const instances = this.getAllInstances();
    const stats = instanceHealthManager.getHealthStatistics(instances);
    
    return {
      total: stats.total,
      healthy: stats.healthy,
      unhealthy: stats.unhealthy,
      healthyPercentage: stats.healthyPercentage,
      instances: instances.map(instance => ({
        id: instance.id,
        name: instance.name,
        url: instance.url,
        priority: instance.priority,
        healthy: instance.health.healthy,
        responseTime: instance.health.responseTime,
        lastCheck: instance.health.lastCheck,
        error: instance.health.error
      })),
      siteAssignments: Array.from(this.siteAssignments.entries()).map(([site, instanceId]) => ({
        site,
        instanceId,
        instanceName: this.instances.get(instanceId)?.name
      }))
    };
  }

  /**
   * 通过多实例获取模型列表
   */
  async getModelsViaMultiInstance(baseUrl: string, apiKey: string): Promise<{
    models: any[];
    instanceId: string;
    instanceName: string;
  }> {
    const healthyInstances = await this.getHealthyInstances();
    
    if (healthyInstances.length === 0) {
      throw new Error('没有健康的gptload实例可用');
    }

    for (const instance of healthyInstances) {
      try {
        console.log(`🔍 尝试通过实例 ${instance.name} 获取模型...`);
        
        const response = await instance.apiClient.post('/models/fetch', {
          baseUrl,
          apiKey,
          timeout: 30000
        });

        let models = [];
        if (response.data && response.data.code === 0) {
          models = response.data.data || [];
        } else if (Array.isArray(response.data)) {
          models = response.data;
        }

        if (models.length > 0) {
          console.log(`✅ 实例 ${instance.name} 成功获取 ${models.length} 个模型`);
          return {
            models,
            instanceId: instance.id,
            instanceName: instance.name
          };
        }
        
      } catch (error) {
        console.warn(`⚠️ 实例 ${instance.name} 获取模型失败: ${error.message}`);
        continue;
      }
    }

    throw new Error('所有健康实例都无法获取模型列表');
  }

  /**
   * 启动定期健康检查
   */
  startPeriodicHealthCheck(intervalMs: number = 60000): NodeJS.Timeout {
    const instances = this.getAllInstances();
    return instanceHealthManager.startPeriodicHealthCheck(instances, intervalMs);
  }

  // 公开访问器，保持向后兼容
  get siteAssignments() {
    return this.siteAssignments;
  }
}

  /**
   * 检查所有实例的健康状态
   */
  async checkAllInstancesHealth() {
    console.log("🩺 检查所有 gptload 实例健康状态...");

    const checkPromises = Array.from(this.instances.keys()).map((instanceId) =>
      this.checkInstanceHealth(instanceId)
    );

    await Promise.allSettled(checkPromises);

    const healthyCount = Array.from(this.healthStatus.values()).filter(
      (status) => status.healthy
    ).length;

    console.log(`✅ ${healthyCount}/${this.instances.size} 个实例健康`);
  }

  /**
   * 检查单个实例健康状态
   */
  async checkInstanceHealth(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    try {
      const startTime = Date.now();
      const response = await instance.apiClient.get("/groups");
      const responseTime = Date.now() - startTime;

      // 处理不同的响应格式
      let groupsCount = 0;
      if (Array.isArray(response.data)) {
        groupsCount = response.data.length;
      } else if (response.data && Array.isArray(response.data.data)) {
        groupsCount = response.data.data.length;
      } else if (
        response.data &&
        typeof response.data.code === "number" &&
        Array.isArray(response.data.data)
      ) {
        // gptload 特定格式: { code: 0, message: "Success", data: [...] }
        groupsCount = response.data.data.length;
      } else if (response.data && Array.isArray(response.data.groups)) {
        groupsCount = response.data.groups.length;
      }

      this.healthStatus.set(instanceId, {
        healthy: true,
        lastCheck: new Date().toISOString(),
        responseTime,
        groupsCount,
        error: null,
      });

      console.log(
        `✅ ${instance.name}: 健康 (${responseTime}ms, ${groupsCount} 个分组)`
      );
    } catch (error) {
      this.healthStatus.set(instanceId, {
        healthy: false,
        lastCheck: new Date().toISOString(),
        responseTime: null,
        groupsCount: 0,
        error: error.message,
      });

      console.log(`❌ ${instance.name}: 不健康 - ${error.message}`);
    }
  }

  /**
   * 为站点选择最佳的gptload实例
   */
  async selectBestInstance(siteUrl, options = {}) {
    // 首先检查是否有预分配的实例
    const existingAssignment = this.siteAssignments.get(siteUrl);
    if (existingAssignment) {
      const instance = this.instances.get(existingAssignment);
      const health = this.healthStatus.get(existingAssignment);

      if (instance && health?.healthy) {
        console.log(`🎯 使用预分配实例 ${instance.name} 处理 ${siteUrl}`);
        return instance;
      } else {
        // 预分配的实例不健康，移除分配
        this.siteAssignments.delete(siteUrl);
      }
    }

    // 测试站点可访问性并选择最佳实例
    const bestInstance = await this.findBestInstanceForSite(siteUrl, options);

    if (bestInstance) {
      // 记录分配
      this.siteAssignments.set(siteUrl, bestInstance.id);
      console.log(`📌 分配站点 ${siteUrl} 到实例 ${bestInstance.name}`);
    }

    return bestInstance;
  }

  /**
   * 验证现有渠道分组的模型可用性（用于启动时验证）
   */
  async validateExistingChannelModels() {
    console.log("🔍 开始验证现有渠道分组的模型可用性...");
    
    const allGroups = await this.getAllGroups();
    const channelGroups = allGroups.filter(group => group.sort === 20); // 渠道分组 sort=20
    
    if (channelGroups.length === 0) {
      console.log("ℹ️ 未发现现有渠道分组");
      return { validChannels: [], invalidChannels: [], availableModels: {} };
    }
    
    console.log(`📋 发现 ${channelGroups.length} 个渠道分组，开始验证...`);
    
    const validChannels = [];
    const invalidChannels = [];
    const availableModels = {}; // 按渠道分组分类的可用模型
    
    for (const channel of channelGroups) {
      const instance = this.instances.get(channel._instance?.id);
      if (!instance || !this.healthStatus.get(instance.id)?.healthy) {
        console.log(`⚠️ 渠道分组 ${channel.name} 所在实例不健康，跳过验证`);
        invalidChannels.push({ ...channel, reason: 'instance_unhealthy' });
        continue;
      }
      
      try {
        console.log(`🔄 验证渠道分组 ${channel.name}...`);
        
        // 通过代理获取模型列表来验证渠道可用性
        const proxyUrl = `${instance.url}/proxy/${channel.name}/v1/models`;
        const { default: axios } = await import('axios');
        
        const modelsResponse = await axios.get(proxyUrl, {
          timeout: 15000,
          httpsAgent: this.httpsAgent,
          headers: {
            'Authorization': `Bearer ${instance.token || 'dummy-token'}`,
            'Content-Type': 'application/json',
            'User-Agent': 'uni-load/1.0.0',
          },
          validateStatus: (status) => status < 500,
        });
        
        if (modelsResponse.status === 200) {
          const { default: modelsService } = await import("./models");
          const models = modelsService.parseModelsResponse(modelsResponse.data);
          
          if (models && models.length > 0) {
            validChannels.push(channel);
            availableModels[channel.name] = models;
            console.log(`✅ 渠道分组 ${channel.name} 验证成功，发现 ${models.length} 个模型`);
          } else {
            invalidChannels.push({ ...channel, reason: 'no_models' });
            console.log(`⚠️ 渠道分组 ${channel.name} 返回空模型列表`);
          }
        } else {
          invalidChannels.push({ ...channel, reason: `http_${modelsResponse.status}` });
          console.log(`❌ 渠道分组 ${channel.name} 验证失败: HTTP ${modelsResponse.status}`);
        }
      } catch (error) {
        invalidChannels.push({ ...channel, reason: error.message });
        console.log(`❌ 渠道分组 ${channel.name} 验证出错: ${error.message}`);
      }
    }
    
    console.log(`🏁 渠道验证完成: 成功 ${validChannels.length} 个，失败 ${invalidChannels.length} 个`);
    
    return {
      validChannels,
      invalidChannels,
      availableModels
    };
  }

  /**
   * 为站点找到最佳实例（优化版本，优先使用现有分组）
   */
  async findBestInstanceForSite(siteUrl, options) {
    // 获取健康的实例，按优先级排序
    let healthyInstances = Array.from(this.instances.values())
      .filter((instance) => this.healthStatus.get(instance.id)?.healthy)
      .sort((a, b) => a.priority - b.priority);

    if (healthyInstances.length === 0) {
      console.log("⚠️ 没有健康的 gptload 实例，执行健康检查...");
      await this.checkAllInstancesHealth();
      
      healthyInstances = Array.from(this.instances.values())
        .filter((instance) => this.healthStatus.get(instance.id)?.healthy)
        .sort((a, b) => a.priority - b.priority);

      if (healthyInstances.length === 0) {
        console.log("❌ 健康检查后仍没有健康的 gptload 实例可用");
        return null;
      }

      console.log(`✅ 健康检查后发现 ${healthyInstances.length} 个健康实例`);
    }

    console.log(`🔍 为站点 ${siteUrl} 寻找最佳实例...`);

    // 首先检查是否已有该站点的渠道分组
    const existingChannels = await this.findExistingChannelGroupsForSite(siteUrl);
    
    if (existingChannels.length > 0) {
      console.log(`✅ 发现 ${existingChannels.length} 个现有渠道分组，直接使用`);
      
      // 选择第一个健康的实例上的渠道分组
      for (const channel of existingChannels) {
        const instance = this.instances.get(channel._instance?.id);
        if (instance && this.healthStatus.get(instance.id)?.healthy) {
          console.log(`🎯 选择实例 ${instance.name}，已有渠道分组 ${channel.name}`);
          return instance;
        }
      }
    }

    // 如果没有现有渠道分组，才创建临时分组验证
    console.log(`ℹ️ 未找到现有渠道分组，进行连通性验证...`);
    
    for (let i = 0; i < healthyInstances.length; i++) {
      const instance = healthyInstances[i];
      
      console.log(`🔄 [${i + 1}/${healthyInstances.length}] 测试实例 ${instance.name} 对 ${siteUrl} 的访问...`);
      
      try {
        const canAccess = await this.testSiteAccessibility(
          instance,
          siteUrl,
          { ...options, testApiKey: options.apiKey }
        );

        if (canAccess) {
          console.log(`✅ 实例 ${instance.name} 可以访问 ${siteUrl}`);
          return instance;
        } else {
          console.log(`❌ 实例 ${instance.name} 无法访问 ${siteUrl}`);
        }
      } catch (error) {
        console.error(`❌ 测试实例 ${instance.name} 时发生错误: ${error.message}`);
      }
    }

    console.log(`❌ 所有实例都无法访问 ${siteUrl}`);
    return null;
  }

  /**
   * 根据站点URL查找现有的渠道分组
   */
  async findExistingChannelGroupsForSite(siteUrl) {
    try {
      const allGroups = await this.getAllGroups();
      const channelGroups = allGroups.filter(group => group.sort === 20); // 渠道分组 sort=20
      
      // 匹配包含相同域名的渠道分组
      const matchingChannels = channelGroups.filter(group => {
        if (!group.upstreams || group.upstreams.length === 0) {
          return false;
        }
        
        try {
          const upstreamUrl = group.upstreams[0].url;
          const siteHost = new URL(siteUrl).host;
          const upstreamHost = new URL(upstreamUrl).host;
          return siteHost === upstreamHost;
        } catch (error) {
          return false;
        }
      });
      
      return matchingChannels;
    } catch (error) {
      console.error(`查找现有渠道分组失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 测试实例是否可以访问指定站点（通过创建临时站点分组测试）
   */
  async testSiteAccessibility(instance, siteUrl, options) {
    let tempGroupId = null;
    
    try {
      console.log(`🔍 测试实例 ${instance.name} 是否可以访问 ${siteUrl}...`);
      
      // 1. 先确保实例本身是健康的
      const healthResponse = await instance.apiClient.get("/groups");
      console.log(`✅ 实例 ${instance.name} 健康检查通过`);
      
      // 2. 创建临时站点分组来测试连通性
      const tempGroupName = `temp-test-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
      console.log(`🧪 创建临时测试分组: ${tempGroupName}`);
      
      const tempGroupData = {
        name: tempGroupName,
        display_name: `临时连通性测试分组`,
        description: `临时分组，用于测试到 ${siteUrl} 的连通性`,
        upstreams: [{ url: siteUrl, weight: 1 }],
        channel_type: "openai",
        test_model: "gpt-4o-mini", // 使用安全的小模型
        validation_endpoint: "/v1/chat/completions",
        sort: 99, // 最低优先级
        config: {
          blacklist_threshold: 1, // 快速失败
        },
      };
      
      // 3. 创建临时分组
      const createResponse = await instance.apiClient.post("/groups", tempGroupData);
      
      // 处理响应格式
      let tempGroup;
      if (createResponse.data && typeof createResponse.data.code === "number") {
        tempGroup = createResponse.data.data;
      } else {
        tempGroup = createResponse.data;
      }
      
      tempGroupId = tempGroup.id;
      console.log(`✅ 临时分组创建成功: ${tempGroupId}`);
      
      // 4. 添加一个临时API密钥（如果站点需要认证）
      if (options.testApiKey) {
        try {
          await this.addApiKeysToGroup(instance, tempGroupId, [options.testApiKey]);
          console.log(`🔑 已为临时分组添加测试密钥`);
        } catch (keyError) {
          console.warn(`⚠️ 添加测试密钥失败: ${keyError.message}`);
        }
      }
      
      // 5. 通过实例代理测试站点连通性（测试models端点）
      const proxyUrl = `${instance.url}/proxy/${tempGroupName}/v1/models`;
      console.log(`🔗 通过代理测试连通性: ${proxyUrl}`);
      
      // 使用 axios 直接请求完整URL
      const axios = require('axios');
      const testResponse = await axios.get(proxyUrl, {
        timeout: 10000, // 10秒超时
        httpsAgent: this.httpsAgent,
        headers: {
          'Authorization': `Bearer ${options.testApiKey || 'dummy-key'}`,
          'User-Agent': 'uni-load/1.0.0',
        },
        validateStatus: (status) => status < 500, // 4xx可接受，5xx表示服务器问题
      });
      
      console.log(`📡 代理测试响应: ${testResponse.status} ${testResponse.statusText}`);
      
      // 6. 根据响应判断连通性
      if (testResponse.status === 200 || testResponse.status === 401 || testResponse.status === 403) {
        // 200: 成功访问
        // 401/403: 站点可达但需要认证，说明连通性OK
        console.log(`✅ 实例 ${instance.name} 可以通过代理访问 ${siteUrl}`);
        return true;
      } else {
        console.log(`❌ 实例 ${instance.name} 代理访问 ${siteUrl} 返回状态: ${testResponse.status}`);
        return false;
      }
      
    } catch (error) {
      console.log(`❌ 实例 ${instance.name} 连通性测试失败: ${error.message}`);

      // 判断错误类型并返回明确结果
      if (error.response) {
        const status = error.response.status;
        
        // 5xx错误表示站点或实例问题
        if (status >= 500) {
          console.log(`📊 收到5xx错误，站点或实例问题: ${status}`);
          return false;
        }
        
        // 4xx错误可能表示站点可达但有认证问题
        if (status >= 400 && status < 500) {
          console.log(`📊 收到4xx错误，站点可达但可能需要认证: ${status}`);
          return true;
        }
      }
      
      // 网络错误表示连通性问题
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        console.log(`📊 网络连接错误: ${error.code || error.message}`);
        return false;
      }

      // 其他错误返回false
      return false;
      
    } finally {
      // 确保清理临时分组
      if (tempGroupId) {
        try {
          await instance.apiClient.delete(`/groups/${tempGroupId}`);
          console.log(`🗑️ 已清理临时测试分组: ${tempGroupId}`);
        } catch (cleanupError) {
          console.warn(`⚠️ 清理临时分组失败: ${cleanupError.message}`);
        }
      }
    }
  }

  /**
   * 通过最佳实例执行操作
   */
  async executeOnBestInstance(siteUrl, operation, options = {}) {
    const instance = await this.selectBestInstance(siteUrl, options);

    if (!instance) {
      throw new Error("没有可用的 gptload 实例");
    }

    try {
      console.log(`🔄 通过实例 ${instance.name} 执行操作`);
      return await operation(instance);
    } catch (error) {
      console.error(`实例 ${instance.name} 执行操作失败:`, error.message);

      // 如果是网络错误，标记实例为不健康并重试其他实例
      if (this.isNetworkError(error)) {
        this.healthStatus.set(instance.id, {
          ...this.healthStatus.get(instance.id),
          healthy: false,
          error: error.message,
        });

        // 移除站点分配，强制重新选择
        this.siteAssignments.delete(siteUrl);

        console.log(`🔄 重试其他实例...`);
        return await this.executeOnBestInstance(siteUrl, operation, options);
      }

      throw error;
    }
  }

  /**
   * 判断是否为网络错误
   */
  isNetworkError(error) {
    return (
      error.code === "ECONNREFUSED" ||
      error.code === "ETIMEDOUT" ||
      error.message.includes("timeout") ||
      error.message.includes("Network Error")
    );
  }

  /**
   * 获取所有实例状态
   */
  getAllInstancesStatus() {
    const status = {};

    for (const [id, instance] of this.instances) {
      const health = this.healthStatus.get(id);
      status[id] = {
        name: instance.name,
        url: instance.url,
        priority: instance.priority,
        description: instance.description,
        healthy: health?.healthy || false,
        lastCheck: health?.lastCheck,
        responseTime: health?.responseTime,
        groupsCount: health?.groupsCount || 0,
        error: health?.error,
      };
    }

    return status;
  }

  /**
   * 获取站点分配情况
   */
  getSiteAssignments() {
    const assignments = {};

    for (const [siteUrl, instanceId] of this.siteAssignments) {
      const instance = this.instances.get(instanceId);
      assignments[siteUrl] = {
        instanceId,
        instanceName: instance?.name || "Unknown",
        instanceUrl: instance?.url || "Unknown",
      };
    }

    return assignments;
  }

  /**
   * 通过多实例尝试获取站点模型（通过代理方式）
   */
  async getModelsViaMultiInstance(baseUrl, apiKey) {
    const healthyInstances = Array.from(this.instances.values())
      .filter((instance) => this.healthStatus.get(instance.id)?.healthy)
      .sort((a, b) => a.priority - b.priority);

    if (healthyInstances.length === 0) {
      throw new Error("没有健康的gptload实例可用");
    }

    let lastError = null;
    const attemptedInstances = [];
    let debugTempGroupId = null; // 用于保留调试分组
    let debugInstance = null;
    
    for (const instance of healthyInstances) {
      let tempGroupId = null;
      let tempGroupName = null; // 将变量声明移到循环内但在try外
    
      try {
        console.log(`🔄 尝试通过实例 ${instance.name} 的代理访问 ${baseUrl}...`);
        console.log(`🔑 使用API密钥: ${apiKey ? `${apiKey.substring(0, 10)}...` : '无密钥'}`);
        attemptedInstances.push(instance.name);
      
        // 1. 创建临时站点分组
        tempGroupName = `debug-models-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
        console.log(`🧪 创建临时站点分组: ${tempGroupName}`);
        
        const tempGroupData = {
          name: tempGroupName,
          display_name: `调试模型获取分组`,
          description: `调试分组，用于通过代理获取 ${baseUrl} 的模型列表`,
          upstreams: [{ url: baseUrl, weight: 1 }],
          channel_type: "openai",
          test_model: "gpt-4o-mini",
          validation_endpoint: "/v1/chat/completions",
          sort: 99, // 最低优先级
          config: {
            blacklist_threshold: 1,
          },
        };

        const createResponse = await instance.apiClient.post("/groups", tempGroupData);
        
        // 处理响应格式
        let tempGroup;
        if (createResponse.data && typeof createResponse.data.code === "number") {
          tempGroup = createResponse.data.data;
        } else {
          tempGroup = createResponse.data;
        }
        
        tempGroupId = tempGroup.id;
        console.log(`✅ 临时分组创建成功: ${tempGroupId}`);
        
        // 2. 验证并添加API密钥到临时分组
        if (!apiKey || apiKey.trim() === '') {
          console.error(`❌ API密钥为空，无法继续`);
          lastError = new Error('API密钥为空');
          continue;
        }
        
        console.log(`🔍 验证API密钥格式: 长度=${apiKey.length}, 前缀=${apiKey.substring(0, 3)}`);
        
        try {
          const keyAddResult = await this.addApiKeysToGroup(instance, tempGroupId, [apiKey]);
          console.log(`🔑 API密钥添加结果: ${JSON.stringify(keyAddResult)}`);
          
          // 验证密钥是否成功添加
          const keyStats = await this.getGroupKeyStats(instance, tempGroupId);
          console.log(`📊 分组密钥统计: ${JSON.stringify(keyStats)}`);
          
          if (!keyStats || keyStats.active_keys === 0) {
            console.warn(`⚠️ 分组中没有可用密钥，添加可能失败`);
          }
          
        } catch (keyError) {
          console.error(`❌ 添加API密钥失败: ${keyError.message}`);
          console.error(`📝 密钥错误详情: ${JSON.stringify(keyError.response?.data || {})}`);
          lastError = keyError;
          continue;
        }
        
        // 3. 通过代理获取模型列表
        const proxyUrl = `${instance.url}/proxy/${tempGroupName}/v1/models`;
        console.log(`🔗 通过代理获取模型: ${proxyUrl}`);
        
        // 使用 axios 直接请求完整URL
        const { default: axios } = await import('axios');
        
        // 先验证代理端点是否可访问
        try {
          console.log(`🔍 验证代理端点可访问性...`);
          const healthCheck = await axios.get(`${instance.url}/proxy/${tempGroupName}/health`, {
            timeout: 10000,
            httpsAgent: this.httpsAgent,
            validateStatus: () => true, // 接受所有状态码
          });
          console.log(`📡 健康检查响应: ${healthCheck.status}`);
        } catch (healthError) {
          console.warn(`⚠️ 健康检查失败: ${healthError.message}`);
        }
        
        // 关键修改：访问gptload代理时应该使用gptload实例的token，而不是原始API密钥
        const modelsResponse = await axios.get(proxyUrl, {
          timeout: 30000, // 30秒超时
          httpsAgent: this.httpsAgent,
          headers: {
            // 使用gptload实例的token进行认证
            'Authorization': `Bearer ${instance.token || 'dummy-token'}`,
            'Content-Type': 'application/json',
            'User-Agent': 'uni-load/1.0.0',
          },
          validateStatus: (status) => status < 500, // 允许4xx响应
        });
        
        console.log(`📡 代理模型响应: ${modelsResponse.status}`);
        console.log(`🔑 使用的gptload token: ${instance.token ? `${instance.token.substring(0, 10)}...` : '❌ 未配置token'}`);
        console.log(`🔑 原始API密钥已存储在分组中: ${apiKey ? `${apiKey.substring(0, 10)}...` : '无密钥'}`);
        console.log(`📡 响应头: ${JSON.stringify(modelsResponse.headers)}`);
        console.log(`📡 响应数据: ${JSON.stringify(modelsResponse.data).substring(0, 500)}...`);
        
        // 4. 解析模型数据
        const { default: modelsService } = await import("./models");
        const models = modelsService.parseModelsResponse(modelsResponse.data);
        
        if (models && models.length > 0) {
          // 记录成功的实例
          this.siteAssignments.set(baseUrl, instance.id);
          console.log(`✅ 实例 ${instance.name} 通过代理成功获取 ${models.length} 个模型`);
          
          // 保留成功的临时分组用于调试
          debugTempGroupId = tempGroupId;
          debugInstance = instance;
          console.log(`🛠️ 保留成功的调试分组 ${tempGroupName} (ID: ${tempGroupId}) 用于后续调试`);
          
          return { models, instanceId: instance.id, instanceName: instance.name, debugGroupId: tempGroupId, debugGroupName: tempGroupName };
        } else {
          console.log(`⚠️ 实例 ${instance.name} 通过代理返回空模型列表`);
          lastError = new Error("返回空模型列表");
        }
        
      } catch (error) {
        lastError = error;
        console.log(`❌ 实例 ${instance.name} 代理访问失败: ${error.message}`);
        
        // 详细错误分析
        if (error.response) {
          console.log(`📊 错误详情: 状态=${error.response.status}, 数据=${JSON.stringify(error.response.data)}`);
          console.log(`📊 请求头: ${JSON.stringify(error.config?.headers || {})}`);
          console.log(`📊 请求URL: ${error.config?.url || 'unknown'}`);
          
          // 503错误特殊处理：NO_KEYS_AVAILABLE
          if (error.response.status === 503 && error.response.data?.code === "NO_KEYS_AVAILABLE") {
            console.log(`📊 503错误分析: 分组中没有可用的API密钥`);
            console.log(`💡 可能原因: API密钥无效或被gptload标记为失效`);
            console.log(`🔄 继续尝试下一个实例...`);
          }
          
          // 如果是401错误，提供更详细的调试信息
          if (error.response.status === 401) {
            console.log(`🔐 401未授权错误分析:`);
            console.log(`   - API密钥: ${apiKey ? `${apiKey.substring(0, 10)}...` : '无密钥'}`);
            console.log(`   - 目标URL: ${baseUrl}`);
            console.log(`   - 代理URL: ${proxyUrl}`);
            console.log(`   - 建议: 检查API密钥是否正确，或站点是否需要特殊认证方式`);
          }
        }
        
        // 如果是网络连接问题，标记实例为不健康
        if (this.isNetworkError(error)) {
          this.healthStatus.set(instance.id, {
            ...this.healthStatus.get(instance.id),
            healthy: false,
            error: error.message,
          });
          console.log(`⚠️ 实例 ${instance.name} 因网络错误被标记为不健康`);
        }
        
        // 增强的错误诊断
        if (error.response && error.response.status === 401) {
          console.log(`🔐 401认证失败详细诊断:`);
          console.log(`   - gptload实例token: ${instance.token ? `${instance.token.substring(0, 10)}...` : '❌ 未配置token'}`);
          console.log(`   - 原始API密钥: ${apiKey ? `${apiKey.substring(0, 10)}...` : '❌ 无原始密钥'}`);
          console.log(`   - 代理URL: ${proxyUrl}`);
          console.log(`   - 目标站点: ${baseUrl}`);
          console.log(`   - 问题分析: 访问gptload代理需要使用gptload的token，不是原始API密钥`);
          
          // 测试实例token是否有效
          try {
            const tokenTestResponse = await instance.apiClient.get('/groups');
            console.log(`✅ gptload实例token验证成功，可以访问管理接口`);
          } catch (tokenError) {
            console.log(`❌ gptload实例token验证失败: ${tokenError.message}`);
            console.log(`💡 建议检查gptload-instances.json中实例的token配置`);
          }
        }
        
        // 保留最后一个失败的临时分组用于调试
        if (!debugTempGroupId) {
          debugTempGroupId = tempGroupId;
          debugInstance = instance;
          if (tempGroupName) {
            console.log(`🛠️ 保留失败的调试分组 ${tempGroupName} (ID: ${tempGroupId}) 用于调试`);
          }
        }
        
        // 不要在这里抛出错误，继续尝试下一个实例
        continue; // 明确使用continue而不是break
        
      } finally {
        // 智能清理策略：失败的临时分组立即清理，成功的保留用于调试
        if (tempGroupId && tempGroupId !== debugTempGroupId) {
          try {
            await instance.apiClient.delete(`/groups/${tempGroupId}`);
            console.log(`🗑️ 已清理失败的临时分组: ${tempGroupId}`);
          } catch (cleanupError) {
            console.warn(`⚠️ 清理临时分组失败: ${cleanupError.message}`);
            console.log(`🛠️ 分组 ${tempGroupName} (ID: ${tempGroupId}) 清理失败，需手动清理`);
            console.log(`   管理链接: ${instance.url}/groups/${tempGroupId}`);
          }
        }
        
        // 对于成功的调试分组，提供手动测试信息
        if (tempGroupId === debugTempGroupId && tempGroupName) {
          console.log(`🛠️ 保留成功的调试分组 ${tempGroupName} (ID: ${tempGroupId}) 用于调试`);
          console.log(`🔗 可以通过以下方式手动测试:`);
          console.log(`   1. 代理URL: ${instance.url}/proxy/${tempGroupName}/v1/models`);
          console.log(`   2. 使用gptload token: ${instance.token ? `${instance.token.substring(0, 10)}...` : '❌ 需配置token'}`);
          console.log(`   3. 目标站点: ${baseUrl}`);
          console.log(`   4. 分组管理: ${instance.url}/groups/${tempGroupId}`);
          console.log(`💡 调试完成后建议手动删除此分组`);
        }
      }
    }
    
    // 所有实例都失败了，尝试直接访问作为回退
    console.log(`⚠️ 所有实例代理访问都失败，尝试直接访问作为回退...`);
    try {
      const { default: modelsService } = await import("./models");
      const models = await modelsService.getModels(baseUrl, apiKey, 2);
      
      if (models && models.length > 0) {
        console.log(`✅ 直接访问成功获取 ${models.length} 个模型，使用第一个健康实例`);
        const fallbackInstance = healthyInstances[0];
        this.siteAssignments.set(baseUrl, fallbackInstance.id);
        return { models, instanceId: fallbackInstance.id, instanceName: fallbackInstance.name };
      }
    } catch (directError) {
      console.log(`❌ 直接访问也失败: ${directError.message}`);
      console.log(`📊 直接访问错误详情: ${JSON.stringify({
        status: directError.response?.status,
        message: directError.message,
        baseUrl: baseUrl,
        apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : '无密钥'
      })}`);
      lastError = directError;
    }
    
    // 输出调试信息
    if (debugTempGroupId && debugInstance) {
      console.log(`🛠️ 调试信息:`);
      console.log(`   调试分组ID: ${debugTempGroupId}`);
      console.log(`   调试实例: ${debugInstance.name}`);
      console.log(`   可以手动访问 ${debugInstance.url}/proxy/debug-* 进行测试`);
    }
    
    // 所有方法都失败了
    const errorMsg = `所有 ${attemptedInstances.length} 个实例代理访问和直接访问都失败`;
    console.error(`${errorMsg}: ${lastError?.message}`);
    
    // 如果是401错误，提供额外建议
    if (lastError?.response?.status === 401) {
      console.error(`🔐 401认证失败建议检查:`);
      console.error(`   1. API密钥格式是否正确 (当前: ${apiKey ? `${apiKey.substring(0, 10)}...` : '无密钥'})`);
      console.error(`   2. 站点 ${baseUrl} 是否需要特殊的认证方式`);
      console.error(`   3. API密钥是否有访问该站点的权限`);
      console.error(`   4. 检查保留的调试分组中的密钥配置`);
    }
    
    throw new Error(`${errorMsg}。最后错误: ${lastError?.message}${lastError?.response?.status === 401 ? '（认证失败，请检查API密钥）' : ''}`);
  }

  /**
   * 重新分配站点到实例
   */
  async reassignSite(siteUrl, instanceId = null) {
    if (instanceId) {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`实例 ${instanceId} 不存在`);
      }

      this.siteAssignments.set(siteUrl, instanceId);
      console.log(`📌 手动分配站点 ${siteUrl} 到实例 ${instance.name}`);
    } else {
      // 清除分配，下次访问时重新自动分配
      this.siteAssignments.delete(siteUrl);
      console.log(`🔄 清除站点 ${siteUrl} 的分配，将重新自动分配`);
    }
  }

  /**
   * 获取指定实例的API客户端
   */
  getInstanceClient(instanceId) {
    const instance = this.instances.get(instanceId);
    return instance?.apiClient;
  }

  /**
   * 获取实例信息
   */
  getInstance(instanceId) {
    return this.instances.get(instanceId);
  }

  /**
   * 统一的API接口 - 创建站点分组
   */
  async createSiteGroup(
    siteName,
    baseUrl,
    apiKeys,
    channelType = "openai",
    customValidationEndpoints = {},
    availableModels = null,
    isModelGroup = false
  ) {
    // 检查是否是本地代理URL（第2/3层分组的情况）
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      console.log(`🏠 检测到本地代理URL: ${baseUrl}，直接使用本地实例`);
      
      // 直接使用第一个健康的本地实例
      const localInstance = Array.from(this.instances.values())
        .filter(inst => this.healthStatus.get(inst.id)?.healthy)
        .find(inst => inst.url.includes('localhost') || inst.url.includes('127.0.0.1')) ||
        Array.from(this.instances.values())
          .filter(inst => this.healthStatus.get(inst.id)?.healthy)[0];
      
      if (!localInstance) {
        throw new Error("没有可用的健康实例创建本地代理分组");
      }
      
      return await this.createSiteGroupOnInstance(
        localInstance, siteName, baseUrl, apiKeys, channelType,
        customValidationEndpoints, availableModels, isModelGroup
      );
    }
    
    // 对于真实的外部API站点，使用最佳实例选择策略
    return await this.executeOnBestInstance(
      baseUrl,
      async (instance) => {
        return await this.createSiteGroupOnInstance(
          instance, siteName, baseUrl, apiKeys, channelType,
          customValidationEndpoints, availableModels, isModelGroup
        );
      },
      { channelType }
    );
  }

  /**
   * 在指定实例上创建站点分组
   */
  async createSiteGroupOnInstance(
    instance, siteName, baseUrl, apiKeys, channelType,
    customValidationEndpoints, availableModels, isModelGroup
  ) {
    // 为不同格式创建不同的分组名
    let groupName = `${siteName.toLowerCase()}-${channelType}`;
    
    // 应用分组名称长度限制和智能截断
    groupName = this.generateSafeGroupName(groupName);
    
    if (!groupName) {
      throw new Error(`站点名称过长无法生成有效分组名: ${siteName}`);
    }

        // 检查分组是否已存在
        const existingGroup = await this.checkGroupExists(instance, groupName);
        if (existingGroup) {
          console.log(`站点分组 ${groupName} 已存在，更新配置...`);
          return await this.updateSiteGroup(
            instance,
            existingGroup,
            baseUrl,
            apiKeys,
            channelType,
            customValidationEndpoints,
            availableModels,
            isModelGroup
          );
        }

        console.log(`创建站点分组: ${groupName}，格式: ${channelType}`);

        // 根据不同 channel_type 设置默认参数
        const channelConfig = this.getChannelConfig(channelType);

        // 选择验证模型：分层处理
        let testModel;
        if (isModelGroup) {
          // 第二/三层分组：直接使用指定模型
          testModel = availableModels?.[0] || channelConfig.test_model;
          console.log(`🎯 第二/三层分组使用指定模型: ${testModel}`);
        } else {
          // 第一层分组：从小模型列表选择，避免高消耗
          testModel = this.selectTestModel(availableModels, channelType);
          console.log(`🔍 第一层分组选择验证模型: ${testModel}`);
        }

        // 确定要使用的验证端点
        const validationEndpoint =
          customValidationEndpoints[channelType] ||
          channelConfig.validation_endpoint;

        // 创建分组
        const groupData = {
          name: groupName,
          display_name: `${siteName} ${channelType.toUpperCase()} 站点`,
          description: `${siteName} AI站点 - ${baseUrl} (${channelType}) [实例: ${instance.name}]`,
          upstreams: [{ url: baseUrl, weight: 1 }],
          channel_type: channelType,
          test_model: testModel, // 使用选择的验证模型
          validation_endpoint: validationEndpoint, // 使用自定义端点或默认值
          sort: 20, // 渠道分组的排序号为20
          param_overrides: {},
          config: {
            blacklist_threshold: layerConfigs.siteGroup.blacklist_threshold,
          },
        };

        try {
          const response = await instance.apiClient.post("/groups", groupData);

          // 处理不同的响应格式
          let group;
          if (
            response.data &&
            typeof response.data.code === "number" &&
            response.data.data
          ) {
            // gptload 特定格式: { code: 0, message: "Success", data: {...} }
            group = response.data.data;
          } else if (response.data) {
            // 直接返回数据
            group = response.data;
          } else {
            throw new Error("响应格式不正确");
          }

          // 添加 API 密钥
          if (apiKeys && apiKeys.length > 0) {
            await this.addApiKeysToGroup(instance, group.id, apiKeys);
          }

          console.log(
            `✅ 站点分组 ${groupName} 创建成功 (实例: ${instance.name})`
          );

          // 在返回的分组信息中添加实例信息
          return {
            ...group,
            _instance: {
              id: instance.id,
              name: instance.name,
              url: instance.url,
            },
          };
        } catch (error) {
          // 如果是409错误（分组已存在），重新检查并返回现有分组
          if (error.response && error.response.status === 409) {
            console.log(
              `⚠️ 分组 ${groupName} 已存在（409错误），重新获取分组信息...`
            );
            const existingGroup = await this.checkGroupExists(
              instance,
              groupName
            );
            if (existingGroup) {
              console.log(`✅ 找到已存在的分组 ${groupName}，将更新配置`);
              return await this.updateSiteGroup(
                instance,
                existingGroup,
                baseUrl,
                apiKeys,
                channelType,
                customValidationEndpoints,
                availableModels,
                isModelGroup
              );
            }
          }
          throw error;
        }
      },
      { channelType }
    );
  }

  /**
   * 检查分组是否存在
   */
  async checkGroupExists(instance, groupName) {
    try {
      const response = await instance.apiClient.get("/groups");
      let groups = [];

      // 处理不同的响应格式
      if (Array.isArray(response.data)) {
        // 直接是数组格式
        groups = response.data;
      } else if (
        response.data &&
        typeof response.data.code === "number" &&
        Array.isArray(response.data.data)
      ) {
        // gptload 特定格式: { code: 0, message: "Success", data: [...] }
        groups = response.data.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        // 包装在 data 字段中
        groups = response.data.data;
      } else if (response.data && Array.isArray(response.data.groups)) {
        // 包装在 groups 字段中
        groups = response.data.groups;
      } else {
        console.warn(
          `实例 ${instance.name} 返回未知的分组数据格式:`,
          response.data
        );
        return null;
      }

      return groups.find((group) => group.name === groupName);
    } catch (error) {
      console.error("检查分组失败:", error.message);
      return null;
    }
  }

  /**
   * 从可用模型中选择最佳的验证模型
   */
  selectTestModel(availableModels, channelType) {
    // 使用统一的模型配置管理
    return modelConfig.selectTestModel(availableModels, channelType);
  }

  /**
   * 获取不同 channel_type 的默认配置
   */
  getChannelConfig(channelType) {
    const configs = {
      openai: {
        test_model: "gpt-4o-mini",
        validation_endpoint: "/v1/chat/completions",
      },
      anthropic: {
        test_model: "claude-sonnet-3-5-20250614",
        validation_endpoint: "/v1/messages",
      },
      gemini: {
        test_model: "gemini-2.5-flash",
        validation_endpoint: "/v1beta/openai/chat/completions",
      },
    };

    return configs[channelType] || configs.openai;
  }

  /**
   * 更新站点分组
   */
  async updateSiteGroup(
    instance,
    existingGroup,
    baseUrl,
    apiKeys,
    channelType,
    customValidationEndpoints = {},
    availableModels = null,
    isModelGroup = false
  ) {
    try {
      console.log(
        `更新站点分组: ${existingGroup.name}，格式: ${channelType} (实例: ${instance.name})`
      );

      // 根据不同 channel_type 设置默认参数
      const channelConfig = this.getChannelConfig(channelType);

      // 选择验证模型：分层处理
      let testModel;
      if (isModelGroup) {
        // 第二/三层分组：直接使用指定模型
        testModel = availableModels?.[0] || channelConfig.test_model;
        console.log(`🎯 更新第二/三层分组使用指定模型: ${testModel}`);
      } else {
        // 第一层分组：从小模型列表选择，避免高消耗
        testModel = this.selectTestModel(availableModels, channelType);
        console.log(`🔍 更新第一层分组选择验证模型: ${testModel}`);
      }

      // 确定要使用的验证端点
      const validationEndpoint =
        customValidationEndpoints[channelType] ||
        channelConfig.validation_endpoint;

      // 更新分组配置
      const updateData = {
        upstreams: [{ url: baseUrl, weight: 1 }],
        channel_type: channelType,
        test_model: testModel, // 使用选择的验证模型
        validation_endpoint: validationEndpoint, // 使用自定义端点或默认值
        sort: 20, // 渠道分组的排序号为20
        param_overrides: {},
        config: {
          blacklist_threshold: layerConfigs.siteGroup.blacklist_threshold,
        },
      };

      await instance.apiClient.put(`/groups/${existingGroup.id}`, updateData);

      // 对于现有的渠道分组，不添加新的API密钥，避免破坏原有配置
      if (apiKeys && apiKeys.length > 0) {
        console.log(`ℹ️ 跳过向现有渠道分组 ${existingGroup.name} 添加API密钥，保持原有配置不变`);
      }

      console.log(
        `✅ 站点分组 ${existingGroup.name} 更新成功 (实例: ${instance.name})`
      );

      return {
        ...existingGroup,
        ...updateData,
        _instance: {
          id: instance.id,
          name: instance.name,
          url: instance.url,
        },
      };
    } catch (error) {
      console.error(`更新站点分组失败: ${error.message}`);
      throw new Error(`更新站点分组失败: ${error.message}`);
    }
  }

  /**
   * 向分组添加 API 密钥
   */
  async addApiKeysToGroup(instance, groupId, apiKeys) {
    try {
      // 验证实例对象
      if (!instance) {
        throw new Error('实例对象不能为空');
      }
      
      // 验证 API 客户端
      if (!instance.apiClient) {
        throw new Error(`实例 ${instance.name || 'unknown'} 的 API 客户端未初始化`);
      }
      
      // 确保 apiKeys 是数组
      if (!apiKeys) {
        console.log("没有API密钥需要添加");
        return { success: false, message: "没有API密钥" };
      }
      
      let keysArray;
      if (Array.isArray(apiKeys)) {
        keysArray = apiKeys;
      } else if (typeof apiKeys === 'string') {
        // 如果是字符串，按换行符分割
        keysArray = apiKeys.split('\n').filter(key => key.trim());
      } else {
        console.warn("API密钥格式不正确:", typeof apiKeys, apiKeys);
        return { success: false, message: "API密钥格式不正确" };
      }
      
      if (keysArray.length === 0) {
        console.log("没有有效的API密钥需要添加");
        return { success: false, message: "没有有效的API密钥" };
      }
      
      // 验证密钥格式
      console.log(`🔍 验证 ${keysArray.length} 个API密钥格式:`);
      for (let i = 0; i < keysArray.length; i++) {
        const key = keysArray[i];
        console.log(`   密钥 ${i + 1}: 长度=${key.length}, 前缀=${key.substring(0, 10)}...`);
        
        if (key.length < 10) {
          console.warn(`⚠️ 密钥 ${i + 1} 长度过短，可能无效`);
        }
      }
      
      const keysText = keysArray.join("\n");

      console.log(`🔄 向分组 ${groupId} 添加 ${keysArray.length} 个API密钥...`);
      const response = await instance.apiClient.post("/keys/add-multiple", {
        group_id: groupId,
        keys_text: keysText,
      });

      console.log(`📡 添加密钥API响应: ${JSON.stringify(response.data)}`);
      console.log(`✅ 成功添加 ${keysArray.length} 个API密钥到分组 ${groupId} (实例: ${instance.name})`);
      
      return { success: true, data: response.data, addedCount: keysArray.length };
    } catch (error) {
      console.error(`❌ 添加API密钥失败: ${error.message}`);
      
      // 添加更详细的错误信息
      if (error.response) {
        console.error(`📊 API响应错误: 状态=${error.response.status}, 数据=${JSON.stringify(error.response.data)}`);
      }
      
      console.error(`📝 错误详情: 实例=${instance?.name}, 分组=${groupId}, 密钥数量=${Array.isArray(apiKeys) ? apiKeys.length : typeof apiKeys}`);
      console.warn("⚠️ 警告: API密钥添加失败，但分组已创建，可手动添加密钥");
      
      // 抛出错误而不是静默失败，让调用方知道密钥添加失败
      throw error;
    }
  }

  /**
   * 删除分组下的所有 API 密钥
   */
  async deleteAllApiKeysFromGroup(instance, groupId) {
    try {
      // 1. 获取该分组的所有密钥
      const params = {
        group_id: groupId,
        page: 1,
        page_size: 1000,
        status: "active",
      };
      const response = await instance.apiClient.get("/keys", { params });

      const keys = response.data?.data?.items;
      if (!keys || keys.length === 0) {
        console.log(
          `ℹ️ 分组 ${groupId} (实例: ${instance.name}) 下没有可删除的密钥`
        );
        return 0;
      }

      console.log(
        `🗑️ 准备从分组 ${groupId} (实例: ${instance.name}) 删除 ${keys.length} 个密钥...`
      );

      // 2. 逐个删除密钥
      let deletedCount = 0;
      for (const key of keys) {
        try {
          await instance.apiClient.delete(`/keys/${key.id}`);
          deletedCount++;
        } catch (keyError) {
          console.error(`❌ 删除密钥 ${key.id} 失败: ${keyError.message}`);
        }
      }

      console.log(`✅ 成功从分组 ${groupId} 删除了 ${deletedCount} 个密钥`);
      return deletedCount;
    } catch (error) {
      console.error(`删除分组 ${groupId} 的密钥失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 切换分组下所有 API 密钥的状态
   * 使用 ValidateGroupKeys 来禁用密钥，使用 RestoreAllInvalidKeys 来恢复密钥
   */
  async toggleApiKeysStatusForGroup(instance, groupId, newStatus) {
    if (newStatus !== "active" && newStatus !== "disabled") {
      throw new Error('无效的密钥状态，必须是 "active" 或 "disabled"');
    }

    try {
      if (newStatus === "disabled") {
        // 使用 ValidateGroupKeys 来验证并禁用失效的密钥
        console.log(`🔄 准备验证分组 ${groupId} 的密钥并禁用失效的密钥...`);

        // 最多验证2次
        for (let attempt = 1; attempt <= 2; attempt++) {
          console.log(`🔍 第 ${attempt} 次验证分组 ${groupId} 的密钥...`);

          // 1. 启动验证任务
          try {
            const response = await instance.apiClient.post(
              "/keys/validate-group",
              {
                group_id: groupId,
              }
            );

            console.log(`✅ 成功启动分组 ${groupId} 的密钥验证任务`);
          } catch (error) {
            // 409 错误表示任务已经在运行，这是正常情况
            if (error.response && error.response.status === 409) {
              console.log(
                `ℹ️ 分组 ${groupId} 的验证任务已在运行中，等待完成...`
              );
            } else {
              throw error;
            }
          }

          // 2. 等待任务完成并获取结果
          const validationResult = await this.waitForValidationTask(
            instance,
            groupId
          );

          // 3. 检查验证后的密钥状态
          const keyStats = await this.getGroupKeyStats(instance, groupId);

          if (
            keyStats &&
            keyStats.active_keys === 0 &&
            keyStats.invalid_keys > 0
          ) {
            // 所有密钥都被标记为无效，验证成功
            console.log(`✅ 分组 ${groupId} 验证完成: 所有密钥已被标记为无效`);
            return {
              success: true,
              attempt: attempt,
              ...validationResult,
              final_stats: keyStats,
            };
          } else if (keyStats && keyStats.active_keys > 0) {
            // 仍有有效密钥，可能是临时失败
            console.log(
              `⚠️ 分组 ${groupId} 第 ${attempt} 次验证后仍有 ${keyStats.active_keys} 个有效密钥，可能是临时失败`
            );

            if (attempt === 2) {
              // 两次验证后仍然有效，跳过这个分组
              console.log(
                `ℹ️ 分组 ${groupId} 经过 ${attempt} 次验证后仍有有效密钥，跳过禁用操作`
              );
              return {
                success: false,
                reason: "keys_still_valid_after_retries",
                attempts: attempt,
                final_stats: keyStats,
              };
            }

            // 等待一段时间后再次验证
            console.log(`⏳ 等待 3 秒后进行第 ${attempt + 1} 次验证...`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
          } else {
            // 获取状态失败或异常情况
            console.log(`⚠️ 分组 ${groupId} 无法获取密钥状态，验证结果不确定`);
            return {
              success: true,
              attempt: attempt,
              ...validationResult,
              final_stats: keyStats || {},
            };
          }
        }
      } else if (newStatus === "active") {
        // 使用 RestoreAllInvalidKeys 来恢复所有无效的密钥
        console.log(`🔄 准备恢复分组 ${groupId} 的所有无效密钥...`);

        const response = await instance.apiClient.post(
          "/keys/restore-all-invalid",
          {
            group_id: groupId,
          }
        );

        const message = response.data?.data?.message || "密钥恢复完成";
        console.log(`✅ ${message}`);

        // 从响应消息中提取影响的行数
        const match = message.match(/(\d+) keys restored/);
        return match ? parseInt(match[1]) : 0;
      }
    } catch (error) {
      console.error(`更新分组 ${groupId} 的密钥状态失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 等待现有验证任务完成 (别名方法)
   */
  async waitForExistingValidationTask(instance, groupId) {
    return await this.waitForValidationTask(instance, groupId);
  }

  /**
   * 获取分组的密钥统计信息
   */
  async getGroupKeyStats(instance, groupId) {
    try {
      console.log(`📊 获取分组 ${groupId} 的密钥统计信息...`);
      
      // 方法1：尝试获取分组详细信息中的统计数据
      const groupDetails = await this.getGroupDetails(instance, groupId);
      if (groupDetails && groupDetails.key_stats) {
        console.log(`✅ 从分组详情获取密钥统计: ${JSON.stringify(groupDetails.key_stats)}`);
        return groupDetails.key_stats;
      }
      
      // 方法2：通过密钥接口获取统计信息
      const params = {
        group_id: groupId,
        page: 1,
        page_size: 1000
      };
      
      const response = await instance.apiClient.get('/keys', { params });
      console.log(`📊 密钥查询响应: ${JSON.stringify(response.data)}`);
      
      // 处理不同格式的响应
      let keyData;
      if (response.data && typeof response.data.code === 'number') {
        keyData = response.data.data;
      } else {
        keyData = response.data;
      }
      
      if (keyData && keyData.items) {
        const allKeys = keyData.items;
        // 修复统计计算逻辑：使用标准的status字段
        const activeKeys = allKeys.filter(key => key.status === 'active').length;
        const invalidKeys = allKeys.filter(key => key.status === 'invalid').length;
        
        const stats = {
          active_keys: activeKeys,
          invalid_keys: invalidKeys,
          total_keys: allKeys.length
        };
        
        console.log(`✅ 通过密钥接口计算统计: active=${activeKeys}, invalid=${invalidKeys}, total=${allKeys.length}`);
        console.log(`📝 密钥状态详情: ${JSON.stringify(allKeys.map(k => ({id: k.id, status: k.status})))}`);
        return stats;
      }
      
      console.warn(`⚠️ 无法获取分组 ${groupId} 的密钥统计`);
      return null;
      
    } catch (error) {
      console.error(`获取分组 ${groupId} 密钥统计失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 等待验证任务完成
   */
  async waitForValidationTask(instance, groupId) {
    console.log(`⏳ 开始等待分组 ${groupId} 的验证任务完成...`);
    let maxWaitTime = 30000; // 最多等待30秒
    let interval = 1000; // 每秒检查一次
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      try {
        console.log(`📋 检查分组 ${groupId} 的任务状态 (已等待 ${elapsedTime / 1000}s)...`);
        const statusResponse = await instance.apiClient.get("/tasks/status");
        
        console.log(`📝 任务状态响应: ${JSON.stringify(statusResponse.data)}`);
        
        // 处理 gptload 特定格式的响应
        let taskStatus;
        if (statusResponse.data && typeof statusResponse.data.code === 'number') {
          // gptload 格式: { code: 0, message: "Success", data: {...} }
          console.log(`📝 检测到gptload任务状态格式，code: ${statusResponse.data.code}`);
          if (statusResponse.data.code !== 0) {
            console.log(`⚠️ 任务状态检查返回错误: ${statusResponse.data.message}`);
            break;
          }
          taskStatus = statusResponse.data.data;
          console.log(`📝 解析后的任务状态: ${JSON.stringify(taskStatus)}`);
        } else {
          // 直接返回数据格式
          taskStatus = statusResponse.data;
        }

        if (!taskStatus) {
          console.log(`⚠️ 未找到分组 ${groupId} 的任务状态`);
          break;
        }

        console.log(`📋 任务状态详情: 运行中=${taskStatus.is_running}, 进度=${taskStatus.processed}/${taskStatus.total}, 类型=${taskStatus.task_type}`);

        if (!taskStatus.is_running) {
          // 任务已完成
          console.log(`✅ 分组 ${groupId} 的验证任务已完成`);
          
          // 获取最终的密钥统计信息
          const keyStats = await this.getGroupKeyStats(instance, groupId);
          
          // 判断验证是否成功
          let validationSuccess = false;
          if (keyStats) {
            // 根据实际的字段名获取可用密钥数量
            const availableKeys = keyStats.active_keys || keyStats.available || 0;
            const totalKeys = keyStats.total_keys || keyStats.total || 0;
            
            console.log(`📊 验证完成统计: ${availableKeys}/${totalKeys} 个密钥可用`);
            console.log(`📊 密钥详细统计: active=${keyStats.active_keys}, total=${keyStats.total_keys}, invalid=${keyStats.invalid_keys}`);
            
            if (availableKeys > 0) {
              validationSuccess = true;
              console.log(`✅ 分组 ${groupId} 验证成功，有 ${availableKeys} 个可用密钥`);
            } else {
              console.log(`❌ 分组 ${groupId} 验证失败，没有可用密钥`);
            }
          } else {
            // 如果无法获取统计信息，尝试从任务结果中获取
            if (taskStatus.result && taskStatus.result.valid_keys !== undefined) {
              validationSuccess = taskStatus.result.valid_keys > 0;
              const validKeys = taskStatus.result.valid_keys;
              const totalKeys = taskStatus.result.total_keys || taskStatus.total;
              
              if (validationSuccess) {
                console.log(`✅ 分组 ${groupId} 验证成功，从任务结果获得 ${validKeys}/${totalKeys} 个有效密钥`);
              } else {
                console.log(`❌ 分组 ${groupId} 验证失败，从任务结果显示 ${validKeys}/${totalKeys} 个有效密钥`);
              }
            } else if (taskStatus.task_type === 'KEY_VALIDATION' && taskStatus.processed > 0) {
              // 备用逻辑：如果处理了密钥但无统计信息
              validationSuccess = true;
              console.log(`✅ 分组 ${groupId} 验证任务处理了 ${taskStatus.processed} 个密钥，假设成功`);
            } else {
              console.log(`⚠️ 分组 ${groupId} 无法确定验证结果，假设失败`);
              validationSuccess = false;
            }
          }
          
          return {
            success: validationSuccess,
            processed: taskStatus.processed || 0,
            total: taskStatus.total || 0,
            task_type: taskStatus.task_type,
            key_stats: keyStats,
            valid: validationSuccess,
            error: validationSuccess ? null : '验证后没有可用密钥'
          };
        }

        // 任务还在运行，继续等待
        console.log(
          `⏳ 分组 ${groupId} 验证进度: ${taskStatus.processed}/${taskStatus.total} (${taskStatus.task_type})`
        );
        await new Promise((resolve) => setTimeout(resolve, interval));
        elapsedTime += interval;
      } catch (statusError) {
        console.error(`检查任务状态失败: ${statusError.message}`);
        console.log(`📝 状态检查错误详情:`);
        console.log(`  - 错误类型: ${statusError.name || 'Unknown'}`);
        console.log(`  - 错误代码: ${statusError.code || 'N/A'}`);
        if (statusError.response) {
          console.log(`  - 响应状态: ${statusError.response.status}`);
          console.log(`  - 响应数据: ${JSON.stringify(statusError.response.data)}`);
        }
        break;
      }
    }

    if (elapsedTime >= maxWaitTime) {
      console.log(`⚠️ 分组 ${groupId} 验证任务等待超时`);
      return {
        success: false,
        error: '验证任务等待超时'
      };
    }

    return {
      success: false,
      error: '验证任务未能完成'
    };
  }


  /**
   * 获取分组详细信息（用于调试）
   */
  async getGroupDetails(instance, groupId) {
    try {
      console.log(`🔍 获取分组 ${groupId} 的详细信息...`);
      const response = await instance.apiClient.get(`/groups/${groupId}`);
      
      console.log(`📝 分组详情响应状态: ${response.status}`);
      console.log(`📝 分组详情响应数据: ${JSON.stringify(response.data)}`);
      
      // 处理 gptload 特定格式的响应
      let groupDetails;
      if (response.data && typeof response.data.code === 'number') {
        console.log(`📝 检测到gptload分组格式，code: ${response.data.code}`);
        if (response.data.code !== 0) {
          console.log(`⚠️ 获取分组详情返回错误: ${response.data.message}`);
          return null;
        }
        groupDetails = response.data.data;
      } else {
        groupDetails = response.data;
      }

      return groupDetails;
    } catch (error) {
      console.error(`获取分组 ${groupId} 详情失败: ${error.message}`);
      console.log(`📝 详情获取错误详情:`);
      console.log(`  - 错误类型: ${error.name || 'Unknown'}`);
      console.log(`  - 错误代码: ${error.code || 'N/A'}`);
      if (error.response) {
        console.log(`  - 响应状态: ${error.response.status}`);
        console.log(`  - 响应数据: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }


  /**
   * 从指定实例删除分组
   */
  async deleteGroup(instance, groupId) {
    try {
      await instance.apiClient.delete(`/groups/${groupId}`);
      console.log(`✅ 成功从实例 ${instance.name} 删除分组 ${groupId}`);
      return true;
    } catch (error) {
      console.error(
        `❌ 从实例 ${instance.name} 删除分组 ${groupId} 失败: ${error.message}`
      );
      // 即使是404（已不存在）也视为成功
      if (error.response && error.response.status === 404) {
        console.log(`ℹ️ 分组 ${groupId} 在实例 ${instance.name} 中已不存在`);
        return true;
      }
      return false;
    }
  }

  /**
   * 获取所有分组（从所有实例）
   */
  async getAllGroups() {
    const allGroups = [];

    for (const [instanceId, instance] of this.instances) {
      const health = this.healthStatus.get(instanceId);
      if (!health?.healthy) continue;

      try {
        const response = await instance.apiClient.get("/groups");
        let groups = [];

        // 处理不同的响应格式
        if (Array.isArray(response.data)) {
          // 直接是数组格式
          groups = response.data;
        } else if (
          response.data &&
          typeof response.data.code === "number" &&
          Array.isArray(response.data.data)
        ) {
          // gptload 特定格式: { code: 0, message: "Success", data: [...] }
          groups = response.data.data;
        } else if (response.data && Array.isArray(response.data.data)) {
          // 包装在 data 字段中
          groups = response.data.data;
        } else if (response.data && Array.isArray(response.data.groups)) {
          // 包装在 groups 字段中
          groups = response.data.groups;
        } else {
          console.warn(
            `实例 ${instance.name} 返回未知的分组数据格式:`,
            response.data
          );
          continue;
        }

        const processedGroups = groups.map((group) => ({
          ...group,
          _instance: {
            id: instance.id,
            name: instance.name,
            url: instance.url,
          },
        }));

        allGroups.push(...processedGroups);
        console.log(`✅ 从实例 ${instance.name} 获取 ${groups.length} 个分组`);
      } catch (error) {
        console.error(`获取实例 ${instance.name} 的分组失败:`, error.message);
      }
    }

    return allGroups;
  }

  /**
   * 生成安全的分组名称（符合gpt-load规范：3-100字符）
   */
  generateSafeGroupName(name) {
    // 只做必要的URL安全处理，不做过度简化
    const urlSafe = this.sanitizeNameForUrl(name);
    
    // 转为小写，保留更多字符
    let groupName = urlSafe.toLowerCase()
      .replace(/[^a-z0-9-_.]/g, "-")  // 只替换真正不安全的字符
      .replace(/^[-_]+|[-_]+$/g, "")   // 移除首尾的连字符
      .replace(/[-_]{2,}/g, "-");      // 合并多个连续连字符为单个
    
    // 长度检查，但尽量保持原始信息
    if (groupName.length < 3) {
      groupName = "ch-" + groupName;
    }
    
    if (groupName.length > 100) {
      // 使用更保守的截断策略
      groupName = this.intelligentTruncate(groupName, 100);
      console.log(`📏 分组名称过长，截断为: ${groupName}`);
    }
    
    return groupName && groupName.length >= 3 ? groupName : null;
  }

  /**
   * 智能截断分组名，保留重要部分
   */
  intelligentTruncate(name, maxLength = 100) {
    if (name.length <= maxLength) return name;
    
    let truncated = name;
    
    // 只保留基本的清理：移除连续的连字符
    truncated = truncated.replace(/-+/g, "-");
    
    // 如果仍然太长，从末尾截断但保持完整性
    if (truncated.length > maxLength) {
      // 找到最后一个连字符的位置，避免截断单词中间
      const lastDashIndex = truncated.lastIndexOf('-', maxLength - 1);
      if (lastDashIndex > maxLength * 0.7) { // 如果连字符位置合理
        truncated = truncated.substring(0, lastDashIndex);
      } else {
        truncated = truncated.substring(0, maxLength);
      }
      
      // 移除末尾的连字符
      truncated = truncated.replace(/-+$/, '');
    }
    
    return truncated;
  }

  /**
   * 处理URL不安全字符
   */
  sanitizeNameForUrl(name) {
    return name
      .replace(/[\/\\:*?"<>|]/g, "-") // 替换文件系统不安全字符
      .replace(/[@#$%&()+=[\]{}';,]/g, "-") // 替换URL不安全字符
      .replace(/\s+/g, "-") // 替换空格为连字符
      .replace(/[^a-zA-Z0-9\-_.]/g, "-"); // 其他字符替换为连字符
  }
}

export default MultiGptloadManager;
