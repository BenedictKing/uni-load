import gptloadService from './gptload'
import axios from 'axios'
import https from 'https'

class ChannelCleanupService {
  constructor() {
    this.cleanupHistory = [] // 记录清理历史
    this.dryRunMode = false // 是否为试运行模式

    // 创建允许自签名证书的 HTTPS Agent
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, // 允许自签名证书和无效证书
    })
  }

  /**
   * 检测并清理不可连接的渠道
   */
  async cleanupDisconnectedChannels(options = {}) {
    const { dryRun = false, timeout = 10000, retryCount = 2, excludePatterns = [], onlyCheckPatterns = [] } = options

    this.dryRunMode = dryRun

    console.log(`🧹 开始清理不可连接的渠道${dryRun ? ' (试运行模式)' : ''}...`)

    const startTime = Date.now()
    const results = {
      totalSiteGroups: 0,
      disconnectedChannels: [],
      affectedModelGroups: [],
      cleanedUpstreams: 0,
      errors: [],
    }

    try {
      // 1. 获取所有分组
      const allGroups = await gptloadService.getAllGroups()

      // 2. 识别站点分组和模型分组
      const { siteGroups, modelGroups } = this.categorizeGroups(allGroups)

      results.totalSiteGroups = siteGroups.length
      console.log(`📊 发现 ${siteGroups.length} 个站点分组，${modelGroups.length} 个模型分组`)

      // 3. 检测不可连接的站点分组
      const disconnectedChannels = await this.detectDisconnectedChannels(siteGroups, {
        timeout,
        retryCount,
        excludePatterns,
        onlyCheckPatterns,
      })

      results.disconnectedChannels = disconnectedChannels
      console.log(`❌ 发现 ${disconnectedChannels.length} 个不可连接的渠道`)

      if (disconnectedChannels.length === 0) {
        console.log('✅ 所有渠道连接正常，无需清理')
        return results
      }

      // 4. 从模型分组中清理这些渠道的上游
      const cleanupResults = await this.cleanupUpstreamsFromModelGroups(modelGroups, disconnectedChannels, dryRun)

      results.affectedModelGroups = cleanupResults.affectedGroups
      results.cleanedUpstreams = cleanupResults.cleanedCount

      // 5. 记录清理历史
      if (!dryRun) {
        this.recordCleanupHistory(results)
      }

      const duration = (Date.now() - startTime) / 1000
      console.log(`🏁 渠道清理完成，耗时 ${duration.toFixed(2)}s`)
      console.log(
        `📈 统计：清理了 ${results.cleanedUpstreams} 个上游，影响 ${results.affectedModelGroups.length} 个模型分组`
      )
    } catch (error) {
      console.error('💥 渠道清理过程中发生错误:', error)
      results.errors.push(error.message)
    }

    return results
  }

  /**
   * 分类分组：站点分组 vs 模型分组
   */
  categorizeGroups(allGroups) {
    const siteGroups = []
    const modelGroups = []

    for (const group of allGroups) {
      if (this.isSiteGroup(group)) {
        siteGroups.push(group)
      } else if (this.isModelGroup(group)) {
        modelGroups.push(group)
      }
    }

    return { siteGroups, modelGroups }
  }

  /**
   * 判断是否为站点分组
   */
  isSiteGroup(group) {
    if (!group.upstreams || group.upstreams.length === 0) return false

    // 站点分组的特征：
    // 1. 上游指向外部URL（不包含/proxy/）
    // 2. 分组名通常包含格式后缀（如-openai, -anthropic）
    const hasExternalUpstream = group.upstreams.some((upstream) => upstream.url && !upstream.url.includes('/proxy/'))

    const hasFormatSuffix = /-(?:openai|anthropic|gemini)$/.test(group.name)

    return hasExternalUpstream || hasFormatSuffix
  }

  /**
   * 判断是否为模型分组
   */
  isModelGroup(group) {
    if (!group.upstreams || group.upstreams.length === 0) return false

    // 模型分组的特征：
    // 1. 上游指向gptload的proxy路径
    // 2. 通常aggregation类型或者有多个上游
    const hasProxyUpstream = group.upstreams.some((upstream) => upstream.url && upstream.url.includes('/proxy/'))

    return hasProxyUpstream
  }

  /**
   * 检测不可连接的渠道
   */
  async detectDisconnectedChannels(siteGroups, options) {
    const { timeout, retryCount, excludePatterns, onlyCheckPatterns } = options
    const disconnectedChannels = []

    console.log(`🔍 开始检测 ${siteGroups.length} 个站点分组的连接状态...`)

    for (const group of siteGroups) {
      // 应用过滤条件
      if (!this.shouldCheckGroup(group, excludePatterns, onlyCheckPatterns)) {
        console.log(`⏭️ 跳过检查分组: ${group.name} (匹配过滤规则)`)
        continue
      }

      const isConnected = await this.testChannelConnectivity(group, { timeout, retryCount })

      if (!isConnected) {
        console.log(`❌ 渠道不可连接: ${group.name}`)
        disconnectedChannels.push(group)
      } else {
        console.log(`✅ 渠道连接正常: ${group.name}`)
      }
    }

    return disconnectedChannels
  }

  /**
   * 判断是否应该检查该分组
   */
  shouldCheckGroup(group, excludePatterns, onlyCheckPatterns) {
    const groupName = group.name

    // 如果指定了只检查某些模式，必须匹配
    if (onlyCheckPatterns.length > 0) {
      const matchesOnly = onlyCheckPatterns.some((pattern) => {
        const regex = new RegExp(pattern, 'i')
        return regex.test(groupName)
      })
      if (!matchesOnly) return false
    }

    // 检查排除模式
    const isExcluded = excludePatterns.some((pattern) => {
      const regex = new RegExp(pattern, 'i')
      return regex.test(groupName)
    })

    return !isExcluded
  }

  /**
   * 测试渠道连接性
   */
  async testChannelConnectivity(group, options) {
    const { timeout, retryCount } = options

    if (!group.upstreams || group.upstreams.length === 0) {
      return false
    }

    const baseUrl = group.upstreams[0].url

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`🔍 测试连接 ${group.name} (尝试 ${attempt}/${retryCount}): ${baseUrl}`)

        const connected = await this.performConnectivityTest(baseUrl, timeout)

        if (connected) {
          return true
        }

        if (attempt < retryCount) {
          console.log(`⏳ 连接失败，等待重试...`)
          await this.sleep(2000) // 等待2秒后重试
        }
      } catch (error) {
        console.log(`❌ 连接测试失败 (尝试 ${attempt}/${retryCount}): ${error.message}`)

        if (attempt < retryCount) {
          await this.sleep(2000)
        }
      }
    }

    return false
  }

  /**
   * 执行实际的连接测试
   */
  async performConnectivityTest(baseUrl, timeout) {
    try {
      // 方法1: 尝试访问 /v1/models 端点
      const modelsUrl = `${baseUrl.replace(/\/+$/, '')}/v1/models`

      const response = await axios.get(modelsUrl, {
        timeout,
        httpsAgent: this.httpsAgent, // 使用自定义的 HTTPS Agent
        validateStatus: (status) => status < 500, // 4xx可接受，5xx表示服务器问题
        headers: {
          'User-Agent': 'uni-load-connectivity-test',
          Accept: 'application/json',
        },
      })

      // 如果能收到响应（即使是401、403等），说明服务是可达的
      console.log(`📡 连接测试响应: ${response.status} ${response.statusText}`)
      return true
    } catch (error) {
      // 网络层面的错误（如ECONNREFUSED, ETIMEDOUT）表示无法连接
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message.includes('timeout')
      ) {
        return false
      }

      // 其他错误可能表示服务可达但有其他问题
      console.log(`⚠️ 连接测试遇到非网络错误: ${error.message}`)
      return true // 保守处理，认为是可达的
    }
  }

  /**
   * 选择合适的 gptload 实例
   */
  selectInstanceForChannel(channel) {
    const gptloadService = require('./gptload')
    const instances = Array.from(gptloadService.manager.instances.values())

    if (!instances || instances.length === 0) {
      throw new Error('没有可用的 gptload 实例')
    }

    // 简单策略：选择健康的实例，优先本地实例
    let bestInstance = instances.find(
      (instance) =>
        instance.name && instance.name.includes('本地') && gptloadService.manager.healthStatus.get(instance.id)?.healthy
    )

    if (!bestInstance) {
      // 选择第一个健康的实例
      bestInstance = instances.find((instance) => gptloadService.manager.healthStatus.get(instance.id)?.healthy)
    }

    if (!bestInstance) {
      // 如果没有健康的实例，选择第一个
      bestInstance = instances[0]
    }

    return bestInstance
  }

  /**
   * 从模型分组中清理上游
   */
  async cleanupUpstreamsFromModelGroups(modelGroups, disconnectedChannels, dryRun) {
    const results = {
      affectedGroups: [],
      cleanedCount: 0,
    }

    // 构建需要清理的上游URL模式
    const upstreamPatternsToRemove = this.buildUpstreamPatterns(disconnectedChannels)

    console.log(`🔍 检查 ${modelGroups.length} 个模型分组中的上游...`)

    for (const modelGroup of modelGroups) {
      const cleanupResult = await this.cleanupUpstreamsFromSingleGroup(modelGroup, upstreamPatternsToRemove, dryRun)

      if (cleanupResult.removedCount > 0) {
        results.affectedGroups.push({
          groupName: modelGroup.name,
          removedUpstreams: cleanupResult.removedUpstreams,
          remainingUpstreams: cleanupResult.remainingUpstreams,
        })
        results.cleanedCount += cleanupResult.removedCount
      }
    }

    return results
  }

  /**
   * 构建需要移除的上游URL模式
   */
  buildUpstreamPatterns(disconnectedChannels) {
    const patterns = []

    for (const channel of disconnectedChannels) {
      // 为每个断开的渠道构建其在模型分组中的代理URL模式
      // 例如：站点分组名为 "deepseek-openai"，则代理URL为 "/proxy/deepseek-openai"
      patterns.push(`/proxy/${channel.name}`)
    }

    return patterns
  }

  /**
   * 清理单个模型分组的上游
   */
  async cleanupUpstreamsFromSingleGroup(modelGroup, patternsToRemove, dryRun) {
    const currentUpstreams = modelGroup.upstreams || []
    const removedUpstreams = []
    const remainingUpstreams = []

    // 筛选需要保留和需要移除的上游
    for (const upstream of currentUpstreams) {
      const shouldRemove = patternsToRemove.some((pattern) => upstream.url && upstream.url.includes(pattern))

      if (shouldRemove) {
        removedUpstreams.push(upstream)
      } else {
        remainingUpstreams.push(upstream)
      }
    }

    if (removedUpstreams.length === 0) {
      return { removedCount: 0, removedUpstreams: [], remainingUpstreams: currentUpstreams }
    }

    console.log(`🗑️ 模型分组 ${modelGroup.name}: 准备移除 ${removedUpstreams.length} 个上游`)

    // 安全检查：确保不会移除所有上游
    if (remainingUpstreams.length === 0) {
      console.log(`⚠️ 警告: 模型分组 ${modelGroup.name} 移除后将没有可用上游，跳过清理`)
      return { removedCount: 0, removedUpstreams: [], remainingUpstreams: currentUpstreams }
    }

    if (!dryRun) {
      // 执行实际的清理操作
      await this.updateModelGroupUpstreams(modelGroup, remainingUpstreams)
    }

    console.log(
      `${dryRun ? '📋' : '✅'} 模型分组 ${modelGroup.name}: ${dryRun ? '计划' : '已'}移除 ${removedUpstreams.length} 个上游`
    )

    return {
      removedCount: removedUpstreams.length,
      removedUpstreams,
      remainingUpstreams,
    }
  }

  /**
   * 更新模型分组的上游列表
   */
  async updateModelGroupUpstreams(modelGroup, newUpstreams) {
    const instanceId = modelGroup._instance?.id

    if (!instanceId) {
      throw new Error(`无法确定模型分组 ${modelGroup.name} 所在的实例`)
    }

    // 使用 gptloadService 来获取实例，避免循环引用
    const gptloadService = require('./gptload')
    const instance = gptloadService.manager.getInstance(instanceId)

    if (!instance) {
      throw new Error(`实例 ${instanceId} 不存在`)
    }

    const updateData = { upstreams: newUpstreams }

    await instance.apiClient.put(`/groups/${modelGroup.id}`, updateData)

    console.log(`🔄 已更新模型分组 ${modelGroup.name} 的上游列表 (实例: ${instance.name})`)
  }

  /**
   * 记录清理历史
   */
  recordCleanupHistory(results) {
    const record = {
      timestamp: new Date().toISOString(),
      disconnectedChannels: results.disconnectedChannels.map((c) => c.name),
      affectedModelGroups: results.affectedModelGroups.length,
      cleanedUpstreams: results.cleanedUpstreams,
      errors: results.errors,
    }

    this.cleanupHistory.push(record)

    // 只保留最近10次记录
    if (this.cleanupHistory.length > 10) {
      this.cleanupHistory = this.cleanupHistory.slice(-10)
    }

    console.log(`📝 已记录清理历史: ${JSON.stringify(record)}`)
  }

  /**
   * 获取清理历史
   */
  getCleanupHistory() {
    return this.cleanupHistory
  }

  /**
   * 预览将要清理的内容（试运行）
   */
  async previewCleanup(options = {}) {
    return await this.cleanupDisconnectedChannels({ ...options, dryRun: true })
  }

  /**
   * 手动清理指定的渠道
   */
  async manualCleanupChannels(channelNames, dryRun = false) {
    console.log(`🧹 手动清理指定渠道: ${channelNames.join(', ')}${dryRun ? ' (试运行模式)' : ''}`)

    const allGroups = await gptloadService.getAllGroups()
    const { siteGroups, modelGroups } = this.categorizeGroups(allGroups)

    // 找到指定的渠道分组
    const targetChannels = siteGroups.filter((group) => channelNames.includes(group.name))

    if (targetChannels.length === 0) {
      throw new Error(`未找到指定的渠道: ${channelNames.join(', ')}`)
    }

    // 清理这些渠道的上游
    const cleanupResults = await this.cleanupUpstreamsFromModelGroups(modelGroups, targetChannels, dryRun)

    const results = {
      targetChannels: targetChannels.map((c) => c.name),
      affectedModelGroups: cleanupResults.affectedGroups,
      cleanedUpstreams: cleanupResults.cleanedCount,
    }

    if (!dryRun) {
      this.recordCleanupHistory({
        disconnectedChannels: targetChannels,
        affectedModelGroups: cleanupResults.affectedGroups,
        cleanedUpstreams: cleanupResults.cleanedCount,
        errors: [],
      })
    }

    return results
  }

  /**
   * 工具方法：等待指定时间
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      recentCleanups: this.cleanupHistory.slice(-3),
      totalCleanups: this.cleanupHistory.length,
    }
  }
}

export default new ChannelCleanupService()
