/**
 * 模型配置管理
 *
 * 统一管理所有模型相关的配置，包括：
 * - 白名单（允许的模型前缀）
 * - 黑名单（禁用的模型关键词）
 * - 高消耗模型（需要谨慎使用的模型）
 * - gptload 配置项
 */

class ModelConfig {
  constructor() {
    // 模型白名单前缀（不区分大小写）
    this.allowedPrefixes = [
      // OpenAI
      "gpt-",
      "chatgpt-",

      // Google
      "gemini-2.5-", // 仅支持 2.5 及以上版本
      "gemma-",

      // Anthropic
      "claude-opus",
      "claude-sonnet",
      "claude-3-5",
      "claude-3-7",
      "claude-4",

      // DeepSeek
      "deepseek-",

      // Qwen (Alibaba)
      // "qwen-",
      // "qwen3-",

      // Llama (Meta)
      // "llama-",

      // Mistral
      // "mixtral-",
      // "mistral-",

      // 01.ai
      // "yi-",

      // Moonshot
      "kimi-k2",

      // Doubao (ByteDance)
      "doubao-1-6-",
      "doubao-seed-",

      // Zhipu AI (智谱)
      "glm-4.5",

      // xAI
      "grok-3",
      "grok-4",

      // Flux
      // "flux-",

      // Misc / Provider Specific
      // "o1",
      // "o3",
      // "o4",

      // vercel v0
      "v0-",

      // MiniMax
      // "minimax-",
    ];

    // 模型黑名单关键词（不区分大小写），包含这些词的模型将被过滤
    this.blacklistedKeywords = [
      "gpt-3.5",
      "test",
      "bge",
      "distill",
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

    // 高消耗模型模式 - 这些模型不能在分组中自动验证
    this.highCostModelPatterns = [
      "o3-", // OpenAI O3 系列
      "gpt-5-", // GPT-5 系列
      "grok-4-", // Grok 4 系列
      "opus-", // Claude Opus 系列
      "wan2", // 万达模型
    ];

    // 优先使用的小模型列表（按优先级排序，用于验证和测试）
    this.preferredTestModels = [
      // OpenAI 小模型
      "gpt-oss",
      "gpt-4o-mini",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-3.5-turbo",

      // DeepSeek 小模型
      "deepseek-v3",
      "deepseek-chat",

      // Google 小模型
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-1.5-flash",

      // Anthropic 小模型
      "claude-3-haiku",
      "claude-3-5-haiku",

      // Qwen 小模型
      "qwen-2.5-turbo",
      "qwen-turbo",

      // 其他小模型
      "llama-3.2-3b",
      "mistral-7b",
      "yi-lightning",
    ];
  }

  /**
   * 检查模型是否在白名单中
   * @param {string} modelName 模型名称
   * @return {boolean} 是否在白名单中
   */
  isModelAllowed(modelName) {
    if (!modelName) return false;

    const name = modelName.toLowerCase();

    return this.allowedPrefixes.some((prefix) => {
      // 首先尝试匹配完整名称（例如 "deepseek-ai/..."）
      if (name.startsWith(prefix.toLowerCase())) {
        return true;
      }

      // 然后尝试匹配去掉提供商前缀的名称
      const withoutProvider = name.split("/").pop() || name;
      return withoutProvider.startsWith(prefix.toLowerCase());
    });
  }

  /**
   * 检查模型是否在黑名单中
   * @param {string} modelName 模型名称
   * @return {boolean} 是否在黑名单中
   */
  isModelBlacklisted(modelName) {
    if (!modelName) return false;

    const name = modelName.toLowerCase();

    return this.blacklistedKeywords.some((keyword) =>
      name.includes(keyword.toLowerCase())
    );
  }

  /**
   * 检查模型是否为高消耗模型
   * @param {string} modelName 模型名称
   * @return {boolean} 是否为高消耗模型
   */
  isHighCostModel(modelName) {
    if (!modelName) return false;

    const modelNameLower = modelName.toLowerCase();

    // 检查是否包含任何高消耗模型模式
    return this.highCostModelPatterns.some((pattern) => {
      return modelNameLower.includes(pattern.toLowerCase());
    });
  }

  /**
   * 过滤模型列表，返回符合条件的模型
   * @param {string[]} models 模型列表
   * @return {string[]} 过滤后的模型列表
   */
  filterModels(models) {
    return models.filter((model) => {
      // 黑名单检查：如果模型名称包含任何黑名单关键词，则过滤掉
      if (this.isModelBlacklisted(model)) {
        console.log(`🚫 过滤掉模型（在黑名单中）: ${model}`);
        return false;
      }

      // 白名单检查
      if (!this.isModelAllowed(model)) {
        console.log(`🚫 过滤掉模型（不在白名单中）: ${model}`);
        return false;
      }

      return true;
    });
  }

  /**
   * 获取优先使用的测试模型列表
   * @return {string[]} 按优先级排序的测试模型列表
   */
  getPreferredTestModels() {
    return this.preferredTestModels;
  }

  /**
   * 从可用模型中选择最佳的测试模型
   * @param {string[]} availableModels 可用模型列表
   * @param {string} channelType 渠道类型（可选，用于后续扩展）
   * @return {string} 选中的测试模型
   */
  selectTestModel(availableModels, channelType = "openai") {
    if (!availableModels || availableModels.length === 0) {
      // 如果没有可用模型，根据渠道类型返回默认模型
      const defaultModels = {
        openai: "gpt-4o-mini",
        anthropic: "claude-3-haiku",
        gemini: "gemini-2.5-flash",
      };

      const defaultModel = defaultModels[channelType] || "gpt-4o-mini";
      console.log(`⚠️ 未提供可用模型列表，使用默认测试模型: ${defaultModel}`);
      return defaultModel;
    }

    // 将可用模型转换为小写以便比较
    const availableModelsLower = availableModels.map((model) =>
      model.toLowerCase()
    );

    // 优先从小模型列表中选择
    for (const preferredModel of this.preferredTestModels) {
      const preferredLower = preferredModel.toLowerCase();

      // 精确匹配
      const exactMatch = availableModels.find(
        (model) => model.toLowerCase() === preferredLower
      );
      if (exactMatch) {
        console.log(`✅ 选择优先小模型作为测试模型: ${exactMatch}`);
        return exactMatch;
      }

      // 模糊匹配（包含关系）
      const fuzzyMatch = availableModels.find((model) => {
        const modelLower = model.toLowerCase();
        // 检查是否包含小模型的关键部分
        const preferredParts = preferredLower.split("-");
        return preferredParts.every((part) => modelLower.includes(part));
      });
      if (fuzzyMatch) {
        console.log(
          `✅ 选择匹配的小模型作为测试模型: ${fuzzyMatch} (匹配 ${preferredModel})`
        );
        return fuzzyMatch;
      }
    }

    // 如果小模型列表中没有匹配的，选择第一个可用模型
    const fallbackModel = availableModels[0];
    console.log(
      `⚠️ 小模型列表中无匹配模型，使用第一个可用模型作为测试模型: ${fallbackModel}`
    );
    return fallbackModel;
  }

  /**
   * 获取所有配置信息（用于调试）
   * @return {Object} 完整配置
   */
  getAllConfig() {
    return {
      allowedPrefixes: this.allowedPrefixes,
      blacklistedKeywords: this.blacklistedKeywords,
      highCostModelPatterns: this.highCostModelPatterns,
      preferredTestModels: this.preferredTestModels,
    };
  }

  /**
   * 添加白名单前缀
   * @param {string} prefix 前缀
   */
  addAllowedPrefix(prefix) {
    if (!this.allowedPrefixes.includes(prefix)) {
      this.allowedPrefixes.push(prefix);
      console.log(`✅ 添加白名单前缀: ${prefix}`);
    }
  }

  /**
   * 移除白名单前缀
   * @param {string} prefix 前缀
   */
  removeAllowedPrefix(prefix) {
    const index = this.allowedPrefixes.indexOf(prefix);
    if (index > -1) {
      this.allowedPrefixes.splice(index, 1);
      console.log(`❌ 移除白名单前缀: ${prefix}`);
    }
  }

  /**
   * 添加黑名单关键词
   * @param {string} keyword 关键词
   */
  addBlacklistedKeyword(keyword) {
    if (!this.blacklistedKeywords.includes(keyword)) {
      this.blacklistedKeywords.push(keyword);
      console.log(`✅ 添加黑名单关键词: ${keyword}`);
    }
  }

  /**
   * 移除黑名单关键词
   * @param {string} keyword 关键词
   */
  removeBlacklistedKeyword(keyword) {
    const index = this.blacklistedKeywords.indexOf(keyword);
    if (index > -1) {
      this.blacklistedKeywords.splice(index, 1);
      console.log(`❌ 移除黑名单关键词: ${keyword}`);
    }
  }

  /**
   * 添加高消耗模型模式
   * @param {string} pattern 模式
   */
  addHighCostPattern(pattern) {
    if (!this.highCostModelPatterns.includes(pattern)) {
      this.highCostModelPatterns.push(pattern);
      console.log(`✅ 添加高消耗模型模式: ${pattern}`);
    }
  }

  /**
   * 移除高消耗模型模式
   * @param {string} pattern 模式
   */
  removeHighCostPattern(pattern) {
    const index = this.highCostModelPatterns.indexOf(pattern);
    if (index > -1) {
      this.highCostModelPatterns.splice(index, 1);
      console.log(`❌ 移除高消耗模型模式: ${pattern}`);
    }
  }
}

// 导出单例实例
module.exports = new ModelConfig();
