/**
 * 站点配置服务
 * 
 * 职责：处理AI站点的配置逻辑，包括站点名称生成、配置验证、处理流程等
 * 从 server.ts 中提取的业务逻辑
 */

import gptloadService from '../gptload'
import modelsService from '../models'
import yamlManager from '../yaml-manager'
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
      let hostname = urlObj.hostname

      // 移除常见的前缀
      hostname = hostname.replace(/^(www\.|api\.|openai\.|claude\.)/, '')

      // 处理域名规则
      let siteName = hostname

      const parts = hostname.split('.')
      if (parts.length >= 2) {
        // 对于多级域名，优先选择有意义的子域名
        if (parts.length >= 3) {
          const firstPart = parts[0]
          const secondPart = parts[1]

          // 常见的通用前缀
          const commonPrefixes = ['api', 'www', 'app', 'admin', 'service']

          const isCommonPrefix = commonPrefixes.some(
            (prefix) => firstPart === prefix || firstPart.startsWith(prefix + '-')
          )

          if (isCommonPrefix && secondPart) {
            siteName = secondPart
          } else {
            siteName = `${firstPart}-${secondPart}`
          }
        } else {
          // 只有2级域名，取主域名
          siteName = parts[parts.length - 2]
        }
      }

      // 转换规则
      siteName = siteName
        .toLowerCase()
        .replace(/\./g, '-')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-')

      // 确保长度在合理范围内 (3-30字符)
      if (siteName.length < 3) {
        siteName = siteName + '-ai'
      }
      if (siteName.length > 30) {
        siteName = siteName.substring(0, 30).replace(/-+$/, '')
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
      const invalidTypes = request.channelTypes.filter(type => !validChannelTypes.includes(type))
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
    // 如果提供了手动模型列表
    if (request.models && Array.isArray(request.models) && request.models.length > 0) {
      console.log(`🎯 使用手动指定的模型列表 (${request.models.length} 个模型)`)
      return { models: request.models }
    }

    // 如果有新密钥，通过多实例获取模型
    if (request.apiKeys && request.apiKeys.length > 0) {
      try {
        const result = await gptloadService.manager.getModelsViaMultiInstance(
          request.baseUrl,
          request.apiKeys[0]
        )
        return {
          models: result.models,
          successfulInstance: result.instanceId,
          instanceName: result.instanceName
        }
      } catch (error) {
        // 回退到直接调用
        console.log('多实例获取失败，回退到直接调用...')
        const models = await modelsService.getModels(request.baseUrl, request.apiKeys[0], 3)
        return { models }
      }
    }

    // 尝试从现有渠道获取密钥
    return await this.getModelsFromExistingChannel(request)
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

    const existingKeys = await gptloadService.getGroupApiKeys(
      existingChannel.id,
      existingChannel._instance.id
    )

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

      // 访问 gpt-load 代理需要使用 gpt-load 实例的 token 进行认证
      // 如果实例没有 token，则回退使用渠道的密钥，gpt-load 会用这个密钥去请求上游
      const authToken = instance.token || existingKeys[0]

      const models = await modelsService.getModels(proxyUrl, authToken, 3)
      return {
        models,
        successfulInstance: instance.id,
        instanceName: instance.name
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
   * 查找现有渠道
   */
  private findExistingChannel(allGroups: any[], channelName: string, siteName: string, channelType: string) {
    // 精确匹配
    let existingChannel = allGroups.find(g => g.name === channelName)

    if (!existingChannel) {
      // 模糊匹配
      const fuzzyMatches = allGroups.filter(g =>
        g.name && g.name.includes(siteName) && g.name.includes(channelType)
      )

      if (fuzzyMatches.length > 0) {
        existingChannel = fuzzyMatches[0]
        console.log(`✅ 使用模糊匹配的分组: ${existingChannel.name}`)
      }
    }

    return existingChannel
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
        cleanupResult
      }
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
    if (filteredModels.length === 0) {
      throw new Error('白名单过滤后没有可用模型')
    }

    // 5. 创建站点分组
    const siteGroups = await this.createSiteGroups(
      siteName, 
      processedRequest, 
      filteredModels, 
      modelResult.successfulInstance
    )

    if (siteGroups.length === 0) {
      throw new Error('所有格式的站点分组都创建失败')
    }

    // 6. 创建模型分组
    const modelGroups = await gptloadService.createOrUpdateModelGroups(filteredModels, siteGroups)

    // 7. 更新uni-api配置
    await yamlManager.updateUniApiConfig(modelGroups)

    return {
      success: true,
      message: `成功配置AI站点 ${siteName}`,
      data: {
        siteName,
        baseUrl: processedRequest.baseUrl,
        channelTypes: processedRequest.channelTypes!,
        groupsCreated: siteGroups.length,
        modelsCount: filteredModels.length,
        models: filteredModels,
        siteGroups,
        modelGroups: modelGroups.length,
        usingManualModels: !!(processedRequest.models && processedRequest.models.length > 0),
        successfulInstance: modelResult.successfulInstance ? {
          id: modelResult.successfulInstance,
          name: modelResult.instanceName || ''
        } : undefined
      }
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
        gptloadService.manager.siteAssignments.set(request.baseUrl, successfulInstance)
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