const axios = require('axios');

class MultiGptloadManager {
  constructor() {
    this.instances = new Map(); // gptload实例配置
    this.healthStatus = new Map(); // 实例健康状态
    this.siteAssignments = new Map(); // 站点到实例的分配
    this.initializeInstances();
  }

  /**
   * 初始化gptload实例配置
   */
  initializeInstances() {
    // 从环境变量读取配置
    const instancesConfig = this.parseInstancesConfig();
    
    for (const config of instancesConfig) {
      this.addInstance(config);
    }

    console.log(`🌐 初始化了 ${this.instances.size} 个 gptload 实例`);
    
    // 立即进行一次健康检查
    setTimeout(() => {
      this.checkAllInstancesHealth().catch(error => {
        console.error('初始健康检查失败:', error);
      });
    }, 1000); // 延迟1秒执行，让服务器完全启动
  }

  /**
   * 解析实例配置
   */
  parseInstancesConfig() {
    // 从 JSON 文件读取配置
    const configs = this.parseInstancesFromJsonFile();

    // 强制要求使用 JSON 文件配置
    if (configs.length === 0) {
      throw new Error('❌ 未找到 gptload-instances.json 配置文件或配置为空！\n请复制示例文件：cp gptload-instances.json.example gptload-instances.json');
    }

    return configs;
  }

  /**
   * 从 JSON 文件解析实例配置
   */
  parseInstancesFromJsonFile() {
    const fs = require('fs');
    const path = require('path');
    const configs = [];
    
    // 支持的配置文件路径（按优先级）
    const configFiles = [
      'gptload-instances.json',        // 生产配置
      'gptload-instances.local.json',  // 本地配置（优先级更高）
      process.env.GPTLOAD_INSTANCES_FILE // 自定义文件路径
    ].filter(Boolean);
    
    for (const configFile of configFiles) {
      try {
        const configPath = path.resolve(configFile);
        
        if (fs.existsSync(configPath)) {
          console.log(`📋 从 JSON 文件读取 gptload 实例配置: ${configFile}`);
          
          const fileContent = fs.readFileSync(configPath, 'utf8');
          const instances = JSON.parse(fileContent);
          
          if (Array.isArray(instances)) {
            configs.push(...instances);
            console.log(`✅ 从 ${configFile} 成功加载 ${instances.length} 个实例配置`);
          } else {
            console.warn(`⚠️ ${configFile} 格式错误：期望数组格式`);
          }
          
          // 只读取第一个找到的配置文件
          break;
        }
      } catch (error) {
        console.error(`❌ 读取配置文件 ${configFile} 失败:`, error.message);
      }
    }
    
    return configs;
  }

  /**
   * 添加gptload实例
   */
  addInstance(config) {
    const instance = {
      id: config.id,
      name: config.name,
      url: config.url,
      token: config.token || '',
      priority: config.priority || 10,
      description: config.description || '',
      apiClient: axios.create({
        baseURL: config.url + '/api',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          ...(config.token ? { 'Authorization': `Bearer ${config.token}` } : {})
        }
      })
    };

    this.instances.set(config.id, instance);
    this.healthStatus.set(config.id, { healthy: false, lastCheck: null, error: null });
    
