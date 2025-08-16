const multiGptloadManager = require('./multi-gptload');

class GptloadService {
  constructor() {
    // 使用多实例管理器
    this.manager = multiGptloadManager;
  }

  /**
   * 获取 gptload 状态
   */
  async getStatus() {
    try {
      await this.manager.checkAllInstancesHealth();
      const instances = this.manager.getAllInstancesStatus();
      
      const healthyCount = Object.values(instances).filter(inst => inst.healthy).length;
      const totalCount = Object.keys(instances).length;
      
      return {
        connected: healthyCount > 0,
        instances,
        healthyCount,
        totalCount,
        siteAssignments: this.manager.getSiteAssignments()
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        instances: {},
        healthyCount: 0,
        totalCount: 0,
        siteAssignments: {}
      };
    }
  }

  /**
   * 检查分组是否存在 (在所有实例中查找)
   */
  async checkGroupExists(groupName) {
    try {
      const allGroups = await this.manager.getAllGroups();
      return allGroups.find(group => group.name === groupName);
    } catch (error) {
      console.error('检查分组失败:', error.message);
      return null;
    }
  }

  /**
   * 创建站点分组（第一层）
   */
  async createSiteGroup(siteName, baseUrl, apiKeys, channelType = 'openai') {
    return await this.manager.createSiteGroup(siteName, baseUrl, apiKeys, channelType);
  }

  /**
   * 获取不同 channel_type 的默认配置
   */
  getChannelConfig(channelType) {
    return this.manager.getChannelConfig(channelType);
  }

