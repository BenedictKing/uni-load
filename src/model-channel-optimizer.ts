/**
 * 模型渠道优化器
 *
 * 充分利用 gptload 和 uni-api 的原生能力，实现模型级别的智能路由和管理
 *
 * 核心理念：
 * 1. 利用 gptload 的分组管理实现自动负载均衡
 * 2. 利用 gptload 的黑名单机制实现自动故障隔离
 * 3. 利用 gptload 的统计 API 进行智能决策
 * 4. 利用 uni-api 的多渠道配置实现冗余
 */

const gptloadService = require('./gptload')
const modelConfig = require('./model-config')

class ModelChannelOptimizer {
  private modelGroupMapping: Map<string, any[]>
  private groupMetricsCache: Map<string, any>
  private optimizationInterval: number
  private _previousScores: Map<any, any>

  constructor() {
    // 模型到分组的映射
    this.modelGroupMapping = new Map()

    // 分组性能指标缓存
    this.groupMetricsCache = new Map()

    // 优化间隔
    this.optimizationInterval = 5 * 60 * 1000 // 5分钟

    // 添加缺失的属性
    this._previousScores = new Map()
  }

  /**
   * 初始化优化器
   */
  async initialize() {
    console.log('🚀 初始化模型渠道优化器...')

    try {
      // 1. 加载现有的分组映射
      await this.loadGroupMappings()
      console.log(`📊 已加载 ${this.modelGroupMapping.size} 个模型的分组映射`)

      // 2. 执行初始健康检查
      console.log('🩺 执行初始健康检查...')
      let healthyModelCount = 0
      let totalModelCount = this.modelGroupMapping.size

      for (const [model] of this.modelGroupMapping) {
        try {
          const healthReport = await this.intelligentHealthCheck(model)
          if ('overall_status' in healthReport) {
            if (healthReport.overall_status === 'healthy') {
              healthyModelCount++
            }

            // 如果发现严重问题，立即优化
            if (healthReport.overall_status === 'critical') {
              console.log(`🚨 模型 ${model} 状态危急，立即优化...`)
              const groups = this.modelGroupMapping.get(model) || []
              await this.optimizeModelGroups(model, groups)
            }
          }
        } catch (error) {
          console.error(`检查模型 ${model} 健康状态失败:`, error.message)
        }
      }

      console.log(`📊 初始健康检查完成: ${healthyModelCount}/${totalModelCount} 个模型健康`)

      // 3. 启动定期优化和事件监听
      this.startOptimization()

      // 4. 记录初始化完成状态
      console.log('✅ 模型渠道优化器初始化完成')
      console.log(`🎯 监控 ${totalModelCount} 个模型，${this.getTotalGroupCount()} 个分组`)
    } catch (error) {
      console.error('❌ 模型渠道优化器初始化失败:', error.message)
      throw error
    }
  }

  /**
   * 获取总分组数量
   */
  getTotalGroupCount() {
    let totalGroups = 0
    for (const groups of this.modelGroupMapping.values()) {
      totalGroups += groups.length
    }
    return totalGroups
  }

  /**
   * 加载分组映射关系
   */
  async loadGroupMappings() {
    try {
      const allGroups = await gptloadService.getAllGroups()

      // 分析每个分组支持的模型
      for (const group of allGroups) {
        // 跳过站点分组（sort=20）
        if (group.sort === 20) continue

        // 从分组名称推断支持的模型
        const models = this.extractModelsFromGroup(group)

        for (const model of models) {
          if (!this.modelGroupMapping.has(model)) {
            this.modelGroupMapping.set(model, [])
          }

          this.modelGroupMapping.get(model).push({
            groupId: group.id,
            groupName: group.name,
            instanceId: group._instance?.id,
            upstreams: group.upstreams,
            priority: group.sort || 10,
            status: group.status || 'enabled',
          })
        }
      }

      console.log(`📊 加载了 ${this.modelGroupMapping.size} 个模型的分组映射`)
    } catch (error) {
      console.error('加载分组映射失败:', error.message)
    }
  }

  /**
   * 从分组信息中提取支持的模型
   */
  extractModelsFromGroup(group) {
    const models = new Set()

    // 方法1：从分组名称提取（如 "gpt-4-turbo-group", "claude-3-5-sonnet"）
    const namePatterns = [
      // OpenAI 模型
      /(?:^|[^a-z])(gpt-4o?(?:-\w+)*)/i,
      /(?:^|[^a-z])(gpt-3\.?5(?:-\w+)*)/i,
      /(?:^|[^a-z])(chatgpt[\w-]*)/i,

      // Claude 模型
      /(?:^|[^a-z])(claude-(?:opus|sonnet|haiku)(?:-[\w-]*)?)/i,
      /(?:^|[^a-z])(claude-3(?:\.5)?(?:-\w+)*)/i,

      // DeepSeek 模型
      /(?:^|[^a-z])(deepseek(?:-[\w-]*)?)/i,

      // Qwen 模型
      /(?:^|[^a-z])(qwen(?:\d+)?(?:\.?\d+)?(?:-\w+)*)/i,

      // Gemini 模型
      /(?:^|[^a-z])(gemini-\d+(?:\.\d+)?(?:-\w+)*)/i,

      // 其他模型
      /(?:^|[^a-z])(llama-[\w-]+)/i,
      /(?:^|[^a-z])(mixtral-[\w-]+)/i,
      /(?:^|[^a-z])(mistral-[\w-]+)/i,
    ]

    for (const pattern of namePatterns) {
      const match = group.name.match(pattern)
      if (match) {
        models.add(match[1].toLowerCase())
      }
    }

    // 方法2：从分组的模型列表提取
    if (group.models && Array.isArray(group.models)) {
      group.models.forEach((model) => models.add(model.toLowerCase()))
    }

    // 方法3：从测试模型推断
    if (group.test_model) {
      models.add(group.test_model.toLowerCase())
    }

    // 方法4：从上游URL推断（如果指向特定模型的代理）
    if (group.upstreams && Array.isArray(group.upstreams)) {
      for (const upstream of group.upstreams) {
        if (upstream.url && upstream.url.includes('/proxy/')) {
          // 从代理URL中提取模型信息
          const proxyMatch = upstream.url.match(/\/proxy\/([\w-]+)/)
          if (proxyMatch) {
            // 这里可能是渠道名，需要进一步解析
            const channelName = proxyMatch[1]
            // 如果渠道名包含模型信息，提取之
            for (const pattern of namePatterns) {
              const modelMatch = channelName.match(pattern)
              if (modelMatch) {
                models.add(modelMatch[1].toLowerCase())
                break
              }
            }
          }
        }
      }
    }

    return Array.from(models)
  }

