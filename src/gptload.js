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
  async createSiteGroup(siteName, baseUrl, apiKeys, channelType = 'openai', customValidationEndpoint = null, availableModels = null) {
    return await this.manager.createSiteGroup(siteName, baseUrl, apiKeys, channelType, customValidationEndpoint, availableModels);
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
  async updateSiteGroup(existingGroup, baseUrl, apiKeys, channelType = 'openai', customValidationEndpoint = null, availableModels = null) {
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
        validation_endpoint: channelConfig.validation_endpoint,
        sort: 20 // 渠道分组的排序号为20
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
   * 根据ID删除分组
   */
  async deleteGroupById(groupId, instanceId) {
    if (!instanceId) {
      throw new Error('删除分组需要提供 instanceId');
    }
    
    const instance = this.manager.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例 ${instanceId} 不存在`);
    }
    
    return await this.manager.deleteGroup(instance, groupId);
  }

  /**
   * 删除所有模型分组 (sort=10)
   */
  async deleteAllModelGroups() {
    console.log('🚨 开始删除所有 sort=10 的模型分组...');
    
    const allGroups = await this.getAllGroups();
    const modelGroupsToDelete = allGroups.filter(group => group.sort === 10);

    if (modelGroupsToDelete.length === 0) {
      console.log('✅ 没有找到需要删除的模型分组');
      return { deleted: [], failed: [], message: '没有找到 sort=10 的模型分组' };
    }

    console.log(`🗑️ 发现 ${modelGroupsToDelete.length} 个模型分组需要删除...`);

    const results = {
      deleted: [],
      failed: []
    };

    for (const group of modelGroupsToDelete) {
      try {
        const success = await this.deleteGroupById(group.id, group._instance.id);
        if (success) {
          results.deleted.push(group.name);
        } else {
          results.failed.push({ name: group.name, reason: '删除失败' });
        }
      } catch (error) {
        results.failed.push({ name: group.name, reason: error.message });
      }
    }
    
    console.log(`🏁 批量删除完成: 成功 ${results.deleted.length} 个, 失败 ${results.failed.length} 个`);
    return results;
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
        } else {
          console.log(`⚠️ 模型 ${model} 被跳过（分组名无法生成或其他问题）`);
        }
      } catch (error) {
        console.error(`处理模型 ${model} 失败:`, error.message);
        // 继续处理其他模型
      }
    }
    
    return modelGroups;
  }

  /**
   * 处理模型名称中的URL不安全字符（仅处理斜杠）
   */
  sanitizeModelNameForUrl(modelName) {
    // 只处理斜杠，替换为连字符，保持其他原样
    const sanitized = modelName.replace(/\//g, '-');
    
    if (modelName !== sanitized) {
      console.log(`🔧 处理URL不安全字符: ${modelName} -> ${sanitized}`);
    }
    
    return sanitized;
  }

  /**
   * 生成安全的分组名称（符合gpt-load规范）
   */
  generateSafeGroupName(modelName, channelType) {
    // 将模型名称和渠道类型结合，确保唯一性
    const combinedName = `${modelName}-${channelType}`;
    
    // 处理URL不安全字符
    const urlSafe = this.sanitizeModelNameForUrl(combinedName);
    
    // 转为小写，只保留字母、数字、中划线、下划线
    let groupName = urlSafe.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    
    // 移除开头和结尾的连字符/下划线
    groupName = groupName.replace(/^[-_]+|[-_]+$/g, '');
    
    // 合并多个连续的连字符/下划线
    groupName = groupName.replace(/[-_]+/g, '-');
    
    // gpt-load要求：长度3-30位
    if (groupName.length < 3) {
      // 如果太短，添加前缀
      groupName = 'mdl-' + groupName;
    }
    
    if (groupName.length > 30) {
      // 如果太长，智能截断保留重要部分
      const truncated = this.intelligentTruncate(groupName, 30);
      
      // 如果截断后仍然太长，说明这个模型名无法处理
      if (truncated.length > 30) {
        console.log(`❌ 模型名称过长无法处理，跳过: ${modelName}`);
        return null; // 返回null表示跳过这个模型
      }
      
      groupName = truncated;
      console.log(`📏 分组名过长，智能截断为: ${groupName}`);
    }
    
    // 确保符合规范
    if (!groupName || groupName.length < 3 || groupName.length > 30) {
      console.log(`❌ 分组名不符合规范，跳过模型: ${modelName} (格式: ${channelType})`);
      return null; // 返回null表示跳过这个模型
    }
    
    return groupName;
  }

  /**
   * 智能截断分组名，保留重要部分
   */
  intelligentTruncate(name, maxLength) {
    if (name.length <= maxLength) return name;
    
    let truncated = name;
    
    // 第一步：删除所有连字符，直接连接
    truncated = truncated.replace(/-/g, '');
    
    if (truncated.length <= maxLength) return truncated;
    
    // 第二步：常见词语缩写
    const abbreviations = {
      'deepseek': 'ds',
      'gemini': 'gm',
      'anthropic': 'ant',
      'claude': 'cl',
      'openai': 'oai',
      'chatgpt': 'cgpt',
      'gpt': 'g',
      'flash': 'f',
      'lite': 'l',
      'preview': 'p',
      'turbo': 't',
      'instruct': 'i',
      'vision': 'v',
      'pro': 'p',
      'mini': 'm',
      'large': 'lg',
      'medium': 'md',
      'small': 'sm'
    };
    
    for (const [full, abbr] of Object.entries(abbreviations)) {
      const regex = new RegExp(full, 'g');
      truncated = truncated.replace(regex, abbr);
      if (truncated.length <= maxLength) return truncated;
    }
    
    // 第三步：移除常见的版本号和日期模式
    truncated = truncated
      .replace(/p\d{4}$/, '')                    // preview0617 -> p0617 -> 空
      .replace(/\d{4}\d{2}\d{2}$/, '')          // 20241201
      .replace(/\d{8}$/, '')                     // 20241201
      .replace(/\d{3}$/, '')                     // 001
      .replace(/latest$/, '')                    // latest
      .replace(/v?\d+(\.\d+)*$/, '');           // v3, 2.5
    
    if (truncated.length <= maxLength) return truncated;
    
    // 第四步：如果还是太长，从末尾截断
    if (truncated.length > maxLength) {
      truncated = truncated.substring(0, maxLength);
    }
    
    return truncated;
  }

  /**
   * 根据模型名称获取渠道类型
   */
  getChannelTypeForModel(modelName) {
    const lowerCaseModel = modelName.toLowerCase();

    if (lowerCaseModel.startsWith('claude-')) {
      return 'anthropic';
    }

    if (lowerCaseModel.startsWith('gemini-')) {
      return 'gemini';
    }

    // 默认为 openai
    return 'openai';
  }

  /**
   * 创建或更新单个模型分组
   */
  async createOrUpdateModelGroup(originalModelName, siteGroups) {
    // 1. 根据模型名称确定渠道类型，并考虑可用站点格式
    const preferredChannelType = this.getChannelTypeForModel(originalModelName);
    const isPreferredTypeAvailable = siteGroups.some(sg => sg.channel_type === preferredChannelType);
    
    let channelType;
    if (isPreferredTypeAvailable) {
      // 如果站点提供了模型原生的API格式，则使用该格式
      channelType = preferredChannelType;
      console.log(`✅ 找到匹配的模型原生格式 [${preferredChannelType.toUpperCase()}] 的站点分组`);
    } else {
      // 否则，回退到第一个可用的站点分组格式
      const fallbackType = siteGroups[0]?.channel_type || 'openai';
      if (preferredChannelType !== fallbackType) {
        console.log(`⚠️ 未找到模型原生格式 [${preferredChannelType.toUpperCase()}] 的站点分组，将回退使用 [${fallbackType.toUpperCase()}] 格式`);
      }
      channelType = fallbackType;
    }
    
    // 2. 使用模型名和最终确定的渠道类型生成安全的分组名称
    const groupName = this.generateSafeGroupName(originalModelName, channelType);
    
    // 如果分组名无法生成（太长），跳过这个模型
    if (!groupName) {
      console.log(`⏭️ 跳过模型: ${originalModelName}`);
      return null;
    }
    
    console.log(`处理模型: ${originalModelName} (格式: ${channelType}) -> 分组名: ${groupName}`);
    
    // 检查模型分组是否已存在（在所有实例中查找）
    const existingGroup = await this.checkGroupExists(groupName);
    
    if (existingGroup) {
      console.log(`模型分组 ${groupName} 已存在，添加站点分组为上游...`);
      return await this.addSiteGroupsToModelGroup(existingGroup, siteGroups);
    }

    console.log(`创建模型分组: ${groupName} (原始模型: ${originalModelName})`);
    
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
        if (!siteGroup || !siteGroup.name) {
          console.error('站点分组数据不完整:', siteGroup);
          return null; // 返回 null 而不是抛出错误，稍后过滤
        }
        
        const instanceUrl = siteGroup._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001';
        const upstreamUrl = `${instanceUrl}/proxy/${siteGroup.name}`;
        
        console.log(`📋 添加上游: ${upstreamUrl} (来源: ${siteGroup.name})`);
        
        return {
          url: upstreamUrl,
          weight: 1
        };
      }).filter(upstream => upstream !== null); // 过滤掉无效的上游

      if (upstreams.length === 0) {
        throw new Error('没有有效的站点分组可用于创建模型分组');
      }

      // 根据模型名称确定渠道类型并获取相应配置 (channelType 已在前面获取)
      const channelConfig = this.getChannelConfig(channelType);
      console.log(`ℹ️ 模型 ${originalModelName} 将使用 ${channelType.toUpperCase()} 格式`);

      // 创建模型分组，上游指向所有站点分组
      const groupData = {
        name: groupName,
        display_name: `${originalModelName} 模型 (${channelType.toUpperCase()})`,
        description: `${originalModelName} 模型聚合分组 (格式: ${channelType}, 跨实例)`,
        upstreams: upstreams,
        channel_type: channelType, // 动态设置 channel_type
        test_model: originalModelName, // 保持原始模型名称
        validation_endpoint: channelConfig.validation_endpoint, // 使用对应格式的验证端点
        sort: 10 // 模型分组的排序号为10
      };

      const response = await targetInstance.apiClient.post('/groups', groupData);
      
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
      
      // 为模型分组添加gpt-load的访问token作为API密钥
      if (targetInstance.token) {
        try {
          await this.manager.addApiKeysToGroup(targetInstance, group.id, [targetInstance.token]);
          console.log(`✅ 已为模型分组 ${groupName} 添加gpt-load访问token`);
        } catch (error) {
          console.warn(`⚠️ 为模型分组添加gpt-load token失败: ${error.message}，但分组已创建成功`);
        }
      } else {
        console.warn(`⚠️ 实例 ${targetInstance.name} 没有配置token，模型分组 ${groupName} 将无API密钥`);
      }
      
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
      
      // 如果是400错误，尝试获取更详细的错误信息
      if (error.response && error.response.status === 400) {
        console.error('400错误详情:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          groupName: groupName,
          originalModelName: originalModelName,
          groupData: JSON.stringify(groupData, null, 2)
        });
      }
      
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
        if (!siteGroup || !siteGroup.name) {
          console.error('跳过无效的站点分组:', siteGroup);
          continue; // 跳过无效的站点分组
        }
        
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

  /**
   * 手动检查所有实例健康状态
   */
  async checkAllInstancesHealth() {
    return await this.manager.checkAllInstancesHealth();
  }
}

module.exports = new GptloadService();