  /**
   * 更新站点分组
   */
  async updateSiteGroup(existingGroup, baseUrl, apiKeys, channelType = 'openai') {
    // 使用分组所在的实例进行更新
    const instanceId = existingGroup._instance?.id;
    
    if (!instanceId) {
      throw new Error('无法确定分组所在的实例');
    }
    
    const instance = this.manager.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例 ${instanceId} 不存在`);
    }

    try {
      console.log(`更新站点分组: ${existingGroup.name}，格式: ${channelType} (实例: ${instance.name})`);
      
      // 根据不同 channel_type 设置默认参数
      const channelConfig = this.getChannelConfig(channelType);
      
      // 更新分组配置
      const updateData = {
        upstreams: [{ url: baseUrl, weight: 1 }],
        channel_type: channelType,
        test_model: channelConfig.test_model,
        validation_endpoint: channelConfig.validation_endpoint
      };

      await instance.apiClient.put(`/groups/${existingGroup.id}`, updateData);
      
      // 添加新的 API 密钥（如果有）
      if (apiKeys && apiKeys.length > 0) {
        await this.addApiKeysToGroup(existingGroup.id, apiKeys, instance);
      }
      
      console.log(`✅ 站点分组 ${existingGroup.name} 更新成功 (实例: ${instance.name})`);
      
      return {
        ...existingGroup,
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
  async addApiKeysToGroup(groupId, apiKeys, instance = null) {
    if (!instance) {
      // 如果没有指定实例，尝试找到包含该分组的实例
      const allGroups = await this.manager.getAllGroups();
      const group = allGroups.find(g => g.id === groupId);
      
      if (!group?._instance) {
        throw new Error('无法确定分组所在的实例');
      }
      
      const instanceId = group._instance.id;
      instance = this.manager.getInstance(instanceId);
    }

    return await this.manager.addApiKeysToGroup(instance, groupId, apiKeys);
  }

  /**
   * 创建或更新模型分组（第二层）
   */
  async createOrUpdateModelGroups(models, siteGroups) {
    const modelGroups = [];
    
    for (const model of models) {
      try {
        const modelGroup = await this.createOrUpdateModelGroup(model, siteGroups);
        if (modelGroup) {
          modelGroups.push(modelGroup);
        }
      } catch (error) {
        console.error(`处理模型 ${model} 失败:`, error.message);
        // 继续处理其他模型
      }
    }
    
    return modelGroups;
  }

  /**
   * 创建或更新单个模型分组
   */
  async createOrUpdateModelGroup(modelName, siteGroups) {
    const groupName = modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // 检查模型分组是否已存在（在所有实例中查找）
    const existingGroup = await this.checkGroupExists(groupName);
    
    if (existingGroup) {
      console.log(`模型分组 ${groupName} 已存在，添加站点分组为上游...`);
      return await this.addSiteGroupsToModelGroup(existingGroup, siteGroups);
    }

    console.log(`创建模型分组: ${groupName}`);
    
    // 选择一个健康的实例来创建模型分组（优先使用本地实例）
    const localInstance = this.manager.getInstance('local');
    const localHealth = this.manager.healthStatus?.get('local');
    
    let targetInstance = localInstance;
    if (!localHealth?.healthy) {
      // 本地实例不健康，选择其他健康的实例
      const allInstances = this.manager.getAllInstancesStatus();
      const healthyInstanceId = Object.keys(allInstances).find(id => allInstances[id].healthy);
      
      if (!healthyInstanceId) {
        throw new Error('没有健康的 gptload 实例可用于创建模型分组');
      }
      
      targetInstance = this.manager.getInstance(healthyInstanceId);
    }
    
    try {
      // 为所有站点分组创建上游配置
      const upstreams = siteGroups.map(siteGroup => {
        const instanceUrl = siteGroup._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001';
        return {
          url: `${instanceUrl}/proxy/${siteGroup.name}`,
          weight: 1
        };
      });

      // 创建模型分组，上游指向所有站点分组
      const groupData = {
        name: groupName,
        display_name: `${modelName} 模型`,
        description: `${modelName} 模型聚合分组 (支持多种格式，跨实例)`,
        upstreams: upstreams,
        channel_type: "openai", // 模型分组统一使用openai格式对外
        test_model: modelName,
        validation_endpoint: "/chat/completions"
      };

      const response = await targetInstance.apiClient.post('/groups', groupData);
      const group = response.data;
      
      console.log(`✅ 模型分组 ${groupName} 创建成功，包含 ${upstreams.length} 个上游 (实例: ${targetInstance.name})`);
      
      return {
        ...group,
        _instance: {
          id: targetInstance.id,
          name: targetInstance.name,
          url: targetInstance.url
        }
      };
      
    } catch (error) {
      console.error(`创建模型分组 ${groupName} 失败: ${error.message}`);
      throw new Error(`创建模型分组失败: ${error.message}`);
    }
  }

  /**
   * 向现有模型分组添加多个站点分组作为上游
   */
  async addSiteGroupsToModelGroup(modelGroup, siteGroups) {
    const instanceId = modelGroup._instance?.id;
    
    if (!instanceId) {
      throw new Error('无法确定模型分组所在的实例');
    }
    
    const instance = this.manager.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例 ${instanceId} 不存在`);
    }

    try {
      // 获取当前上游列表
      const currentUpstreams = modelGroup.upstreams || [];
      
      // 创建新的上游列表
      let updatedUpstreams = [...currentUpstreams];
      let addedCount = 0;
      
      for (const siteGroup of siteGroups) {
        const instanceUrl = siteGroup._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001';
        const newUpstreamUrl = `${instanceUrl}/proxy/${siteGroup.name}`;
        
        // 检查是否已经包含此上游
        const existingUpstream = currentUpstreams.find(upstream => 
          upstream.url === newUpstreamUrl
        );
        
        if (!existingUpstream) {
          // 添加新的上游
          updatedUpstreams.push({
            url: newUpstreamUrl,
            weight: 1
          });
          addedCount++;
          console.log(`➕ 添加站点分组 ${siteGroup.name} 到模型分组 ${modelGroup.name} (跨实例)`);
        } else {
          console.log(`⚡ 站点分组 ${siteGroup.name} 已存在于模型分组 ${modelGroup.name}`);
        }
      }
      
      if (addedCount > 0) {
        const updateData = {
          upstreams: updatedUpstreams
        };

        await instance.apiClient.put(`/groups/${modelGroup.id}`, updateData);
        console.log(`✅ 已添加 ${addedCount} 个站点分组到模型分组 ${modelGroup.name} (实例: ${instance.name})`);
      } else {
        console.log(`ℹ️ 模型分组 ${modelGroup.name} 无需更新，所有站点分组已存在`);
      }
      
      return { 
        ...modelGroup, 
        upstreams: updatedUpstreams,
        _instance: {
          id: instance.id,
          name: instance.name,
          url: instance.url
        }
      };
      
    } catch (error) {
      console.error(`更新模型分组上游失败: ${error.message}`);
      throw new Error(`更新模型分组上游失败: ${error.message}`);
    }
  }

  /**
   * 获取所有分组
   */
  async getAllGroups() {
    return await this.manager.getAllGroups();
  }

  /**
   * 重新分配站点到指定实例
   */
  async reassignSite(siteUrl, instanceId = null) {
    return await this.manager.reassignSite(siteUrl, instanceId);
  }

  /**
   * 获取多实例管理器的状态
   */
  getMultiInstanceStatus() {
    return {
      instances: this.manager.getAllInstancesStatus(),
      siteAssignments: this.manager.getSiteAssignments()
    };
  }
}

module.exports = new GptloadService();