  /**
   * 为模型创建优化的分组配置
   *
   * 策略：
   * 1. 为每个模型创建多个分组，每个分组对应不同的渠道
   * 2. 设置合理的黑名单阈值（模型分组设为0，快速响应）
   * 3. 利用 gptload 的优先级机制实现智能切换
   */
  async createOptimizedModelGroups(model, channels) {
    console.log(`🔧 为模型 ${model} 创建优化的分组配置...`)

    const groups = []

    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i]

      // 生成分组名称：模型名-渠道名-随机后缀
      const groupName = `${model}-${channel.name}-${Date.now().toString(36)}`.toLowerCase()

      const groupData = {
        name: groupName,
        upstreams: [
          {
            url: channel.url,
            weight: Math.max(100 - i * 10, 10), // 递减权重，最低10
          },
        ],
        models: [model],
        test_model: model,
        sort: 10 + i, // 递增优先级（数字越小优先级越高）
        param_overrides: {},
        config: {
          // 模型分组使用低黑名单阈值，快速响应问题
          blacklist_threshold: modelConfig.getModelGroupConfig().blacklist_threshold || 0,
          // 启用自动验证
          auto_validate: true,
          // 验证间隔（秒）
          validation_interval: 300, // 5分钟
          // 失败后的冷却时间（秒）
          failure_cooldown: 60,
          // 最大重试次数
          max_retries: 3,
          // 超时设置（毫秒）
          timeout: 30000,
        },
        // 添加标签便于识别
        tags: ['auto-created', 'model-optimized', model, channel.type || 'unknown'],
        // 描述信息
        description: `自动创建的${model}模型分组，使用${channel.name}渠道`,
      }

