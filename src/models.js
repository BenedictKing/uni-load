const axios = require("axios");
const https = require("https");

class ModelsService {
  constructor() {
    this.timeout = 30000; // 30秒超时

    // 创建允许自签名证书的 HTTPS Agent
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, // 允许自签名证书和无效证书
    });
  }

  /**
   * 判断错误是否可重试
   */
  isRetryableError(error) {
    // 网络连接错误
    if (error.code === 'ECONNRESET' || 
        error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND') {
      return true;
    }
    
    // Socket 连接异常断开
    if (error.message && error.message.includes('socket connection was closed')) {
      return true;
    }
    
    // 超时错误
    if (error.message && error.message.includes('timeout')) {
      return true;
    }
    
    // 5xx 服务器错误（可能是临时的）
    if (error.response && error.response.status >= 500) {
      return true;
    }
    
    // 429 限流错误
    if (error.response && error.response.status === 429) {
      return true;
    }
    
    return false;
  }

  /**
   * 等待指定时间
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 从AI站点获取支持的模型列表（带重试机制）
   */
  async getModels(baseUrl, apiKey, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`正在从 ${baseUrl} 获取模型列表...${attempt > 1 ? ` (重试 ${attempt}/${maxRetries})` : ''}`);

        // 构建模型列表请求URL
        const modelsUrl = this.buildModelsUrl(baseUrl);

        // 发送请求
        const response = await axios.get(modelsUrl, {
          timeout: this.timeout,
          httpsAgent: this.httpsAgent, // 使用自定义的 HTTPS Agent
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "uni-load/1.0.0",
          },
        });

        // 解析响应数据
        const models = this.parseModelsResponse(response.data);

        if (!models || models.length === 0) {
          throw new Error("未找到任何可用模型");
        }

        console.log(
          `✅ 成功获取 ${models.length} 个模型:`,
          models.slice(0, 5).join(", ") + (models.length > 5 ? "..." : "")
        );
        return models;
        
      } catch (error) {
        lastError = error;
        
        // 判断是否为可重试的错误
        const isRetryableError = this.isRetryableError(error);
        
        if (isRetryableError && attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 指数退避，最大10秒
          console.warn(`⚠️ 获取模型列表失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`);
          console.log(`⏳ 等待 ${waitTime}ms 后重试...`);
          
          await this.sleep(waitTime);
          continue;
        }
        
        // 不可重试的错误或已达到最大重试次数
        console.error(`获取模型列表失败: ${error.message}`);

        if (error.response) {
          console.error(
            `HTTP ${error.response.status}: ${error.response.statusText}`
          );
          if (error.response.data) {
            console.error("响应数据:", error.response.data);
          }
        }

        break; // 跳出重试循环
      }
    }
    
    throw new Error(`获取模型列表失败 (已重试 ${maxRetries} 次): ${lastError.message}`);
  }

  /**
   * 构建模型列表API的URL
   */
  buildModelsUrl(baseUrl) {
    // 确保baseUrl以/结尾
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";

    // 如果baseUrl已经包含/v1，直接添加models
    if (normalizedBaseUrl.includes("/v1/")) {
      return normalizedBaseUrl + "models";
    }

    // 如果baseUrl以/v1结尾，添加/models
    if (normalizedBaseUrl.endsWith("/v1/")) {
      return normalizedBaseUrl + "models";
    }

    // 否则添加v1/models
    return normalizedBaseUrl + "v1/models";
  }

  /**
   * 解析模型响应数据
   */
  parseModelsResponse(data) {
    try {
      let models = [];

      // 标准OpenAI格式: { object: "list", data: [...] }
      if (data && data.object === "list" && Array.isArray(data.data)) {
        models = data.data
          .map((model) => model.id || model.name)
          .filter((id) => id && typeof id === "string");
      }
      // 带有额外字段的OpenAI兼容格式: { data: [...], success: true }
      else if (data && Array.isArray(data.data)) {
        models = data.data
          .map((model) => model.id || model.name)
          .filter((id) => id && typeof id === "string");
      }
      // 直接是模型数组
      else if (Array.isArray(data)) {
        models = data
          .map((model) => {
            if (typeof model === "string") return model;
            return model.id || model.name || model.model;
          })
          .filter((id) => id && typeof id === "string");
      }
      // 其他可能的格式
      else if (data && data.models && Array.isArray(data.models)) {
        models = data.models
          .map((model) => model.id || model.name || model)
          .filter((id) => id && typeof id === "string");
      } else {
        console.warn("未识别的模型响应格式:", data);
        return [];
      }

      // 过滤和清理模型
      return this.filterModels(models);
    } catch (error) {
      console.error("解析模型数据失败:", error.message);
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
            role: "user",
            content: "Hello",
          },
        ],
        max_tokens: 1,
        temperature: 0,
      };

      const response = await axios.post(chatUrl, testRequest, {
        timeout: 15000, // 15秒超时
        httpsAgent: this.httpsAgent, // 使用自定义的 HTTPS Agent
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
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
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";

    if (normalizedBaseUrl.includes("/v1/")) {
      return normalizedBaseUrl + "chat/completions";
    }

    if (normalizedBaseUrl.endsWith("/v1/")) {
      return normalizedBaseUrl + "chat/completions";
    }

    return normalizedBaseUrl + "v1/chat/completions";
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
      const promises = batch.map(async (model) => {
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

    console.log(
      `✅ 验证完成: ${validModels.length} 个有效, ${invalidModels.length} 个无效`
    );

    return {
      valid: validModels,
      invalid: invalidModels,
    };
  }

  /**
   * 过滤和清理模型名称
   */
  filterModels(models) {
    // 白名单前缀（不区分大小写）
    const allowedPrefixes = [
      // OpenAI
      "gpt-",
      "chatgpt-",
      // Google
      "gemini-2.5-", // 仅支持 2.5 及以上版本
      "gemma-",
      // Anthropic
      "claude-opus",
      "claude-sonnet",
      "claude-3",
      "claude-4",
      // DeepSeek
      "deepseek-",
      // Qwen (Alibaba)
      "qwen-",
      "qwen3-",
      // Llama (Meta)
      "llama-",
      // Mistral
      "mixtral-",
      "mistral-",
      // 01.ai
      // "yi-",
      // Moonshot
      "kimi-k2",
      // Doubao (ByteDance)
      "doubao-1-6-",
      "doubao-seed-",
      // Zhipu AI (智谱)
      "glm-",
      // xAI
      "grok-3",
      "grok-4",
      // Flux
      "flux-",
      // Misc / Provider Specific
      "o1",
      "o3",
      "o4",
      // vercel v0
      "v0-",
      // MiniMax
      "minimax-",
    ];

    // 黑名单关键词（不区分大小写），包含这些词的模型将被过滤
    const blacklistedKeywords = [
      "vision",
      "image",
      "audio",
      "rag",
      "json",
      "rerank",
      "tts",
      "dall-e",
      "whisper",
      "embedding",
      "embed",
      "generation",
      "sora",
    ];

    const filtered = models.filter((model) => {
      const name = model.toLowerCase();

      // 黑名单检查：如果模型名称包含任何黑名单关键词，则过滤掉
      const isBlacklisted = blacklistedKeywords.some((keyword) =>
        name.includes(keyword)
      );
      if (isBlacklisted) {
        console.log(`🚫 过滤掉模型（在黑名单中）: ${model}`);
        return false;
      }

      // 白名单检查（不区分大小写）
      let isAllowed = allowedPrefixes.some((prefix) => {
        // 首先尝试匹配完整名称（例如 "deepseek-ai/..."）
        return name.startsWith(prefix.toLowerCase());
      });

      // 如果完整名称不匹配，并且包含斜杠，则尝试匹配斜杠后的部分
      // 例如：检查 "Qwen/Qwen3..." 中的 "Qwen3..." 是否以 "qwen-" 开头
      if (!isAllowed && name.includes("/")) {
        const parts = name.split("/");
        const modelPart = parts[parts.length - 1];
        isAllowed = allowedPrefixes.some((prefix) => {
          return modelPart.startsWith(prefix.toLowerCase());
        });
      }

      if (!isAllowed) {
        console.log(`🚫 过滤掉模型（不在白名单）: ${model}`);
        return false;
      }

      return true;
    });

    // 去重并排序
    const uniqueModels = [...new Set(filtered)];

    console.log(
      `📋 模型白名单过滤结果: ${models.length} -> ${
        uniqueModels.length
      } (过滤掉 ${models.length - uniqueModels.length} 个模型)`
    );

    return uniqueModels.sort();
  }
}

module.exports = new ModelsService();
