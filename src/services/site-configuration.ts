/**
 * 站点配置服务
 *
 * 职责：处理AI站点的配置逻辑，包括站点名称生成、配置验证、处理流程等
 * 从 server.ts 中提取的业务逻辑
 */

import gptloadService from '../gptload'
import modelsService from '../models'
import yamlManager from '../yaml-manager'
import threeLayerArchitecture from '../three-layer-architecture'
import { ProcessAiSiteRequest, ApiResponse } from '../types'

export interface ProcessResult {
  success: boolean
  message: string
  data: {
    siteName: string
    baseUrl: string
    channelTypes: string[]
    groupsCreated: number
    modelsCount: number
    models: string[]
    siteGroups: any[]
    modelGroups: number
    usingManualModels?: boolean
    successfulInstance?: {
      id: string
      name: string
    }
    emptyModelListHandling?: boolean
    cleanupResult?: any
  }
}

class SiteConfigurationService {
  /**
   * 从URL生成站点名称
   */
  generateSiteNameFromUrl(baseUrl: string): string {
    try {
      // 移除末尾的斜杠
      let url = baseUrl.replace(/\/+$/, '')

      // 确保URL有协议前缀
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }

      const urlObj = new URL(url)
      let siteName = urlObj.hostname

      // 转换规则
      siteName = siteName
        .toLowerCase()
        .replace(/\./g, '-')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-')

      // 确保长度在合理范围内 (3-100字符)
      if (siteName.length < 3) {
        siteName = siteName + '-ai'
      }
      if (siteName.length > 100) {
        siteName = siteName.substring(0, 100).replace(/-+$/, '')
      }

      return siteName
    } catch (error) {
      throw new Error('Invalid URL format')
    }
  }

  /**
   * 验证请求参数
   */
  validateRequest(request: ProcessAiSiteRequest): void {
    if (!request.baseUrl) {
      throw new Error('参数不完整：需要 baseUrl')
    }

    // 验证 channelTypes
    const validChannelTypes = ['openai', 'anthropic', 'gemini']
    if (request.channelTypes && !Array.isArray(request.channelTypes)) {
      throw new Error('channelTypes 必须是数组格式')
    }

    if (request.channelTypes) {
      const invalidTypes = request.channelTypes.filter((type) => !validChannelTypes.includes(type))
      if (invalidTypes.length > 0) {
        throw new Error(`无效的 channelTypes：${invalidTypes.join(', ')}`)
      }
    }
  }

  /**
   * 预处理请求参数
   */
  preprocessRequest(request: ProcessAiSiteRequest): ProcessAiSiteRequest {
    const processed = { ...request }

    // 规范化 baseUrl
    processed.baseUrl = processed.baseUrl.replace(/\/+$/, '')

    // 设置默认 channelTypes
    if (!processed.channelTypes || !Array.isArray(processed.channelTypes)) {
      processed.channelTypes = ['openai']
    }

    if (processed.channelTypes.length === 0) {
      processed.channelTypes = ['openai']
    }

    return processed
  }

  /**
   * 获取模型列表
   */
  async getModels(request: ProcessAiSiteRequest): Promise<{
    models: string[]
    successfulInstance?: string
    instanceName?: string
  }> {
    // 如果提供了手动模型列表，则优先使用
    if (request.models && Array.isArray(request.models) && request.models.length > 0) {
      console.log(`🎯 使用手动指定的模型列表 (${request.models.length} 个模型)`)
      return { models: request.models }
    }

    // 如果是更新操作且指定了目标分组名称
    if (request.operationType === 'update' && request.targetChannelName) {
      console.log(`🔄 更新操作：查找指定分组 ${request.targetChannelName}`)
      return await this.getModelsFromSpecificChannel(request)
    }

    // 检查是否已存在渠道分组（用于兼容旧的调用方式）
    const siteName = this.generateSiteNameFromUrl(request.baseUrl)
    const allGroups = await gptloadService.getAllGroups()

    let existingChannel = null
    for (const channelType of (request.channelTypes || ['openai'])) {
      const channelName = `${siteName}-${channelType}`
      existingChannel = this.findExistingChannel(allGroups, channelName, siteName, channelType)
      if (existingChannel) {
        break
      }
    }

    // 如果找到现有渠道，通过其代理获取模型
    if (existingChannel) {
      console.log('ℹ️ 检测到现有渠道，将通过其代理获取模型...')
      return await this.getModelsFromExistingChannel(request)
    }

    // 新站点处理
    console.log('ℹ️ 未找到现有渠道，作为新站点处理...')
    if (!request.apiKeys || request.apiKeys.length === 0) {
      throw new Error('首次配置渠道时必须提供API密钥')
    }

    // 使用多实例临时分组方式获取模型
    try {
      const result = await gptloadService.manager.getModelsViaMultiInstance(request.baseUrl, request.apiKeys[0])
      return {
        models: result.models,
        successfulInstance: result.instanceId,
        instanceName: result.instanceName,
      }
    } catch (error) {
      console.log('多实例获取失败，回退到直接调用...')
      const models = await modelsService.getModels(request.baseUrl, request.apiKeys[0], 3)
      return { models }
    }
  }

  /**
   * 从现有渠道获取模型
   */
  private async getModelsFromExistingChannel(request: ProcessAiSiteRequest): Promise<{
    models: string[]
    successfulInstance?: string
    instanceName?: string
  }> {
    const siteName = this.generateSiteNameFromUrl(request.baseUrl)
    const channelName = `${siteName}-${request.channelTypes![0]}`

    console.log('尝试从现有渠道配置中获取API密钥...')

    const allGroups = await gptloadService.getAllGroups()
    const existingChannel = this.findExistingChannel(allGroups, channelName, siteName, request.channelTypes![0])

    if (!existingChannel) {
      throw new Error('首次配置渠道时必须提供API密钥')
    }

    const existingKeys = await gptloadService.getGroupApiKeys(existingChannel.id, existingChannel._instance.id)

    if (existingKeys.length === 0) {
      throw new Error(`现有渠道 ${existingChannel.name} 没有可用的API密钥`)
    }

    try {
      const instance = gptloadService.manager.getInstance(existingChannel._instance.id)
      if (!instance) {
        throw new Error(`找不到实例: ${existingChannel._instance.id}`)
      }

      const proxyUrl = `${instance.url}/proxy/${existingChannel.name}`
      console.log(`- 直接通过现有渠道代理获取模型: ${proxyUrl}`)

      // 错误逻辑：原始代码会优先使用 instance.token，这是 gpt-load 的管理令牌，
      // 而非上游 AI 站点的有效密钥，会导致上游认证失败。
      // const authToken = instance.token || existingKeys[0]

      // 正确逻辑：通过代理访问时，必须提供一个对上游站点有效的API密钥。
      const authToken = existingKeys[0]

      const models = await modelsService.getModels(proxyUrl, authToken, 3)
      return {
        models,
        successfulInstance: instance.id,
        instanceName: instance.name,
      }
    } catch (error) {
      console.error(`- 通过现有渠道代理获取模型失败: ${error.message}`)
      console.log('- 代理获取失败，回退到直接访问原始URL...')
      // 如果通过代理失败（例如 gpt-load 配置问题），回退到直接访问原始 URL
      const models = await modelsService.getModels(request.baseUrl, existingKeys[0], 3)
      return { models }
    }
  }

  /**
   * 从指定的渠道获取模型
   */
  private async getModelsFromSpecificChannel(request: ProcessAiSiteRequest): Promise<{
    models: string[]
    successfulInstance?: string
    instanceName?: string
  }> {
    const allGroups = await gptloadService.getAllGroups()
    const targetChannel = allGroups.find(g => g.name === request.targetChannelName)

    if (!targetChannel) {
      throw new Error(`未找到指定的渠道分组: ${request.targetChannelName}`)
    }

    console.log(`✅ 找到目标分组: ${targetChannel.name} (实例: ${targetChannel._instance.name})`)

    // 获取现有API密钥
    const existingKeys = await gptloadService.getGroupApiKeys(targetChannel.id, targetChannel._instance.id)

    if (existingKeys.length === 0) {
      throw new Error(`渠道 ${targetChannel.name} 没有可用的API密钥`)
    }

    try {
      const instance = gptloadService.manager.getInstance(targetChannel._instance.id)
      if (!instance) {
        throw new Error(`找不到实例: ${targetChannel._instance.id}`)
      }

      const proxyUrl = `${instance.url}/proxy/${targetChannel.name}`
      console.log(`🔄 通过指定渠道代理获取模型: ${proxyUrl}`)

      const authToken = existingKeys[0]
      const models = await modelsService.getModels(proxyUrl, authToken, 3)

      return {
        models,
        successfulInstance: instance.id,
        instanceName: instance.name,
      }
    } catch (error) {
      console.error(`通过指定渠道代理获取模型失败: ${error.message}`)
      console.log('代理获取失败，回退到直接访问原始URL...')
      const models = await modelsService.getModels(request.baseUrl, existingKeys[0], 3)
      return { models }
    }
  }

  /**
   * 查找现有渠道 - 增强版
   */
  findExistingChannel(allGroups: any[], channelName: string, siteName: string, channelType: string) {
    // 精确匹配
    let existingChannel = allGroups.find((g) => g.name === channelName)

    if (!existingChannel) {
      // 模糊匹配：包含站点名和渠道类型
      const fuzzyMatches = allGroups.filter(
        (g) => g.name && g.name.includes(siteName) && g.name.includes(channelType) && g.sort === 20 // 确保是站点分组
      )

      if (fuzzyMatches.length > 0) {
        existingChannel = fuzzyMatches[0]
        console.log(`✅ 使用模糊匹配的分组: ${existingChannel.name}`)
      }
    }

    // 如果还没找到，尝试只匹配站点名
    if (!existingChannel) {
      const siteMatches = allGroups.filter(
        (g) => g.name && g.name.startsWith(siteName) && g.sort === 20 // 确保是站点分组
      )

      if (siteMatches.length > 0) {
        existingChannel = siteMatches[0]
        console.log(`✅ 使用站点名匹配的分组: ${existingChannel.name}`)
      }
    }

    return existingChannel
  }

  /**
   * 根据渠道类型过滤模型
   */
  private filterModelsByChannelType(models: string[], channelTypes: string[]): string[] {
    const compatibleModelSet = new Set<string>()

    models.forEach((model) => {
      const modelLower = model.toLowerCase()
      for (const type of channelTypes) {
        if (type === 'openai') {
          compatibleModelSet.add(model)
          break // 已添加，无需再检查此模型的其他类型
        }
        if (type === 'anthropic' && modelLower.startsWith('claude-')) {
          compatibleModelSet.add(model)
          break
        }
        if (type === 'gemini' && modelLower.startsWith('gemini-')) {
          compatibleModelSet.add(model)
          break
        }
      }
    })

    return Array.from(compatibleModelSet)
  }

  /**
   * 处理空模型列表情况
   */
  async handleEmptyModelList(siteName: string, channelTypes: string[]): Promise<ProcessResult> {
    console.log('⚠️ 站点返回空模型列表，开始清理上层分组引用...')
    const channelName = `${siteName}-${channelTypes[0]}`

    const cleanupResult = await gptloadService.handleEmptyModelList(channelName)

    return {
      success: true,
      message: `站点 ${siteName} 返回空模型列表，已保留渠道分组但清理了上层引用`,
      data: {
        siteName,
        baseUrl: '',
        channelTypes,
        groupsCreated: 0,
        modelsCount: 0,
        models: [],
        siteGroups: [],
        modelGroups: 0,
        emptyModelListHandling: true,
        cleanupResult,
      },
    }
  }

  /**
   * 处理完整的站点配置流程
   */
  async processSiteConfiguration(request: ProcessAiSiteRequest): Promise<ProcessResult> {
    // 1. 验证和预处理请求
    this.validateRequest(request)
    const processedRequest = this.preprocessRequest(request)

    // 2. 生成站点名称
    const siteName = this.generateSiteNameFromUrl(processedRequest.baseUrl)
    console.log(`开始处理AI站点：${siteName} (${processedRequest.baseUrl})`)

    // 3. 获取模型列表
    const modelResult = await this.getModels(processedRequest)

    if (!modelResult.models || modelResult.models.length === 0) {
      return await this.handleEmptyModelList(siteName, processedRequest.channelTypes!)
    }

    // 4. 应用模型过滤
    const filteredModels = modelsService.filterModels(modelResult.models)

    // 新增：根据渠道类型再次过滤
    const compatibleModels = this.filterModelsByChannelType(filteredModels, processedRequest.channelTypes!)

    if (compatibleModels.length === 0) {
      throw new Error('白名单和渠道类型过滤后没有可用模型')
    }

    // 5. 创建站点分组
    const siteGroups = await this.createSiteGroups(
      siteName,
      processedRequest,
      compatibleModels, // 使用兼容模型列表
      modelResult.successfulInstance
    )

    if (siteGroups.length === 0) {
      throw new Error('所有格式的站点分组都创建失败')
    }

    // 6. 初始化或更新三层架构
    console.log('🏗️  触发三层架构更新以包含新站点...')
    const architectureResult = await threeLayerArchitecture.initialize(siteGroups)

    // 7. 构造响应
    return {
      success: true,
      message: `成功配置AI站点 ${siteName} 并更新三层架构`,
      data: {
        siteName,
        baseUrl: processedRequest.baseUrl,
        channelTypes: processedRequest.channelTypes!,
        groupsCreated: siteGroups.length, // 本次操作创建的站点分组数量
        modelsCount: compatibleModels.length,
        models: compatibleModels,
        siteGroups,
        modelGroups: architectureResult.aggregateGroups, // 使用架构更新后的聚合分组总数
        usingManualModels: !!(processedRequest.models && processedRequest.models.length > 0),
        successfulInstance: modelResult.successfulInstance
          ? {
              id: modelResult.successfulInstance,
              name: modelResult.instanceName || '',
            }
          : undefined,
      },
    }
  }

  /**
   * 创建站点分组
   */
  private async createSiteGroups(
    siteName: string,
    request: ProcessAiSiteRequest,
    models: string[],
    successfulInstance?: string
  ): Promise<any[]> {
    const siteGroups = []

    // 预分配站点到成功实例
    if (successfulInstance) {
      const instance = gptloadService.manager.getInstance(successfulInstance)
      if (instance) {
        console.log(`🎯 预分配站点 ${request.baseUrl} 到成功实例 ${instance.name}`)
        await gptloadService.manager.reassignSite(request.baseUrl, successfulInstance)
      }
    }

    for (const channelType of request.channelTypes!) {
      try {
        const siteGroup = await gptloadService.createSiteGroup(
          siteName,
          request.baseUrl,
          request.apiKeys,
          channelType,
          request.customValidationEndpoints,
          models
        )

        if (siteGroup && siteGroup.name) {
          siteGroups.push(siteGroup)
          console.log(`✅ ${channelType} 格式站点分组创建成功`)
        }
      } catch (error) {
        console.error(`❌ ${channelType} 格式站点分组创建失败:`, error.message)
      }
    }

    return siteGroups
  }
}

export default new SiteConfigurationService()