      try {
        // 选择合适的 gptload 实例
        const instance = this.selectInstanceForChannel(channel)
        const response = await instance.apiClient.post('/groups', groupData)

        // 处理响应
        let createdGroup
        if (response.data && typeof response.data.code === 'number') {
          if (response.data.code === 0) {
            createdGroup = response.data.data
          } else {
            throw new Error(`创建失败: ${response.data.message}`)
          }
        } else {
          createdGroup = response.data
        }

        // 添加实例信息
        createdGroup._instance = { id: instance.id }

        groups.push(createdGroup)
        console.log(`✅ 创建分组 ${groupData.name} 成功 (ID: ${createdGroup.id})`)

        // 立即进行一次验证
        await this.validateSingleGroup(instance, createdGroup.id)
      } catch (error) {
        console.error(`❌ 创建分组 ${groupData.name} 失败:`, error.message)

        // 如果是因为重名，尝试生成新名称
        if (error.message && error.message.includes('already exists')) {
          console.log(`🔄 分组名冲突，尝试使用新名称...`)
          continue
        }
      }
    }

    console.log(`📊 为模型 ${model} 成功创建了 ${groups.length}/${channels.length} 个分组`)
    return groups
  }

  /**
   * 选择合适的 gptload 实例
   */
  selectInstanceForChannel(channel) {
    // 根据渠道类型或地区选择实例
    const instances = gptloadService.manager.getAllInstances()

    if (!instances || instances.length === 0) {
      throw new Error('没有可用的 gptload 实例')
    }

    // 简单策略：选择负载最轻的实例
    // 可以根据需要实现更复杂的选择逻辑
    let bestInstance = instances[0]

    for (const instance of instances) {
      // 这里可以添加负载检查逻辑
      // 暂时使用简单的轮询策略
      if (instance.name.includes('local')) {
        // 优先选择本地实例
        bestInstance = instance
        break
      }
    }

    return bestInstance
  }

  /**
   * 验证单个分组
   */
  async validateSingleGroup(instance, groupId) {
    try {
      await instance.apiClient.post('/keys/validate-group', {
        group_id: groupId,
      })
      console.log(`🔍 触发分组 ${groupId} 验证任务`)
    } catch (error) {
      // 409 表示验证任务已在运行，这是正常的
      if (error.response?.status === 409) {
        console.log(`ℹ️ 分组 ${groupId} 验证任务已在运行中`)
      } else {
        console.error(`触发分组 ${groupId} 验证失败:`, error.message)
      }
    }
  }

  /**
   * 为模型自动创建多渠道分组
   *
   * 这是主要的入口方法，会分析现有配置并创建缺失的分组
   */
  async ensureModelChannelGroups(model, requiredChannels = null) {
    console.log(`🎯 确保模型 ${model} 拥有足够的渠道分组...`)

    // 如果没有指定渠道，从站点分组中获取可用渠道
    if (!requiredChannels) {
      requiredChannels = await this.getAvailableChannelsForModel(model)
    }

    if (requiredChannels.length === 0) {
      console.log(`⚠️ 模型 ${model} 没有可用渠道`)
      return []
    }

    // 检查现有分组
    const existingGroups = this.modelGroupMapping.get(model) || []
    const existingChannelNames = new Set(existingGroups.map((g) => this.extractChannelNameFromGroup(g)))

    // 找出缺失的渠道
    const missingChannels = requiredChannels.filter((channel) => !existingChannelNames.has(channel.name))

    if (missingChannels.length === 0) {
      console.log(`✅ 模型 ${model} 已有完整的渠道分组配置`)
      return existingGroups
    }

    console.log(`🚧 模型 ${model} 缺少 ${missingChannels.length} 个渠道分组`)

    // 为缺失的渠道创建分组
    const newGroups = await this.createOptimizedModelGroups(model, missingChannels)

    // 更新映射
    if (newGroups.length > 0) {
      await this.loadGroupMappings() // 重新加载以包含新创建的分组
    }

    return [...existingGroups, ...newGroups]
  }

  /**
   * 从站点分组获取可用渠道列表
   */
  async getAvailableChannelsForModel(model) {
    try {
      const allGroups = await gptloadService.getAllGroups()
      const siteGroups = allGroups.filter((g) => g.sort === 20) // 站点分组

      const channels = []

      for (const siteGroup of siteGroups) {
        // 检查该站点分组是否支持这个模型
        if (await this.siteGroupSupportsModel(siteGroup, model)) {
          for (const upstream of siteGroup.upstreams || []) {
            channels.push({
              name: siteGroup.name,
              url: `${upstream.url.split('/').slice(0, 3).join('/')}/proxy/${siteGroup.name}`,
              type: this.inferChannelType(siteGroup.name),
              siteGroup: siteGroup.name,
              instance: siteGroup._instance?.id,
              priority: siteGroup.sort,
              status: siteGroup.status,
            })
          }
        }
      }

      console.log(`📋 模型 ${model} 可用渠道: ${channels.map((c) => c.name).join(', ')}`)
      return channels
    } catch (error) {
      console.error(`获取模型 ${model} 可用渠道失败:`, error.message)
      return []
    }
  }

  /**
   * 检查站点分组是否支持特定模型
   */
  async siteGroupSupportsModel(siteGroup, model) {
    // 方法1：检查分组的已验证模型列表（最精确）
    if (siteGroup.validated_models && Array.isArray(siteGroup.validated_models)) {
      const isValidated = siteGroup.validated_models.some(
        (validatedModel) => validatedModel.toLowerCase() === model.toLowerCase()
      )
      if (isValidated) {
        console.log(`✅ 模型 ${model} 在站点 ${siteGroup.name} 的已验证列表中`)
        return true
      }
    }

    // 方法2：检查分组名称是否包含模型信息
    if (siteGroup.name.toLowerCase().includes(model.toLowerCase())) {
      return true
    }

    // 方法3：检查测试模型
    if (siteGroup.test_model && siteGroup.test_model.toLowerCase() === model.toLowerCase()) {
      return true
    }

    // 方法4：基于模型提供商匹配（增强版）
    const modelProvider = this.getModelProvider(model)
    const channelProvider = this.getChannelProvider(siteGroup.name)

    if (modelProvider === channelProvider) {
      // 进一步检查模型格式兼容性
      const isCompatible = this.checkModelChannelCompatibility(model, siteGroup.channel_type)
      if (isCompatible) {
        console.log(`✅ 模型 ${model} 与站点 ${siteGroup.name} 提供商和格式兼容`)
        return true
      }
    }

    console.log(`❌ 模型 ${model} 与站点 ${siteGroup.name} 不兼容`)
    return false
  }

  /**
   * 检查模型与渠道格式的兼容性
   */
  checkModelChannelCompatibility(model, channelType) {
    const modelLower = model.toLowerCase()

    switch (channelType) {
      case 'anthropic':
        return modelLower.includes('claude')
      case 'gemini':
        return modelLower.includes('gemini')
      case 'openai':
      default:
        // OpenAI格式支持大多数模型
        return !modelLower.includes('claude') && !modelLower.includes('gemini')
    }
  }

  /**
   * 获取模型提供商
   */
  getModelProvider(model) {
    const modelLower = model.toLowerCase()

    if (modelLower.includes('gpt') || modelLower.includes('chatgpt')) return 'openai'
    if (modelLower.includes('claude')) return 'anthropic'
    if (modelLower.includes('gemini')) return 'google'
    if (modelLower.includes('deepseek')) return 'deepseek'
    if (modelLower.includes('qwen')) return 'alibaba'
    if (modelLower.includes('llama')) return 'meta'
    if (modelLower.includes('mistral') || modelLower.includes('mixtral')) return 'mistral'

    return 'unknown'
  }

  /**
   * 获取渠道提供商
   */
  getChannelProvider(channelName) {
    const nameLower = channelName.toLowerCase()

    if (nameLower.includes('openai') || nameLower.includes('gpt')) return 'openai'
    if (nameLower.includes('claude') || nameLower.includes('anthropic')) return 'anthropic'
    if (nameLower.includes('google') || nameLower.includes('gemini')) return 'google'
    if (nameLower.includes('deepseek')) return 'deepseek'
    if (nameLower.includes('qwen') || nameLower.includes('alibaba')) return 'alibaba'
    if (nameLower.includes('meta') || nameLower.includes('llama')) return 'meta'
    if (nameLower.includes('mistral')) return 'mistral'

    return 'unknown'
  }

  /**
   * 推断渠道类型
   */
  inferChannelType(channelName) {
    const nameLower = channelName.toLowerCase()

    if (nameLower.includes('official')) return 'official'
    if (nameLower.includes('proxy')) return 'proxy'
    if (nameLower.includes('api')) return 'api'
    if (nameLower.includes('azure')) return 'azure'

    return 'unknown'
  }

  /**
   * 从分组信息中提取渠道名称
   */
  extractChannelNameFromGroup(group) {
    // 从分组名称提取渠道部分
    // 例如: "gpt-4-openai-123456" -> "openai"
    const parts = group.groupName.split('-')
    if (parts.length >= 3) {
      // 移除模型名和时间戳部分
      return parts.slice(1, -1).join('-')
    }

    // 从上游URL提取
    if (group.upstreams && group.upstreams.length > 0) {
      const upstream = group.upstreams[0]
      const proxyMatch = upstream.url.match(/\/proxy\/([\w-]+)/)
      if (proxyMatch) {
        return proxyMatch[1]
      }
    }

    return 'unknown'
  }

  /**
   * 获取模型的最佳分组
   *
   * 利用 gptload 的统计 API 选择最佳分组
   */
  async getBestGroupForModel(model) {
    const groups = this.modelGroupMapping.get(model)
    if (!groups || groups.length === 0) {
      console.log(`⚠️ 模型 ${model} 没有可用分组`)
      return null
    }

    // 获取每个分组的实时统计
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        try {
          const stats = await this.getGroupStats(group.groupId, group.instanceId)
          return {
            ...group,
            stats,
            score: this.calculateGroupScore(stats),
          }
        } catch (error) {
          console.error(`获取分组 ${group.groupName} 统计失败:`, error.message)
          return {
            ...group,
            stats: null,
            score: -1,
          }
        }
      })
    )

    // 按分数排序，选择最佳分组
    groupsWithStats.sort((a, b) => b.score - a.score)

    const bestGroup = groupsWithStats[0]

    if (bestGroup.score > 0) {
      console.log(`🎯 为模型 ${model} 选择最佳分组: ${bestGroup.groupName} (分数: ${bestGroup.score})`)
      return bestGroup
    }

    console.log(`⚠️ 模型 ${model} 没有健康的分组`)
    return null
  }

  /**
   * 计算分组得分
   *
   * 基于 gptload 提供的统计信息计算
   * 使用更智能的评分算法
   */
  calculateGroupScore(stats) {
    if (!stats) return -1

    let score = 100
    let healthFactors = []

    // 1. 基于密钥状态评分（最重要，权重50%）
    if (stats.key_stats) {
      const { active_keys = 0, total_keys = 0, invalid_keys = 0 } = stats.key_stats

      if (total_keys === 0) {
        return 0 // 没有密钥直接返回0
      }

      const activeRatio = active_keys / total_keys
      const invalidRatio = invalid_keys / total_keys

      // 活跃密钥比例评分
      const keyScore = activeRatio * (1 - invalidRatio * 0.5)
      score *= keyScore

      healthFactors.push({
        factor: 'key_health',
        score: keyScore,
        details: { active_keys, total_keys, invalid_keys, ratio: activeRatio },
      })

      // 如果没有活跃密钥，直接返回0
      if (active_keys === 0) {
        return 0
      }
    }

    // 2. 基于小时统计评分（权重30%）
    if (stats.hourly_stats) {
      const { total_requests = 0, failed_requests = 0, failure_rate = 0 } = stats.hourly_stats

      if (total_requests > 0) {
        const successRate = 1 - failure_rate
        const hourlyWeight = Math.min(total_requests / 100, 1) // 请求量权重
        const hourlyScore = successRate * (0.7 + 0.3 * hourlyWeight)

        score *= 0.7 + 0.3 * hourlyScore // 30%权重

        healthFactors.push({
          factor: 'hourly_performance',
          score: hourlyScore,
          details: { total_requests, failed_requests, failure_rate, success_rate: successRate },
        })
      }
    }

    // 3. 基于日统计评分（权重20%）
    if (stats.daily_stats) {
      const { total_requests = 0, failure_rate = 0 } = stats.daily_stats

      if (total_requests > 0) {
        const dailySuccessRate = 1 - failure_rate
        const stabilityBonus = total_requests > 1000 ? 1.1 : 1.0 // 高请求量稳定性奖励
        const dailyScore = dailySuccessRate * stabilityBonus

        score *= 0.8 + 0.2 * Math.min(dailyScore, 1) // 20%权重

        healthFactors.push({
          factor: 'daily_stability',
          score: dailyScore,
          details: { total_requests, failure_rate, success_rate: dailySuccessRate },
        })
      }
    }

    // 4. 趋势分析（如果有周统计数据）
    if (stats.weekly_stats) {
      const { failure_rate: weeklyFailureRate = 0 } = stats.weekly_stats
      const weeklySuccessRate = 1 - weeklyFailureRate

      // 如果周数据比日数据差，可能在恶化
      if (stats.daily_stats && stats.daily_stats.failure_rate) {
        const dailyFailureRate = stats.daily_stats.failure_rate
        const trendFactor = dailyFailureRate <= weeklyFailureRate ? 1.05 : 0.95 // 趋势奖励/惩罚
        score *= trendFactor

        healthFactors.push({
          factor: 'trend_analysis',
          score: trendFactor,
          details: {
            weekly_failure_rate: weeklyFailureRate,
            daily_failure_rate: dailyFailureRate,
            trend: dailyFailureRate <= weeklyFailureRate ? 'improving' : 'degrading',
          },
        })
      }
    }

    // 5. 应用阈值和等级
    const finalScore = Math.max(0, Math.min(100, Math.round(score)))

    // 添加评分解释
    const scoreExplanation = {
      final_score: finalScore,
      health_level: this.getHealthLevel(finalScore),
      factors: healthFactors,
      recommendation: this.getScoreRecommendation(finalScore, healthFactors),
    }

    return { score: finalScore, explanation: scoreExplanation }
  }

  /**
   * 获取健康等级
   */
  getHealthLevel(score) {
    if (score >= 80) return 'excellent'
    if (score >= 60) return 'good'
    if (score >= 40) return 'fair'
    if (score >= 20) return 'poor'
    return 'critical'
  }

  /**
   * 获取评分建议
   */
  getScoreRecommendation(score, factors) {
    const recommendations = []

    if (score === 0) {
      recommendations.push('🚨 分组完全不可用，需要立即检查')
      return recommendations
    }

    // 检查各个因子并给出建议
    for (const factor of factors) {
      switch (factor.factor) {
        case 'key_health':
          if (factor.details.active_keys === 0) {
            recommendations.push('🔑 没有可用密钥，需要添加或修复密钥')
          } else if (factor.details.ratio < 0.5) {
            recommendations.push('🔑 可用密钥不足50%，建议检查失效密钥')
          }
          break

        case 'hourly_performance':
          if (factor.details.failure_rate > 0.2) {
            recommendations.push('⚠️ 小时失败率过高，检查服务稳定性')
          } else if (factor.details.total_requests < 10) {
            recommendations.push('📊 小时请求量较少，数据可能不够准确')
          }
          break

        case 'daily_stability':
          if (factor.details.failure_rate > 0.1) {
            recommendations.push('📈 日失败率偏高，需要关注稳定性')
          }
          break

        case 'trend_analysis':
          if (factor.details.trend === 'degrading') {
            recommendations.push('📉 性能趋势下降，建议主动维护')
          }
          break
      }
    }

    if (score >= 80) {
      recommendations.push('✅ 分组运行良好，继续保持')
    } else if (score >= 60) {
      recommendations.push('👍 分组运行正常，可考虑优化')
    } else if (score >= 40) {
      recommendations.push('⚠️ 分组需要改进，建议检查配置')
    } else {
      recommendations.push('🚨 分组存在严重问题，需要立即处理')
    }

    return recommendations
  }

  /**
   * 增强版获取分组统计信息
   */
  async getGroupStats(groupId, instanceId) {
    const cacheKey = `${instanceId}:${groupId}`
    const cached = this.groupMetricsCache.get(cacheKey)

    // 检查缓存（缓存时间缩短到30秒，保证数据新鲜）
    if (cached && cached.expiry > Date.now()) {
      return cached.data
    }

    try {
      const instance = gptloadService.manager.getInstance(instanceId)
      if (!instance) {
        throw new Error(`实例 ${instanceId} 不存在`)
      }

      // 并发获取多个统计信息
      const [statsResponse, groupResponse] = await Promise.allSettled([
        instance.apiClient.get(`/groups/${groupId}/stats`),
        instance.apiClient.get(`/groups/${groupId}`),
      ])

      let stats = null
      let groupInfo = null

      // 处理统计响应
      if (statsResponse.status === 'fulfilled') {
        const response = statsResponse.value
        if (response.data && typeof response.data.code === 'number') {
          stats = response.data.data
        } else {
          stats = response.data
        }
      }

      // 处理分组信息响应
      if (groupResponse.status === 'fulfilled') {
        const response = groupResponse.value
        if (response.data && typeof response.data.code === 'number') {
          groupInfo = response.data.data
        } else {
          groupInfo = response.data
        }
      }

      // 合并信息
      const combinedStats = {
        ...stats,
        group_info: groupInfo,
        last_updated: Date.now(),
      }

      // 缓存结果（30秒）
      this.groupMetricsCache.set(cacheKey, {
        data: combinedStats,
        expiry: Date.now() + 30000,
      })

      return combinedStats
    } catch (error) {
      console.error(`获取分组 ${groupId} 统计失败:`, error.message)

      // 返回默认的空统计，避免后续处理出错
      return {
        key_stats: { active_keys: 0, total_keys: 0, invalid_keys: 0 },
        hourly_stats: { total_requests: 0, failed_requests: 0, failure_rate: 1 },
        error: error.message,
        last_updated: Date.now(),
      }
    }
  }

  /**
   * 批量获取多个分组的统计信息
   */
  async getBatchGroupStats(groupIds, instanceId) {
    const promises = groupIds.map((groupId) =>
      this.getGroupStats(groupId, instanceId).catch((error) => ({
        groupId,
        error: error.message,
        stats: null,
      }))
    )

    const results = await Promise.all(promises)

    const successCount = results.filter((r) => r.stats || !r.error).length
    console.log(`📊 批量获取统计: ${successCount}/${groupIds.length} 成功`)

    return results
  }

  /**
   * 智能健康检查
   *
   * 根据统计数据智能决定是否需要进行实际验证
   */
  async intelligentHealthCheck(model) {
    console.log(`🧠 对模型 ${model} 进行智能健康检查...`)

    const groups = this.modelGroupMapping.get(model) || []
    if (groups.length === 0) {
      return { status: 'no_groups', message: '没有配置的分组' }
    }

    const healthResults = []
    let needsValidation = false

    for (const group of groups) {
      try {
        const stats = await this.getGroupStats(group.groupId, group.instanceId)
        const scoreResult = this.calculateGroupScore(stats)

        const healthResult = {
          groupId: group.groupId,
          groupName: group.groupName,
          score: typeof scoreResult === 'number' ? scoreResult : scoreResult.score,
          explanation: typeof scoreResult === 'object' ? scoreResult.explanation : null,
          stats: stats,
          needsAttention: false,
          recommendedAction: 'none',
        }

        // 判断是否需要关注
        if (healthResult.score === 0) {
          healthResult.needsAttention = true
          healthResult.recommendedAction = 'immediate_fix'
          needsValidation = true
        } else if (healthResult.score < 40) {
          healthResult.needsAttention = true
          healthResult.recommendedAction = 'investigate'
          needsValidation = true
        } else if (healthResult.score < 60) {
          healthResult.recommendedAction = 'monitor'
        }

        // 检查数据是否足够新鲜
        if (stats.hourly_stats && stats.hourly_stats.total_requests < 5) {
          // 请求量太少，统计数据不够可靠，需要验证
          healthResult.recommendedAction = 'validate'
          needsValidation = true
        }

        healthResults.push(healthResult)
      } catch (error) {
        console.error(`获取分组 ${group.groupName} 健康状态失败:`, error.message)
        healthResults.push({
          groupId: group.groupId,
          groupName: group.groupName,
          error: error.message,
          needsAttention: true,
          recommendedAction: 'validate',
        })
        needsValidation = true
      }
    }

    // 生成整体健康报告
    const healthyGroups = healthResults.filter((r) => r.score >= 60)
    const degradedGroups = healthResults.filter((r) => r.score >= 20 && r.score < 60)
    const criticalGroups = healthResults.filter((r) => r.score < 20 || r.error)

    let overallStatus = 'healthy'
    if (criticalGroups.length > 0) {
      overallStatus = 'critical'
    } else if (degradedGroups.length > healthyGroups.length) {
      overallStatus = 'degraded'
    } else if (healthyGroups.length === 0) {
      overallStatus = 'warning'
    }

    const report = {
      model,
      overall_status: overallStatus,
      groups: healthResults,
      summary: {
        total: groups.length,
        healthy: healthyGroups.length,
        degraded: degradedGroups.length,
        critical: criticalGroups.length,
      },
      needs_validation: needsValidation,
      timestamp: Date.now(),
    }

    console.log(
      `🎯 模型 ${model} 健康检查完成: ${report.summary.healthy}健康, ${report.summary.degraded}降级, ${report.summary.critical}危急`
    )

    return report
  }

  /**
   * 启动定期优化
   */
  startOptimization() {
    console.log('🔄 启动定期优化任务...')

    // 立即执行一次
    this.optimizeAllModels()

    // 设置定期优化
    const optimizationTimer = setInterval(() => {
      this.optimizeAllModels()
    }, this.optimizationInterval)

    // 设置定期监控
    this.setupPeriodicMonitoring()

    console.log(`✅ 定期优化已启动，间隔 ${this.optimizationInterval / 60000} 分钟`)

    // 存储定时器以便后续清理
    this._optimizationTimer = optimizationTimer
  }

  /**
   * 停止优化服务
   */
  stop() {
    // 清理所有定时器
    const timers = ['_optimizationTimer', '_healthCheckTimer', '_smartOptimizationTimer', '_statusChangeTimer']

    timers.forEach((timerName) => {
      if (this[timerName]) {
        clearInterval(this[timerName])
        this[timerName] = null
      }
    })

    // 清理缓存
    if (this._previousScores) {
      this._previousScores.clear()
      this._previousScores = null
    }

    console.log('🛑 模型渠道优化器已停止')
  }

  /**
   * 优化所有模型的分组配置
   *
   * 利用 gptload 的能力进行优化：
   * 1. 调整分组优先级
   * 2. 更新黑名单阈值
   * 3. 触发验证任务
   */
  async optimizeAllModels() {
    console.log('🔄 开始优化所有模型的分组配置...')

    for (const [model, groups] of this.modelGroupMapping) {
      await this.optimizeModelGroups(model, groups)
    }

    console.log('✅ 模型分组优化完成')
  }

  /**
   * 优化单个模型的分组
   *
   * 实现智能优先级调整机制：
   * 1. 基于性能指标动态调整优先级
   * 2. 考虑多维度评估（成功率、响应时间、稳定性）
   * 3. 实现渐进式调整避免激进变动
   */
  async optimizeModelGroups(model, groups) {
    console.log(`🎯 开始优化模型 ${model} 的 ${groups.length} 个分组...`)

    // 获取所有分组的统计和评分
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        try {
          const stats = await this.getGroupStats(group.groupId, group.instanceId)
          const scoreResult = this.calculateGroupScore(stats)

          return {
            ...group,
            stats,
            score: typeof scoreResult === 'number' ? scoreResult : scoreResult.score,
            explanation: typeof scoreResult === 'object' ? scoreResult.explanation : null,
          }
        } catch (error) {
          console.error(`获取分组 ${group.groupName} 统计失败:`, error.message)
          return {
            ...group,
            stats: null,
            score: 0,
            explanation: null,
          }
        }
      })
    )

    // 按当前优先级排序，以便进行相对调整
    groupsWithStats.sort((a, b) => a.priority - b.priority)

    let optimizationCount = 0
    let adjustments = []

    for (let i = 0; i < groupsWithStats.length; i++) {
      const group = groupsWithStats[i]

      if (!group.stats || group.score === undefined) {
        console.log(`⚠️ 跳过分组 ${group.groupName}: 无统计数据或评分`)
        continue
      }

      const updates = {}
      let adjustmentReason = []

      // 1. 基于评分进行调整
      const currentPriority = group.priority || 10
      let newPriority = currentPriority

      // 评分驱动的优先级调整
      if (group.score >= 80) {
        // 优秀表现：提高优先级（数字减小）
        const improvement = Math.max(1, Math.floor((group.score - 70) / 10))
        newPriority = Math.max(currentPriority - improvement, 1)
        if (newPriority !== currentPriority) {
          adjustmentReason.push(`优秀表现(评分${group.score})`)
        }
      } else if (group.score >= 60) {
        // 正常表现：轻微调整或保持
        if (currentPriority > 10) {
          newPriority = Math.max(currentPriority - 1, 10)
          adjustmentReason.push(`表现回升`)
        }
      } else if (group.score >= 40) {
        // 表现下降：降低优先级（数字增大）
        const degradation = Math.max(1, Math.floor((60 - group.score) / 10))
        newPriority = Math.min(currentPriority + degradation, 50)
        adjustmentReason.push(`表现下降(评分${group.score})`)
      } else if (group.score >= 20) {
        // 严重问题：大幅降低优先级
        newPriority = Math.min(currentPriority + 10, 80)
        adjustmentReason.push(`严重问题(评分${group.score})`)
      } else {
        // 关键问题：降到最低优先级
        newPriority = 99
        adjustmentReason.push(`关键问题(评分${group.score})`)
      }

      // 2. 基于具体指标进行微调
      if (group.stats.hourly_stats) {
        const hourlyStats = group.stats.hourly_stats

        // 失败率调整
        if (hourlyStats.failure_rate > 0.2) {
          newPriority = Math.min(newPriority + 3, 99)
          adjustmentReason.push(`高失败率${(hourlyStats.failure_rate * 100).toFixed(1)}%`)
        } else if (hourlyStats.failure_rate < 0.01 && hourlyStats.total_requests > 10) {
          newPriority = Math.max(newPriority - 1, 1)
          adjustmentReason.push(`低失败率${(hourlyStats.failure_rate * 100).toFixed(1)}%`)
        }

        // 请求量考虑
        if (hourlyStats.total_requests > 100) {
          // 高请求量且表现良好的分组获得优先级奖励
          if (hourlyStats.failure_rate < 0.05) {
            newPriority = Math.max(newPriority - 1, 1)
            adjustmentReason.push(`高请求量稳定`)
          }
        }
      }

      // 3. 密钥健康状态调整
      if (group.stats.key_stats) {
        const keyStats = group.stats.key_stats
        const activeRatio = keyStats.active_keys / (keyStats.total_keys || 1)

        if (keyStats.active_keys === 0) {
          newPriority = 99
          adjustmentReason.push('无可用密钥')
        } else if (activeRatio < 0.3) {
          newPriority = Math.min(newPriority + 5, 90)
          adjustmentReason.push(`可用密钥不足${(activeRatio * 100).toFixed(1)}%`)
        } else if (activeRatio > 0.8) {
          newPriority = Math.max(newPriority - 1, 1)
          adjustmentReason.push(`密钥健康${(activeRatio * 100).toFixed(1)}%`)
        }
      }

      // 4. 相对位置调整：避免同一模型的分组优先级过于接近
      if (i > 0) {
        const prevGroup = groupsWithStats[i - 1]
        if (Math.abs(newPriority - prevGroup.priority) < 2 && group.score < prevGroup.score) {
          newPriority = Math.min(newPriority + 2, 99)
          adjustmentReason.push('维持相对排序')
        }
      }

      // 5. 应用调整（限制单次调整幅度，避免激进变动）
      const maxAdjustment = 10
      const actualAdjustment =
        Math.sign(newPriority - currentPriority) * Math.min(Math.abs(newPriority - currentPriority), maxAdjustment)
      const finalPriority = currentPriority + actualAdjustment

      if (finalPriority !== currentPriority) {
        updates.sort = finalPriority

        const adjustment = {
          groupName: group.groupName,
          oldPriority: currentPriority,
          newPriority: finalPriority,
          score: group.score,
          reasons: adjustmentReason,
          change: finalPriority < currentPriority ? 'improved' : 'degraded',
        }
        adjustments.push(adjustment)

        console.log(
          `${finalPriority < currentPriority ? '📈' : '📉'} ${group.groupName}: ` +
            `优先级 ${currentPriority} -> ${finalPriority} ` +
            `(评分: ${group.score}, 原因: ${adjustmentReason.join(', ')})`
        )
      }

      // 6. 应用更新到 gptload
      if (Object.keys(updates).length > 0) {
        try {
          await gptloadService.updateGroup(group.groupId, group.instanceId, updates)
          group.priority = updates.sort || group.priority
          optimizationCount++

          // 记录详细的解释信息
          if (group.explanation && group.explanation.recommendation) {
            console.log(`💡 ${group.groupName} 建议: ${group.explanation.recommendation.join(', ')}`)
          }
        } catch (error) {
          console.error(`❌ 更新分组 ${group.groupName} 失败:`, error.message)

          // 移除失败的调整记录
          adjustments = adjustments.filter((adj) => adj.groupName !== group.groupName)
        }
      }
    }

    // 7. 生成优化摘要
    const summary = {
      model,
      totalGroups: groups.length,
      adjustedGroups: optimizationCount,
      improvements: adjustments.filter((adj) => adj.change === 'improved').length,
      degradations: adjustments.filter((adj) => adj.change === 'degraded').length,
      avgScore: groupsWithStats.reduce((sum, g) => sum + (g.score || 0), 0) / groupsWithStats.length,
      adjustments,
    }

    if (optimizationCount > 0) {
      console.log(
        `✅ 模型 ${model} 优化完成: 调整了 ${optimizationCount} 个分组 ` +
          `(${summary.improvements} 个提升, ${summary.degradations} 个降级)`
      )
      console.log(`📊 平均评分: ${summary.avgScore.toFixed(1)}`)
    } else {
      console.log(`ℹ️ 模型 ${model} 无需调整，分组配置已是最优`)
    }

    return summary
  }

  /**
   * 触发模型的验证任务
   *
   * 利用 gptload 的验证接口
   */
  async triggerModelValidation(model) {
    const groups = this.modelGroupMapping.get(model)
    if (!groups || groups.length === 0) return

    console.log(`🔍 触发模型 ${model} 的验证任务...`)

    for (const group of groups) {
      try {
        const instance = gptloadService.manager.getInstance(group.instanceId)
        if (!instance) continue

        // 调用 gptload 的验证接口
        await instance.apiClient.post('/keys/validate-group', {
          group_id: group.groupId,
        })

        console.log(`✅ 触发分组 ${group.groupName} 验证成功`)
      } catch (error) {
        // 409 表示验证任务已在运行，这是正常的
        if (error.response?.status !== 409) {
          console.error(`触发分组 ${group.groupName} 验证失败:`, error.message)
        }
      }
    }
  }

  /**
   * 获取模型的健康报告
   */
  async getModelHealthReport(model) {
    const groups = this.modelGroupMapping.get(model)
    if (!groups || groups.length === 0) {
      return {
        model,
        status: 'no_groups',
        message: '没有配置分组',
      }
    }

    const report = {
      model,
      groups: [],
      healthyGroups: 0,
      degradedGroups: 0,
      failedGroups: 0,
      recommendation: '',
    }

    for (const group of groups) {
      try {
        const stats = await this.getGroupStats(group.groupId, group.instanceId)
        const score = this.calculateGroupScore(stats)

        let status = 'healthy'
        if (score < 30) status = 'failed'
        else if (score < 70) status = 'degraded'

        report.groups.push({
          name: group.groupName,
          status,
          score,
          stats,
        })

        if (status === 'healthy') report.healthyGroups++
        else if (status === 'degraded') report.degradedGroups++
        else report.failedGroups++
      } catch (error) {
        report.groups.push({
          name: group.groupName,
          status: 'error',
          error: error.message,
        })
        report.failedGroups++
      }
    }

    // 生成建议
    if (report.healthyGroups === 0) {
      report.recommendation = '⚠️ 没有健康的分组，建议立即检查所有渠道'
      report.status = 'critical'
    } else if (report.healthyGroups < groups.length / 2) {
      report.recommendation = '📉 超过一半的分组不健康，建议增加备用渠道'
      report.status = 'warning'
    } else {
      report.recommendation = '✅ 模型运行状况良好'
      report.status = 'healthy'
    }

    return report
  }

  /**
   * 设置定期监控机制
   *
   * 由于 gptloadService 不支持事件监听，使用定期轮询机制
   * 实现近似事件驱动的自动化管理
   */
  setupPeriodicMonitoring() {
    console.log('🎧 设置模型渠道优化器定期监控...')

    // 主动健康检查（每10分钟）
    this._healthCheckTimer = setInterval(async () => {
      await this.performPeriodicHealthCheck()
    }, 10 * 60 * 1000)

    // 智能优化监控（每15分钟）
    this._smartOptimizationTimer = setInterval(async () => {
      await this.performSmartOptimization()
    }, 15 * 60 * 1000)

    // 健康状态变化检测（每2分钟）
    this._statusChangeTimer = setInterval(async () => {
      await this.detectHealthStatusChanges()
    }, 2 * 60 * 1000)

    console.log('✅ 定期监控设置完成')
  }

  /**
   * 执行智能优化
   */
  async performSmartOptimization() {
    console.log('🤖 执行智能优化...')

    try {
      let optimizationCount = 0

      for (const [model, groups] of this.modelGroupMapping) {
        try {
          // 获取模型的健康报告
          const healthReport = await this.intelligentHealthCheck(model)

          // 如果有问题或需要优化，执行优化
          if (healthReport.overall_status !== 'healthy' || healthReport.needs_validation) {
            const optimizationSummary = await this.optimizeModelGroups(model, groups)

            if (optimizationSummary.adjustedGroups > 0) {
              optimizationCount += optimizationSummary.adjustedGroups
              console.log(`📈 模型 ${model}: 调整了 ${optimizationSummary.adjustedGroups} 个分组`)
            }
          }
        } catch (error) {
          console.error(`优化模型 ${model} 失败:`, error.message)
        }
      }

      if (optimizationCount > 0) {
        console.log(`✅ 智能优化完成: 总共调整了 ${optimizationCount} 个分组`)
      }
    } catch (error) {
      console.error('智能优化失败:', error.message)
    }
  }

  /**
   * 检测健康状态变化
   */
  async detectHealthStatusChanges() {
    try {
      for (const [model, groups] of this.modelGroupMapping) {
        for (const group of groups) {
          try {
            const stats = await this.getGroupStats(group.groupId, group.instanceId)
            const scoreResult = this.calculateGroupScore(stats)
            const currentScore = typeof scoreResult === 'number' ? scoreResult : scoreResult.score

            // 检查是否有显著变化
            const previousScore = this._previousScores?.get(group.groupId) || currentScore
            const scoreDiff = Math.abs(currentScore - previousScore)

            if (scoreDiff >= 20) {
              // 健康状态有显著变化
              if (currentScore > previousScore) {
                console.log(`📈 分组 ${group.groupName} 健康状态改善: ${previousScore} -> ${currentScore}`)
                await this.handleGroupImproved(model, group, currentScore, previousScore)
              } else {
                console.log(`📉 分组 ${group.groupName} 健康状态下降: ${previousScore} -> ${currentScore}`)
                await this.handleGroupDegraded(model, group, currentScore, previousScore)
              }
            }

            // 保存当前评分
            if (!this._previousScores) {
              this._previousScores = new Map()
            }
            this._previousScores.set(group.groupId, currentScore)
          } catch (error) {
            console.error(`检测分组 ${group.groupName} 状态变化失败:`, error.message)
          }
        }
      }
    } catch (error) {
      console.error('检测健康状态变化失败:', error.message)
    }
  }

  /**
   * 处理分组改善事件
   */
  async handleGroupImproved(model, group, currentScore, previousScore) {
    try {
      // 如果分组改善了，提升其优先级
      const currentPriority = group.priority || 10
      const improvement = Math.floor((currentScore - previousScore) / 20)
      const newPriority = Math.max(currentPriority - improvement, 1)

      if (newPriority !== currentPriority) {
        await gptloadService.updateGroup(group.groupId, group.instanceId, {
          sort: newPriority,
        })
        console.log(`⬆️ 提升改善分组 ${group.groupName} 优先级: ${currentPriority} -> ${newPriority}`)
      }

      // 发送改善通知
      this.sendAlert('group_improved', {
        model,
        groupName: group.groupName,
        previousScore,
        currentScore,
        priorityChange: currentPriority !== newPriority ? `${currentPriority} -> ${newPriority}` : 'unchanged',
      })
    } catch (error) {
      console.error(`处理分组改善事件失败:`, error.message)
    }
  }

  /**
   * 处理分组降级事件
   */
  async handleGroupDegraded(model, group, currentScore, previousScore) {
    try {
      // 如果分组降级了，降低其优先级
      const currentPriority = group.priority || 10
      const degradation = Math.floor((previousScore - currentScore) / 20)
      const newPriority = Math.min(currentPriority + degradation, 99)

      if (newPriority !== currentPriority) {
        await gptloadService.updateGroup(group.groupId, group.instanceId, {
          sort: newPriority,
        })
        console.log(`⬇️ 降低降级分组 ${group.groupName} 优先级: ${currentPriority} -> ${newPriority}`)
      }

      // 如果降级严重，触发其他分组的验证
      if (currentScore < 40) {
        console.log(`⚠️ 分组 ${group.groupName} 严重降级，触发模型 ${model} 的验证`)
        await this.triggerModelValidation(model)
      }

      // 发送降级警告
      this.sendAlert('group_degraded', {
        model,
        groupName: group.groupName,
        previousScore,
        currentScore,
        priorityChange: currentPriority !== newPriority ? `${currentPriority} -> ${newPriority}` : 'unchanged',
        severity: currentScore < 40 ? 'critical' : currentScore < 60 ? 'warning' : 'minor',
      })
    } catch (error) {
      console.error(`处理分组降级事件失败:`, error.message)
    }
  }

  /**
   * 执行定期健康检查
   */
  async performPeriodicHealthCheck() {
    console.log('🔄 执行定期健康检查...')

    try {
      let totalModels = 0
      let healthyModels = 0
      let problematicModels = []

      for (const [model] of this.modelGroupMapping) {
        totalModels++

        const healthReport = await this.intelligentHealthCheck(model)

        if (healthReport.overall_status === 'healthy') {
          healthyModels++
        } else if (healthReport.overall_status === 'critical') {
          problematicModels.push({
            model,
            status: healthReport.overall_status,
            criticalGroups: healthReport.summary.critical,
          })

          // 对有问题的模型立即进行优化
          const groups = this.modelGroupMapping.get(model) || []
          await this.optimizeModelGroups(model, groups)
        }
      }

      console.log(`📊 定期检查完成: ${healthyModels}/${totalModels} 个模型健康`)

      if (problematicModels.length > 0) {
        console.log(`⚠️ 发现 ${problematicModels.length} 个问题模型`)
        problematicModels.forEach(({ model, criticalGroups }) => {
          console.log(`  - ${model}: ${criticalGroups} 个危急分组`)
        })

        // 发送汇总告警
        this.sendAlert('periodic_health_check', {
          totalModels,
          healthyModels,
          problematicModels: problematicModels.length,
          issues: problematicModels,
        })
      }
    } catch (error) {
      console.error('定期健康检查失败:', error.message)
    }
  }

  /**
   * 获取模型的健康分组
   */
  async getHealthyGroupsForModel(model) {
    const groups = this.modelGroupMapping.get(model) || []
    const healthyGroups = []

    for (const group of groups) {
      try {
        const stats = await this.getGroupStats(group.groupId, group.instanceId)
        const scoreResult = this.calculateGroupScore(stats)
        const score = typeof scoreResult === 'number' ? scoreResult : scoreResult.score

        if (score >= 60) {
          healthyGroups.push({ ...group, score })
        }
      } catch (error) {
        console.error(`检查分组 ${group.groupName} 健康状态失败:`, error.message)
      }
    }

    return healthyGroups
  }

  /**
   * 确保模型拥有最少数量的健康分组
   */
  async ensureMinimumHealthyGroups(model, minCount) {
    console.log(`🔧 确保模型 ${model} 至少有 ${minCount} 个健康分组...`)

    const healthyGroups = await this.getHealthyGroupsForModel(model)

    if (healthyGroups.length >= minCount) {
      console.log(`✅ 模型 ${model} 健康分组充足 (${healthyGroups.length}/${minCount})`)
      return
    }

    const needed = minCount - healthyGroups.length
    console.log(`⚠️ 模型 ${model} 需要增加 ${needed} 个健康分组`)

    // 尝试自动创建分组
    try {
      await this.ensureModelChannelGroups(model)
      console.log(`✅ 已为模型 ${model} 创建备用分组`)
    } catch (error) {
      console.error(`为模型 ${model} 创建备用分组失败:`, error.message)
    }
  }

  /**
   * 发送告警通知
   */
  sendAlert(type, data) {
    const alert = {
      timestamp: new Date().toISOString(),
      type,
      data,
      source: 'model-channel-optimizer',
    }

    console.log(`🚨 告警: ${JSON.stringify(alert)}`)

    // 这里可以集成各种通知系统:
    // - 发送邮件
    // - 推送到Slack/钉钉
    // - 写入日志文件
    // - 调用Webhook

    // 暂时只记录到控制台，实际使用时可以扩展
  }

  /**
   * 生成优化报告
   */
  async generateOptimizationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      models: [],
      summary: {
        totalModels: this.modelGroupMapping.size,
        healthyModels: 0,
        degradedModels: 0,
        criticalModels: 0,
      },
      recommendations: [],
    }

    for (const [model] of this.modelGroupMapping) {
      const modelReport = await this.getModelHealthReport(model)
      report.models.push(modelReport)

      if (modelReport.status === 'healthy') report.summary.healthyModels++
      else if (modelReport.status === 'warning') report.summary.degradedModels++
      else report.summary.criticalModels++
    }

    // 生成整体建议
    if (report.summary.criticalModels > 0) {
      report.recommendations.push(`🚨 有 ${report.summary.criticalModels} 个模型处于危急状态，需要立即处理`)
    }

    if (report.summary.degradedModels > report.summary.healthyModels) {
      report.recommendations.push(`⚠️ 降级模型数量超过健康模型，建议检查整体系统状态`)
    }

    return report
  }
}

// 导出单例实例
const modelChannelOptimizer = new ModelChannelOptimizer()

// 优雅关闭处理
process.on('SIGINT', () => {
  console.log('\n🛑 接收到停止信号，正在关闭模型渠道优化器...')
  modelChannelOptimizer.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 接收到终止信号，正在关闭模型渠道优化器...')
  modelChannelOptimizer.stop()
  process.exit(0)
})

module.exports = modelChannelOptimizer
