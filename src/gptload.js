const axios = require('axios');

class GptloadService {
  constructor() {
    this.baseUrl = process.env.GPTLOAD_URL || 'http://localhost:3001';
    this.apiClient = axios.create({
      baseURL: this.baseUrl + '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 获取 gptload 状态
   */
  async getStatus() {
    try {
      const response = await this.apiClient.get('/groups');
      return {
        connected: true,
        groupsCount: response.data.length
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * 检查分组是否存在
   */
  async checkGroupExists(groupName) {
    try {
      const response = await this.apiClient.get('/groups');
      const groups = response.data;
      return groups.find(group => group.name === groupName);
    } catch (error) {
      console.error('检查分组失败:', error.message);
      return null;
    }
  }

  /**
   * 创建站点分组（第一层）
   */
  async createSiteGroup(siteName, baseUrl, apiKeys) {
    const groupName = siteName.toLowerCase();
    
    // 检查分组是否已存在
    const existingGroup = await this.checkGroupExists(groupName);
    if (existingGroup) {
      console.log(`站点分组 ${groupName} 已存在，更新配置...`);
      return await this.updateSiteGroup(existingGroup, baseUrl, apiKeys);
    }

    console.log(`创建站点分组: ${groupName}`);
    
    try {
      // 创建分组
      const groupData = {
        name: groupName,
        display_name: `${siteName} 站点`,
        description: `${siteName} AI站点 - ${baseUrl}`,
        upstreams: [
          {
            url: baseUrl,
            weight: 1
          }
        ],
        channel_type: "openai", // 使用 openai 兼容接口
        test_model: "gpt-3.5-turbo", // 默认测试模型
        validation_endpoint: "/chat/completions"
      };

      const response = await this.apiClient.post('/groups', groupData);
      const group = response.data;
      
      // 添加 API 密钥
      if (apiKeys && apiKeys.length > 0) {
        await this.addApiKeysToGroup(group.id, apiKeys);
      }
      
      console.log(`✅ 站点分组 ${groupName} 创建成功`);
      return group;
      
    } catch (error) {
      console.error(`创建站点分组失败: ${error.message}`);
      if (error.response) {
        console.error('响应数据:', error.response.data);
      }
      throw new Error(`创建站点分组失败: ${error.message}`);
    }
  }

  /**
   * 更新站点分组
   */
  async updateSiteGroup(existingGroup, baseUrl, apiKeys) {
    try {
      console.log(`更新站点分组: ${existingGroup.name}`);
      
      // 更新分组配置
      const updateData = {
        upstreams: [
          {
            url: baseUrl,
            weight: 1
          }
        ]
      };

      await this.apiClient.put(`/groups/${existingGroup.id}`, updateData);
      
      // 添加新的 API 密钥（如果有）
      if (apiKeys && apiKeys.length > 0) {
        await this.addApiKeysToGroup(existingGroup.id, apiKeys);
      }
      
      console.log(`✅ 站点分组 ${existingGroup.name} 更新成功`);
      return existingGroup;
      
    } catch (error) {
      console.error(`更新站点分组失败: ${error.message}`);
      throw new Error(`更新站点分组失败: ${error.message}`);
    }
  }

  /**
   * 向分组添加 API 密钥
   */
  async addApiKeysToGroup(groupId, apiKeys) {
    try {
      const keysText = apiKeys.join('\n');
      
      const response = await this.apiClient.post('/keys/add-multiple', {
        group_id: groupId,
        keys_text: keysText
      });
      
      console.log(`✅ 成功添加 ${apiKeys.length} 个API密钥到分组 ${groupId}`);
      return response.data;
      
    } catch (error) {
      console.error(`添加API密钥失败: ${error.message}`);
      // 不抛出错误，因为分组已经创建成功
      console.warn('警告: API密钥添加失败，但分组已创建，可手动添加密钥');
    }
  }

  /**
   * 创建或更新模型分组（第二层）
   */
  async createOrUpdateModelGroups(models, siteGroup) {
    const modelGroups = [];
    
    for (const model of models) {
      try {
        const modelGroup = await this.createOrUpdateModelGroup(model, siteGroup);
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
  async createOrUpdateModelGroup(modelName, siteGroup) {
    const groupName = modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // 检查模型分组是否已存在
    const existingGroup = await this.checkGroupExists(groupName);
    
    if (existingGroup) {
      console.log(`模型分组 ${groupName} 已存在，添加站点分组为上游...`);
      return await this.addSiteGroupToModelGroup(existingGroup, siteGroup);
    }

    console.log(`创建模型分组: ${groupName}`);
    
    try {
      // 创建模型分组，上游指向站点分组
      const groupData = {
        name: groupName,
        display_name: `${modelName} 模型`,
        description: `${modelName} 模型聚合分组`,
        upstreams: [
          {
            url: `${this.baseUrl}/proxy/${siteGroup.name}`,
            weight: 1
          }
        ],
        channel_type: "openai",
        test_model: modelName,
        validation_endpoint: "/chat/completions"
      };

      const response = await this.apiClient.post('/groups', groupData);
      const group = response.data;
      
      console.log(`✅ 模型分组 ${groupName} 创建成功`);
      return group;
      
    } catch (error) {
      console.error(`创建模型分组 ${groupName} 失败: ${error.message}`);
      throw new Error(`创建模型分组失败: ${error.message}`);
    }
  }

  /**
   * 向现有模型分组添加站点分组作为上游
   */
  async addSiteGroupToModelGroup(modelGroup, siteGroup) {
    try {
      // 获取当前上游列表
      const currentUpstreams = modelGroup.upstreams || [];
      const newUpstreamUrl = `${this.baseUrl}/proxy/${siteGroup.name}`;
      
      // 检查是否已经包含此上游
      const existingUpstream = currentUpstreams.find(upstream => 
        upstream.url === newUpstreamUrl
      );
      
      if (existingUpstream) {
        console.log(`站点分组 ${siteGroup.name} 已经是模型分组 ${modelGroup.name} 的上游`);
        return modelGroup;
      }
      
      // 添加新的上游
      const updatedUpstreams = [
        ...currentUpstreams,
        {
          url: newUpstreamUrl,
          weight: 1
        }
      ];

      const updateData = {
        upstreams: updatedUpstreams
      };

      await this.apiClient.put(`/groups/${modelGroup.id}`, updateData);
      
      console.log(`✅ 已将站点分组 ${siteGroup.name} 添加到模型分组 ${modelGroup.name} 的上游`);
      return { ...modelGroup, upstreams: updatedUpstreams };
      
    } catch (error) {
      console.error(`更新模型分组上游失败: ${error.message}`);
      throw new Error(`更新模型分组上游失败: ${error.message}`);
    }
  }

  /**
   * 获取所有分组
   */
  async getAllGroups() {
    try {
      const response = await this.apiClient.get('/groups');
      return response.data;
    } catch (error) {
      console.error('获取分组列表失败:', error.message);
      throw new Error(`获取分组列表失败: ${error.message}`);
    }
  }
}

module.exports = new GptloadService();