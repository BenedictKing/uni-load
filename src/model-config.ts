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
  private allowedPrefixes: string[]
  private blacklistedKeywords: string[]
  private highCostModelPatterns: string[]
  private preferredTestModels: string[]

  constructor() {
    // 模型白名单前缀（不区分大小写）
    this.allowedPrefixes = [
      // OpenAI
      'gpt-',
      'chatgpt-',
      'openai-gpt-',

      // Google
      'gemini-2.5-', // 仅支持 2.5 及以上版本
      // 'gemma-',

      // Anthropic
      'claude-opus',
      'claude-sonnet',
      'claude-3-5',
      'claude-3-7',
      'claude-4',

      // DeepSeek
      'deepseek-',

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
      'kimi-k2',

      // Doubao (ByteDance)
      // 'doubao-1-6-',
      // 'doubao-seed-',

      // Zhipu AI (智谱)
      'glm-4.5',

      // xAI
      'grok-3',
      'grok-4',

      // Flux
      // "flux-",

      // Misc / Provider Specific
      // "o1",
      // "o3",
      // "o4",

      // vercel v0
      'v0-',

      // MiniMax
      // "minimax-",
    ]

    // 初始化黑名单关键词
    this.blacklistedKeywords = [
      'vision',
      'image', 
      'dalle',
      'tts',
      'whisper',
      'deprecated',
      'test',
      'embedding',
    ]

    // 初始化高消耗模型模式
    this.highCostModelPatterns = [
      'gpt-4', // 所有gpt-4系列
      'claude-opus', // Opus系列  
      'gemini-pro', // Pro系列
      'grok-', // Grok系列
    ]

    // 初始化优先测试模型列表（按成本和速度排序）
    this.preferredTestModels = [
      'gpt-4o-mini',
      'claude-3-haiku', 
      'gemini-2.5-flash',
      'deepseek-chat',
      'gpt-3.5-turbo',
    ]
  }

  /**
   * 获取模型分组的特定配置
   * @returns {{blacklist_threshold: number}}
   */
  getModelGroupConfig() {
    return {
      // 模型分组使用低黑名单阈值，以便快速响应问题
      blacklist_threshold: 0,
    }
  }

  /**
   * 检查模型是否在白名单中
   * @param {string} modelName 模型名称
   * @return {boolean} 是否在白名单中
   */
  isModelAllowed(modelName) {
    if (!modelName) return false

    const name = modelName.toLowerCase()

    return this.allowedPrefixes.some((prefix) => {
      // 首先尝试匹配完整名称（例如 "deepseek-ai/..."）
      if (name.startsWith(prefix.toLowerCase())) {
        return true
      }

      // 然后尝试匹配去掉提供商前缀的名称
      const withoutProvider = name.split('/').pop() || name
      return withoutProvider.startsWith(prefix.toLowerCase())
    })
  }

  /**
   * 检查模型是否在黑名单中
   * @param {string} modelName 模型名称
   * @return {boolean} 是否在黑名单中
   */
  isModelBlacklisted(modelName) {
    if (!modelName) return false

    const name = modelName.toLowerCase()

    return this.blacklistedKeywords.some((keyword) => name.includes(keyword.toLowerCase()))
  }

  /**
   * 检查模型是否为高消耗模型
   * @param {string} modelName 模型名称
   * @return {boolean} 是否为高消耗模型
   */
  isHighCostModel(modelName) {
    if (!modelName) return false

    const modelNameLower = modelName.toLowerCase()

    // 检查是否包含任何高消耗模型模式
    return this.highCostModelPatterns.some((pattern) => {
      return modelNameLower.includes(pattern.toLowerCase())
    })
  }

  /**
   * 过滤模型列表，返回符合条件的模型
   * @param {string[]} models 模型列表
   * @return {string[]} 过滤后的模型列表
   */
  filterModels(models: string[]): string[] {
    return models.filter((model) => {
      // 黑名单检查：如果模型名称包含任何黑名单关键词，则过滤掉
      if (this.isModelBlacklisted(model)) {
        console.log(`🚫 过滤掉模型（在黑名单中）: ${model}`)
        return false
      }

      // 白名单检查
      if (!this.isModelAllowed(model)) {
        console.log(`🚫 过滤掉模型（不在白名单中）: ${model}`)
        return false
      }

      return true
    })
  }

  /**
   * 获取优先使用的测试模型列表
   * @return {string[]} 按优先级排序的测试模型列表
   */
  getPreferredTestModels() {
    return this.preferredTestModels
  }

  /**
   * 从可用模型中选择最佳的测试模型
   * @param {string[]} availableModels 可用模型列表
   * @param {string} channelType 渠道类型（可选，用于后续扩展）
   * @return {string} 选中的测试模型
   */
  selectTestModel(availableModels, channelType = 'openai') {
    if (!availableModels || availableModels.length === 0) {
      // 如果没有可用模型，根据渠道类型返回默认模型
      const defaultModels = {
        openai: 'gpt-4o-mini',
        anthropic: 'claude-3-haiku',
        gemini: 'gemini-2.5-flash',
      }

      const defaultModel = defaultModels[channelType] || 'gpt-4o-mini'
      console.log(`⚠️ 未提供可用模型列表，使用默认测试模型: ${defaultModel}`)
      return defaultModel
    }

    // 新增：首先根据渠道类型筛选可用模型
    const channelCompatibleModels = availableModels.filter((model) => {
      const modelLower = model.toLowerCase()
      if (channelType === 'anthropic') return modelLower.startsWith('claude-')
      if (channelType === 'gemini') return modelLower.startsWith('gemini-')
      // openai 格式可以接受任何模型，但优先排除专有格式以避免混淆
      if (channelType === 'openai') {
        return !modelLower.startsWith('claude-') && !modelLower.startsWith('gemini-')
      }
      return true
    })

    // 如果特定格式没有兼容模型，但渠道是openai，则允许使用所有模型
    const modelsToSearch =
      channelCompatibleModels.length > 0 ? channelCompatibleModels : channelType === 'openai' ? availableModels : []

    if (modelsToSearch.length === 0) {
      // 如果真的没有任何模型可选，返回一个最通用的默认值
      console.log(`⚠️ 渠道类型 ${channelType} 没有找到任何兼容的测试模型，返回默认值 gpt-4o-mini`)
      return 'gpt-4o-mini'
    }

    // 优先从小模型列表中选择
    for (const preferredModel of this.preferredTestModels) {
      const preferredLower = preferredModel.toLowerCase()

      // 1. 精确匹配 (忽略大小写)
      const exactMatch = modelsToSearch.find((model) => model.toLowerCase() === preferredLower)
      if (exactMatch) {
        console.log(`✅ 选择优先小模型作为测试模型 (精确匹配): ${exactMatch}`)
        return exactMatch
      }

      // 2. 包含匹配 (处理 "org/model-name-version" 等情况)
      const partialMatch = modelsToSearch.find((model) => model.toLowerCase().includes(preferredLower))
      if (partialMatch) {
        console.log(`✅ 选择优先小模型作为测试模型 (包含匹配): ${partialMatch}`)
        return partialMatch
      }
    }

    // 3. 如果优先列表没有匹配，则根据关键词在剩余模型中寻找小模型
    const smallModelKeywords = ['mini', 'flash', 'haiku', 'nano', 'core', 'lite', 'air', 'lightning']
    for (const keyword of smallModelKeywords) {
      const keywordMatch = modelsToSearch.find((model) => model.toLowerCase().includes(keyword))
      if (keywordMatch) {
        console.log(`✅ 未在优先列表找到匹配，但根据关键词 '${keyword}' 选择了小模型: ${keywordMatch}`)
        return keywordMatch
      }
    }

    // 4. 最终回退策略：选择名称最短的模型，通常是基础或小型号
    const fallbackModel = [...modelsToSearch].sort((a, b) => a.length - b.length)[0]
    console.log(`⚠️ 优先列表和关键词均无匹配，回退选择名称最短的模型: ${fallbackModel}`)
    return fallbackModel
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
    }
  }

  /**
   * 添加白名单前缀
   * @param {string} prefix 前缀
   */
  addAllowedPrefix(prefix) {
    if (!this.allowedPrefixes.includes(prefix)) {
      this.allowedPrefixes.push(prefix)
      console.log(`✅ 添加白名单前缀: ${prefix}`)
    }
  }

  /**
   * 移除白名单前缀
   * @param {string} prefix 前缀
   */
  removeAllowedPrefix(prefix) {
    const index = this.allowedPrefixes.indexOf(prefix)
    if (index > -1) {
      this.allowedPrefixes.splice(index, 1)
      console.log(`❌ 移除白名单前缀: ${prefix}`)
    }
  }

  /**
   * 添加黑名单关键词
   * @param {string} keyword 关键词
   */
  addBlacklistedKeyword(keyword) {
    if (!this.blacklistedKeywords.includes(keyword)) {
      this.blacklistedKeywords.push(keyword)
      console.log(`✅ 添加黑名单关键词: ${keyword}`)
    }
  }

  /**
   * 移除黑名单关键词
   * @param {string} keyword 关键词
   */
  removeBlacklistedKeyword(keyword) {
    const index = this.blacklistedKeywords.indexOf(keyword)
    if (index > -1) {
      this.blacklistedKeywords.splice(index, 1)
      console.log(`❌ 移除黑名单关键词: ${keyword}`)
    }
  }

  /**
   * 添加高消耗模型模式
   * @param {string} pattern 模式
   */
  addHighCostPattern(pattern) {
    if (!this.highCostModelPatterns.includes(pattern)) {
      this.highCostModelPatterns.push(pattern)
      console.log(`✅ 添加高消耗模型模式: ${pattern}`)
    }
  }

  /**
   * 移除高消耗模型模式
   * @param {string} pattern 模式
   */
  removeHighCostPattern(pattern) {
    const index = this.highCostModelPatterns.indexOf(pattern)
    if (index > -1) {
      this.highCostModelPatterns.splice(index, 1)
      console.log(`❌ 移除高消耗模型模式: ${pattern}`)
    }
  }

  /**
   * 统一的模型名称标准化方法
   * 处理各种模型名称格式，生成一致的标准化名称
   * @param {string} modelName 原始模型名称
   * @return {string} 标准化后的模型名称
   */
  static normalizeModelName(modelName) {
    if (!modelName) return ''

    let normalized = modelName

    // 1. 处理组织名前缀（如 deepseek-ai/DeepSeek-V3 -> DeepSeek-V3）
    if (normalized.includes('/')) {
      const parts = normalized.split('/')
      normalized = parts[parts.length - 1] // 取最后一部分
    }

    // 2. 转换为小写并进行特定前缀替换
    normalized = normalized.toLowerCase()
    if (normalized.startsWith('openai-gpt-')) {
      normalized = normalized.replace(/^openai-gpt-/, 'gpt-')
    }

    // 3. 移除版本和状态后缀
    normalized = normalized
      .replace(/-latest$/g, '') // 移除 -latest 后缀
      .replace(/-preview$/g, '') // 移除 -preview 后缀
      .replace(/-alpha$/g, '') // 移除 -alpha 后缀
      .replace(/-beta$/g, '') // 移除 -beta 后缀
      .replace(/-rc\d*$/g, '') // 移除 -rc 后缀
      .replace(/-instruct$/g, '') // 移除 -instruct 后缀

    // 4. 通用日期格式简化
    // 移除各种日期格式：YYYYMMDD, YYYY-MM-DD, YYMMDD等
    normalized = normalized
      .replace(/-\d{8}-?/g, '-') // 移除 -20241022 和 -20241022- 格式
      .replace(/-\d{4}-\d{2}-\d{2}-?/g, '-') // 移除 -2024-10-22 和 -2024-10-22- 格式
      .replace(/-\d{6}-?/g, '-') // 移除 -241022 和 -250711- 格式
      .replace(/-\d{4}-?/g, '-') // 移除 -0324 和 -0324- 格式
      .replace(/-\d{2}-\d{2}-?/g, '-') // 移除 -10-22 和 -10-22- 格式

    // 5. 再次移除版本和状态后缀
    normalized = normalized
      .replace(/-latest$/g, '') // 移除 -latest 后缀
      .replace(/-preview$/g, '') // 移除 -preview 后缀
      .replace(/-alpha$/g, '') // 移除 -alpha 后缀
      .replace(/-beta$/g, '') // 移除 -beta 后缀
      .replace(/-rc\d*$/g, '') // 移除 -rc 后缀
      .replace(/-instruct$/g, '') // 移除 -instruct 后缀

    normalized = normalized.replace(/-{2,}/g, '-')
    return normalized
  }

  /**
   * 为gpt-load生成安全的分组名称
   * 处理URL不安全字符，符合gpt-load命名规范
   * @param {string} modelName 模型名称
   * @return {string} URL安全的分组名称
   */
  static generateSafeGroupName(modelName) {
    if (!modelName) return ''

    // 首先进行基本的标准化
    let safeName = modelName

    // 1. 处理斜杠（URL不安全字符）
    safeName = safeName.replace(/\//g, '-')

    // 2. 转换为小写
    safeName = safeName.toLowerCase()

    // 3. 移除或替换其他不安全字符 (移除对 '.' 的允许)
    safeName = safeName
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-') // 合并多个连字符
      .replace(/^-+|-+$/g, '') // 移除开头和结尾的连字符

    // 4. 确保长度合理（更新为100字符限制）
    if (safeName.length > 100) {
      safeName = safeName.substring(0, 100).replace(/-+$/, '')
    }

    return safeName
  }

  /**
   * 生成模型-渠道组合的分组名称
   * @param {string} modelName 模型名称
   * @param {string} channelName 渠道名称
   * @return {string} 组合分组名称
   */
  static generateModelChannelGroupName(modelName, channelName) {
    const safeModel = this.generateSafeGroupName(modelName)
    const safeChannel = this.generateSafeGroupName(channelName)
    let combinedName = `${safeModel}-via-${safeChannel}`.toLowerCase()

    // 再次确保最终组合的名称长度不超过100
    if (combinedName.length > 100) {
      combinedName = combinedName.substring(0, 100).replace(/-+$/, '')
    }

    return combinedName
  }

  /**
   * 生成聚合分组的key
   * @param {string} modelName 模型名称
   * @return {string} 聚合分组key
   */
  static generateAggregateKey(modelName) {
    const safeName = this.generateSafeGroupName(modelName)
    return `key-aggregate-${safeName}`.replace(/[^a-zA-Z0-9-]/g, '-')
  }

  /**
   * 处理uni-api配置中的模型名称
   * 包含重定向处理和别名映射
   * @param {string} originalModel 原始模型名称
   * @return {{normalizedModel: string, originalModel: string, withoutOrgModel: string}} 处理结果
   */
  static normalizeForUniApi(originalModel) {
    if (!originalModel) return { normalizedModel: '', originalModel: '', withoutOrgModel: '' }

    let withoutOrgModel = originalModel
    let normalizedModel = originalModel

    // 1. 处理组织名前缀（如 deepseek-ai/DeepSeek-V3 -> DeepSeek-V3）
    if (originalModel.includes('/')) {
      const parts = originalModel.split('/')
      withoutOrgModel = parts[parts.length - 1] // 取最后一部分
    }

    // 2. 进一步标准化处理（小写化等）
    normalizedModel = this.normalizeModelName(withoutOrgModel)

    // 3. 应用uni-api的重命名规则
    normalizedModel = this.generateSafeGroupName(normalizedModel)

    return {
      normalizedModel,
      originalModel,
      withoutOrgModel,
    }
  }

  /**
   * 验证模型名称是否符合命名规范
   * @param {string} modelName 模型名称
   * @return {{valid: boolean, issues: string[]}} 验证结果
   */
  static validateModelName(modelName) {
    const issues = []

    if (!modelName) {
      issues.push('模型名称不能为空')
      return { valid: false, issues }
    }

    // 检查长度
    if (modelName.length > 100) {
      issues.push('模型名称过长（超过100字符）')
    }

    // 检查是否包含危险字符
    if (/[<>:"\\|?*]/.test(modelName)) {
      issues.push('模型名称包含危险字符')
    }

    // 检查是否全为特殊字符
    if (!/[a-zA-Z0-9]/.test(modelName)) {
      issues.push('模型名称必须包含字母或数字')
    }

    return { valid: issues.length === 0, issues }
  }
}

// 导出单例实例
export default new ModelConfig()