    console.log(`➕ 添加 gptload 实例: ${config.name} (${config.url})`);
  }

  /**
   * 检查所有实例的健康状态
   */
  async checkAllInstancesHealth() {
    console.log('🩺 检查所有 gptload 实例健康状态...');
    
    const checkPromises = Array.from(this.instances.keys()).map(instanceId => 
      this.checkInstanceHealth(instanceId)
    );

    await Promise.allSettled(checkPromises);
    
    const healthyCount = Array.from(this.healthStatus.values())
      .filter(status => status.healthy).length;
    
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
      const response = await instance.apiClient.get('/groups');
      const responseTime = Date.now() - startTime;

      // 处理不同的响应格式
      let groupsCount = 0;
      if (Array.isArray(response.data)) {
        groupsCount = response.data.length;
      } else if (response.data && Array.isArray(response.data.data)) {
        groupsCount = response.data.data.length;
      } else if (response.data && typeof response.data.code === 'number' && Array.isArray(response.data.data)) {
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
        error: null
      });

      console.log(`✅ ${instance.name}: 健康 (${responseTime}ms, ${groupsCount} 个分组)`);
      
    } catch (error) {
      this.healthStatus.set(instanceId, {
        healthy: false,
        lastCheck: new Date().toISOString(),
        responseTime: null,
        groupsCount: 0,
        error: error.message
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
   * 为站点找到最佳实例
   */
  async findBestInstanceForSite(siteUrl, options) {
    // 获取健康的实例，按优先级排序
    let healthyInstances = Array.from(this.instances.values())
      .filter(instance => this.healthStatus.get(instance.id)?.healthy)
      .sort((a, b) => a.priority - b.priority);

    if (healthyInstances.length === 0) {
      console.log('⚠️ 没有健康的 gptload 实例，执行健康检查...');
      
      // 主动进行健康检查
      await this.checkAllInstancesHealth();
      
      // 重新获取健康的实例
      healthyInstances = Array.from(this.instances.values())
        .filter(instance => this.healthStatus.get(instance.id)?.healthy)
        .sort((a, b) => a.priority - b.priority);
      
      if (healthyInstances.length === 0) {
        console.log('❌ 健康检查后仍没有健康的 gptload 实例可用');
        return null;
      }
      
      console.log(`✅ 健康检查后发现 ${healthyInstances.length} 个健康实例`);
    }

    // 测试每个实例是否能访问该站点
    for (const instance of healthyInstances) {
      const canAccess = await this.testSiteAccessibility(instance, siteUrl, options);
      
      if (canAccess) {
        console.log(`✅ 实例 ${instance.name} 可以访问 ${siteUrl}`);
        return instance;
      } else {
        console.log(`❌ 实例 ${instance.name} 无法访问 ${siteUrl}`);
      }
    }

    // 如果都无法访问，返回优先级最高的健康实例
    const fallbackInstance = healthyInstances[0];
    console.log(`⚠️ 所有实例都无法访问 ${siteUrl}，使用回退实例 ${fallbackInstance.name}`);
    return fallbackInstance;
  }

  /**
   * 测试实例是否可以访问指定站点
   */
  async testSiteAccessibility(instance, siteUrl, options) {
    try {
      // 方法1：直接测试groups接口的连通性
      const groupsResponse = await instance.apiClient.get('/groups');
      
      // 如果能成功获取groups，说明实例本身是健康的
      // 对于站点连通性，我们简化假设实例健康就能访问大部分站点
      console.log(`✅ 实例 ${instance.name} 健康检查通过，假设可访问 ${siteUrl}`);
      return true;

    } catch (error) {
      // 如果连groups接口都访问不了，说明实例有问题
      console.log(`❌ 实例 ${instance.name} 健康检查失败: ${error.message}`);
      
      // 根据错误类型判断是否为连通性问题
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || error.message;
        
        // 5xx错误或连接超时可能表示实例不可用
        if (status >= 500 || message.includes('timeout') || message.includes('ECONNREFUSED')) {
          return false;
        }
        
        // 其他错误（如4xx认证问题）可能表示实例可用但配置问题
        return true;
      }

      // 网络错误表示无法连接到实例
      return false;
    }
  }

  /**
   * 通过最佳实例执行操作
   */
  async executeOnBestInstance(siteUrl, operation, options = {}) {
    const instance = await this.selectBestInstance(siteUrl, options);
    
    if (!instance) {
      throw new Error('没有可用的 gptload 实例');
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
          error: error.message
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
    return error.code === 'ECONNREFUSED' || 
           error.code === 'ETIMEDOUT' || 
           error.message.includes('timeout') ||
           error.message.includes('Network Error');
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
        error: health?.error
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
        instanceName: instance?.name || 'Unknown',
        instanceUrl: instance?.url || 'Unknown'
      };
    }
    
    return assignments;
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
  async createSiteGroup(siteName, baseUrl, apiKeys, channelType = 'openai', customValidationEndpoint = null, availableModels = null) {
    return await this.executeOnBestInstance(baseUrl, async (instance) => {
      // 为不同格式创建不同的分组名
      const groupName = `${siteName.toLowerCase()}-${channelType}`;
      
      // 检查分组是否已存在
      const existingGroup = await this.checkGroupExists(instance, groupName);
      if (existingGroup) {
        console.log(`站点分组 ${groupName} 已存在，更新配置...`);
        return await this.updateSiteGroup(instance, existingGroup, baseUrl, apiKeys, channelType, customValidationEndpoint, availableModels);
      }

      console.log(`创建站点分组: ${groupName}，格式: ${channelType}`);
      
      // 根据不同 channel_type 设置默认参数
      const channelConfig = this.getChannelConfig(channelType);
      
      // 选择验证模型：优先使用可用模型中的第一个，否则使用默认
      let testModel = channelConfig.test_model;
      if (availableModels && availableModels.length > 0) {
        testModel = availableModels[0];
        console.log(`✅ 使用筛选出的第一个模型作为验证模型: ${testModel}`);
      } else {
        console.log(`⚠️ 未提供可用模型列表，使用默认验证模型: ${testModel}`);
      }
      
      // 创建分组
      const groupData = {
        name: groupName,
        display_name: `${siteName} ${channelType.toUpperCase()} 站点`,
        description: `${siteName} AI站点 - ${baseUrl} (${channelType}) [实例: ${instance.name}]`,
        upstreams: [{ url: baseUrl, weight: 1 }],
        channel_type: channelType,
        test_model: testModel, // 使用选择的验证模型
        validation_endpoint: customValidationEndpoint || channelConfig.validation_endpoint, // 使用自定义端点或默认值
        sort: 20 // 渠道分组的排序号为20
      };

      try {
        const response = await instance.apiClient.post('/groups', groupData);
        
        // 处理不同的响应格式
        let group;
        if (response.data && typeof response.data.code === 'number' && response.data.data) {
          // gptload 特定格式: { code: 0, message: "Success", data: {...} }
          group = response.data.data;
        } else if (response.data) {
          // 直接返回数据
          group = response.data;
        } else {
          throw new Error('响应格式不正确');
        }
        
        // 添加 API 密钥
        if (apiKeys && apiKeys.length > 0) {
          await this.addApiKeysToGroup(instance, group.id, apiKeys);
        }
        
        console.log(`✅ 站点分组 ${groupName} 创建成功 (实例: ${instance.name})`);
        
        // 在返回的分组信息中添加实例信息
        return {
          ...group,
          _instance: {
            id: instance.id,
            name: instance.name,
            url: instance.url
          }
        };
      } catch (error) {
        // 如果是409错误（分组已存在），重新检查并返回现有分组
        if (error.response && error.response.status === 409) {
          console.log(`⚠️ 分组 ${groupName} 已存在（409错误），重新获取分组信息...`);
          const existingGroup = await this.checkGroupExists(instance, groupName);
          if (existingGroup) {
            console.log(`✅ 找到已存在的分组 ${groupName}，将更新配置`);
            return await this.updateSiteGroup(instance, existingGroup, baseUrl, apiKeys, channelType, customValidationEndpoint, availableModels);
          }
        }
        throw error;
      }
    }, { channelType });
  }

  /**
   * 检查分组是否存在
   */
  async checkGroupExists(instance, groupName) {
    try {
      const response = await instance.apiClient.get('/groups');
      let groups = [];
      
      // 处理不同的响应格式
      if (Array.isArray(response.data)) {
        // 直接是数组格式
        groups = response.data;
      } else if (response.data && typeof response.data.code === 'number' && Array.isArray(response.data.data)) {
        // gptload 特定格式: { code: 0, message: "Success", data: [...] }
        groups = response.data.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        // 包装在 data 字段中
        groups = response.data.data;
      } else if (response.data && Array.isArray(response.data.groups)) {
        // 包装在 groups 字段中
        groups = response.data.groups;
      } else {
        console.warn(`实例 ${instance.name} 返回未知的分组数据格式:`, response.data);
        return null;
      }
      
      return groups.find(group => group.name === groupName);
    } catch (error) {
      console.error('检查分组失败:', error.message);
      return null;
    }
  }

  /**
   * 获取不同 channel_type 的默认配置
   */
  getChannelConfig(channelType) {
    const configs = {
      openai: {
        test_model: "gpt-4o-mini",
        validation_endpoint: "/v1/chat/completions"
      },
      anthropic: {
        test_model: "claude-sonnet-3-5-20250614",
        validation_endpoint: "/v1/messages"
      },
      gemini: {
        test_model: "gemini-2.5-flash",
        validation_endpoint: "/v1beta/models"
      }
    };
    
    return configs[channelType] || configs.openai;
  }

  /**
   * 更新站点分组
   */
  async updateSiteGroup(instance, existingGroup, baseUrl, apiKeys, channelType, customValidationEndpoint = null, availableModels = null) {
    try {
      console.log(`更新站点分组: ${existingGroup.name}，格式: ${channelType} (实例: ${instance.name})`);
      
      // 根据不同 channel_type 设置默认参数
      const channelConfig = this.getChannelConfig(channelType);
      
      // 选择验证模型：优先使用可用模型中的第一个，否则使用默认
      let testModel = channelConfig.test_model;
      if (availableModels && availableModels.length > 0) {
        testModel = availableModels[0];
        console.log(`✅ 使用筛选出的第一个模型作为验证模型: ${testModel}`);
      } else {
        console.log(`⚠️ 未提供可用模型列表，使用默认验证模型: ${testModel}`);
      }
      
      // 更新分组配置
      const updateData = {
        upstreams: [{ url: baseUrl, weight: 1 }],
        channel_type: channelType,
        test_model: testModel, // 使用选择的验证模型
        validation_endpoint: customValidationEndpoint || channelConfig.validation_endpoint, // 使用自定义端点或默认值
        sort: 20 // 渠道分组的排序号为20
      };

      await instance.apiClient.put(`/groups/${existingGroup.id}`, updateData);
      
      // 添加新的 API 密钥（如果有）
      if (apiKeys && apiKeys.length > 0) {
        await this.addApiKeysToGroup(instance, existingGroup.id, apiKeys);
      }
      
      console.log(`✅ 站点分组 ${existingGroup.name} 更新成功 (实例: ${instance.name})`);
      
      return {
        ...existingGroup,
        ...updateData,
        _instance: {
          id: instance.id,
          name: instance.name,
          url: instance.url
        }
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
      const keysText = apiKeys.join('\n');
      
      const response = await instance.apiClient.post('/keys/add-multiple', {
        group_id: groupId,
        keys_text: keysText
      });
      
      console.log(`✅ 成功添加 ${apiKeys.length} 个API密钥到分组 ${groupId} (实例: ${instance.name})`);
      return response.data;
      
    } catch (error) {
      console.error(`添加API密钥失败: ${error.message}`);
      console.warn('警告: API密钥添加失败，但分组已创建，可手动添加密钥');
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
        const response = await instance.apiClient.get('/groups');
        let groups = [];
        
        // 处理不同的响应格式
        if (Array.isArray(response.data)) {
          // 直接是数组格式
          groups = response.data;
        } else if (response.data && typeof response.data.code === 'number' && Array.isArray(response.data.data)) {
          // gptload 特定格式: { code: 0, message: "Success", data: [...] }
          groups = response.data.data;
        } else if (response.data && Array.isArray(response.data.data)) {
          // 包装在 data 字段中
          groups = response.data.data;
        } else if (response.data && Array.isArray(response.data.groups)) {
          // 包装在 groups 字段中
          groups = response.data.groups;
        } else {
          console.warn(`实例 ${instance.name} 返回未知的分组数据格式:`, response.data);
          continue;
        }
        
        const processedGroups = groups.map(group => ({
          ...group,
          _instance: {
            id: instance.id,
            name: instance.name,
            url: instance.url
          }
        }));
        
        allGroups.push(...processedGroups);
        console.log(`✅ 从实例 ${instance.name} 获取 ${groups.length} 个分组`);
        
      } catch (error) {
        console.error(`获取实例 ${instance.name} 的分组失败:`, error.message);
      }
    }
    
    return allGroups;
  }
}

module.exports = new MultiGptloadManager();
