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
      let models = [];
      
      // 标准OpenAI格式: { object: "list", data: [...] }
      if (data && data.object === 'list' && Array.isArray(data.data)) {
        models = data.data
          .map(model => model.id || model.name)
          .filter(id => id && typeof id === 'string');
      }
      // 带有额外字段的OpenAI兼容格式: { data: [...], success: true }
      else if (data && Array.isArray(data.data)) {
        models = data.data
          .map(model => model.id || model.name)
          .filter(id => id && typeof id === 'string');
      }
      // 直接是模型数组
      else if (Array.isArray(data)) {
        models = data
          .map(model => {
            if (typeof model === 'string') return model;
            return model.id || model.name || model.model;
          })
          .filter(id => id && typeof id === 'string');
      }
      // 其他可能的格式
      else if (data && data.models && Array.isArray(data.models)) {
        models = data.models
          .map(model => model.id || model.name || model)
          .filter(id => id && typeof id === 'string');
      }
      else {
        console.warn('未识别的模型响应格式:', data);
        return [];
      }
      
      // 过滤和清理模型
      return this.filterModels(models);
      
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
    // 白名单前缀（不区分大小写）
    const allowedPrefixes = [
      // OpenAI
      'gpt-',
      // Google
      'gemini-',
      'gemma-',
      // Anthropic
      'claude-',
      // DeepSeek
      'deepseek-',
      'deepseek-ai/',
      // Qwen (Alibaba)
      'qwen-',
      // Llama (Meta)
      'llama-',
      // Mistral
      'mixtral-',
      'mistral-',
      // 01.ai
      'yi-',
      // Moonshot
      'moonshot-',
      'kimi-k2', // 保留特殊处理
      // Doubao (ByteDance)
      'doubao-'
    ];

    const filtered = models.filter(model => {
      const name = model.toLowerCase();
      
      // 跳过嵌入模型
      if (name.includes('embedding') || name.includes('embed')) {
        return false;
      }
      
      // 跳过图像生成模型
      if (name.includes('dall-e') || 
          name.includes('midjourney') || 
          name.includes('imagen') ||
          name.includes('image-generation') ||
          name.includes('generate')) {
        return false;
      }
      
      // 跳过音频模型
      if (name.includes('whisper') || 
          name.includes('tts') ||
          name.includes('audio')) {
        return false;
      }
      
      // 跳过文本嵌入模型
      if (name.includes('text-embedding')) {
        return false;
      }
      
      // 白名单检查（不区分大小写）
      const isAllowed = allowedPrefixes.some(prefix => {
        // 处理特殊情况：kimi-k2 不区分大小写
        if (prefix === 'kimi-k2') {
          return name.includes('kimi') && name.includes('k2');
        }
        // 将前缀也转为小写进行比较
        return name.startsWith(prefix.toLowerCase());
      });
      
      if (!isAllowed) {
        console.log(`🚫 过滤掉模型（不在白名单）: ${model}`);
        return false;
      }
      
      return true;
    });

    // 去重并排序
    const uniqueModels = [...new Set(filtered)];
    
    console.log(`📋 模型白名单过滤结果: ${models.length} -> ${uniqueModels.length} (过滤掉 ${models.length - uniqueModels.length} 个模型)`);
    
    return uniqueModels.sort();
  }
}

module.exports = new ModelsService();
