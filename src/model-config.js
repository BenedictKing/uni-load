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

    // 模型黑名单关键词（不区分大小写），包含这些词的模型将被过滤
    this.blacklistedKeywords = [
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

    // gptload 配置
    this.gptloadConfig = {
      // 站点分组（渠道分组）配置
      siteGroup: {
        blacklist_threshold: 99, // 站点分组黑名单阈值
        sort: 20, // 站点分组排序号
      },
      
      // 模型分组配置
      modelGroup: {
        blacklist_threshold: 0, // 模型分组黑名单阈值（立即加入黑名单）
        sort: 10, // 模型分组排序号（默认）
      },
    };
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
      const withoutProvider = name.split('/').pop() || name;
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
   * 获取站点分组的 gptload 配置
   * @return {Object} 站点分组配置
   */
  getSiteGroupConfig() {
    return this.gptloadConfig.siteGroup;
  }

  /**
   * 获取模型分组的 gptload 配置
   * @return {Object} 模型分组配置
   */
  getModelGroupConfig() {
    return this.gptloadConfig.modelGroup;
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
      gptloadConfig: this.gptloadConfig,
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