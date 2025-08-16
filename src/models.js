const axios = require('axios');

class ModelsService {
  constructor() {
    this.timeout = 30000; // 30秒超时
  }

  /**
   * 从AI站点获取支持的模型列表
   */
  async getModels(baseUrl, apiKey) {
    try {
      console.log(`正在从 ${baseUrl} 获取模型列表...`);
      
      // 构建模型列表请求URL
      const modelsUrl = this.buildModelsUrl(baseUrl);
      
      // 发送请求
      const response = await axios.get(modelsUrl, {
        timeout: this.timeout,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'uni-load/1.0.0'
        }
      });

      // 解析响应数据
      const models = this.parseModelsResponse(response.data);
      
      if (!models || models.length === 0) {
        throw new Error('未找到任何可用模型');
      }

      console.log(`✅ 成功获取 ${models.length} 个模型:`, models.slice(0, 5).join(', ') + (models.length > 5 ? '...' : ''));
      return models;
      
    } catch (error) {
      console.error(`获取模型列表失败: ${error.message}`);
      
      if (error.response) {
        console.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
        if (error.response.data) {
          console.error('响应数据:', error.response.data);
        }
      }
      
      throw new Error(`获取模型列表失败: ${error.message}`);
    }
  }

  /**
   * 构建模型列表API的URL
   */
  buildModelsUrl(baseUrl) {
    // 确保baseUrl以/结尾
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    
    // 如果baseUrl已经包含/v1，直接添加models
    if (normalizedBaseUrl.includes('/v1/')) {
      return normalizedBaseUrl + 'models';
    }
    
    // 如果baseUrl以/v1结尾，添加/models
    if (normalizedBaseUrl.endsWith('/v1/')) {
      return normalizedBaseUrl + 'models';
    }
    
    // 否则添加v1/models
    return normalizedBaseUrl + 'v1/models';
  }

  /**
   * 解析模型响应数据
   */
  parseModelsResponse(data) {
    try {
      // 标准OpenAI格式: { object: "list", data: [...] }
      if (data && data.object === 'list' && Array.isArray(data.data)) {
        return data.data
          .map(model => model.id || model.name)
          .filter(id => id && typeof id === 'string');
      }
      
      // 直接是模型数组
      if (Array.isArray(data)) {
        return data
          .map(model => {
            if (typeof model === 'string') return model;
            return model.id || model.name || model.model;
          })
          .filter(id => id && typeof id === 'string');
      }
      
      // 其他可能的格式
      if (data && data.models && Array.isArray(data.models)) {
        return data.models
          .map(model => model.id || model.name || model)
          .filter(id => id && typeof id === 'string');
      }
      
      console.warn('未识别的模型响应格式:', data);
      return [];
      
    } catch (error) {
      console.error('解析模型数据失败:', error.message);
      return [];
    }
  }

  /**
   * 验证模型是否可用（发送测试请求）
   */
  async validateModel(baseUrl, apiKey, modelName) {
    try {
      console.log(`验证模型 ${modelName}...`);
      
      const chatUrl = this.buildChatUrl(baseUrl);
      
      const testRequest = {
        model: modelName,
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        max_tokens: 1,
        temperature: 0
      };

      const response = await axios.post(chatUrl, testRequest, {
        timeout: 15000, // 15秒超时
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ 模型 ${modelName} 验证成功`);
      return true;
      
    } catch (error) {
      console.warn(`⚠️ 模型 ${modelName} 验证失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 构建聊天API的URL
   */
  buildChatUrl(baseUrl) {
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    
    if (normalizedBaseUrl.includes('/v1/')) {
      return normalizedBaseUrl + 'chat/completions';
    }
    
    if (normalizedBaseUrl.endsWith('/v1/')) {
      return normalizedBaseUrl + 'chat/completions';
    }
    
    return normalizedBaseUrl + 'v1/chat/completions';
  }

  /**
   * 批量验证模型（可选功能）
   */
  async validateModels(baseUrl, apiKey, models, maxConcurrent = 3) {
    console.log(`开始批量验证 ${models.length} 个模型...`);
    
    const validModels = [];
    const invalidModels = [];
    
    // 控制并发数量
    for (let i = 0; i < models.length; i += maxConcurrent) {
      const batch = models.slice(i, i + maxConcurrent);
      const promises = batch.map(async model => {
        const isValid = await this.validateModel(baseUrl, apiKey, model);
        return { model, isValid };
      });
      
      const results = await Promise.all(promises);
      
      results.forEach(({ model, isValid }) => {
        if (isValid) {
          validModels.push(model);
        } else {
          invalidModels.push(model);
        }
      });
    }
    
    console.log(`✅ 验证完成: ${validModels.length} 个有效, ${invalidModels.length} 个无效`);
    
    return {
      valid: validModels,
      invalid: invalidModels
    };
  }

  /**
   * 过滤和清理模型名称
   */
  filterModels(models) {
    const filtered = models.filter(model => {
      // 过滤掉一些明显不是聊天模型的
      const name = model.toLowerCase();
      
      // 跳过嵌入模型
      if (name.includes('embedding') || name.includes('embed')) {
        return false;
      }
      
      // 跳过图像模型（除非是多模态）
      if (name.includes('dall-e') || name.includes('midjourney')) {
        return false;
      }
      
      // 跳过音频模型
      if (name.includes('whisper') || name.includes('tts')) {
        return false;
      }
      
      return true;
    });

    // 去重
    return [...new Set(filtered)];
  }
}

module.exports = new ModelsService();