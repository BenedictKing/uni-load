/**
 * 三层架构管理器
 *
 * 实现基于 gptload 的三层分组架构：
 * 第1层：站点分组 (sort=20) - 直接连接外部API
 * 第2层：模型-渠道分组 (sort=15) - 细粒度控制，每个模型在每个渠道的独立分组
 * 第3层：模型聚合分组 (sort=10) - 统一入口，聚合所有渠道的同一模型
 *
 * 核心理念：
 * 1. 利用 gptload 的密钥管理和黑名单机制
 * 2. 被动验证策略，避免API消耗
 * 3. 快速故障隔离和智能恢复
 */

import gptloadService from './gptload'
import modelConfig from './model-config'
import modelsService from './models'
import { getService } from './services/service-factory'
import { IYamlManager } from './interfaces'
import { layerConfigs } from './layer-configs'

class ThreeLayerArchitecture {
  layerConfigs: any
  recoverySchedule: Map<string, any>
  failureHistory: Map<string, any>
  weightCache: Map<string, any>
  weightOptimizationTimer: any
  emergencyOptimizationTimer: any
  isRunning: boolean

  constructor() {
    // 使用外部配置
    this.layerConfigs = layerConfigs

    // 恢复策略
    this.recoverySchedule = new Map() // "model:channel" -> { nextRetry: Date, retryCount: number }
    this.failureHistory = new Map() // "model:channel" -> { failures: number, lastFailure: Date }

    // 权重缓存，避免频繁的重复更新
    this.weightCache = new Map() // groupId -> cached weights
  }

  /**
   * 初始化三层架构 - 优化版本
   */
  async initialize(newlyCreatedSiteGroups = null) {
    console.log('🚀 初始化三层 gptload 架构...')

    try {
      // 1. 获取现有的站点分组（第1层）
      const allSiteGroupsList = await this.getSiteGroups()
      let siteGroups

      if (newlyCreatedSiteGroups && Array.isArray(newlyCreatedSiteGroups) && newlyCreatedSiteGroups.length > 0) {
        console.log('ℹ️ 使用传入的新创建/更新的站点分组信息进行合并...')
        const siteGroupMap = new Map(allSiteGroupsList.map((g) => [g.name, g]))
        newlyCreatedSiteGroups.forEach((newGroup) => {
          // 用新的、更完整的信息替换掉从 /api/groups 获取的简要信息
          siteGroupMap.set(newGroup.name, newGroup)
        })
        siteGroups = Array.from(siteGroupMap.values())
      } else {
        siteGroups = allSiteGroupsList
      }

      console.log(`✅ 第1层: 发现 ${siteGroups.length} 个站点分组`)

      if (siteGroups.length === 0) {
        console.log('⚠️ 没有站点分组，无法初始化三层架构')
        return { siteGroups: 0, modelChannelGroups: 0, aggregateGroups: 0, totalModels: 0 }
      }

      // 2. 分析现有分组结构，而不是创建新的测试分组
      const allGroups = await gptloadService.getAllGroups()
      const existingModelChannelGroups = allGroups.filter((g) => g.sort === layerConfigs.modelChannelGroup.sort)
      const existingAggregateGroups = allGroups.filter((g) => g.sort === layerConfigs.aggregateGroup.sort)

      console.log(`📊 现有第2层分组: ${existingModelChannelGroups.length} 个`)
      console.log(`📊 现有第3层分组: ${existingAggregateGroups.length} 个`)

      // 3. 从站点分组的已验证模型中获取可用模型（不进行实时测试）
      const availableModels = await this.getAvailableModelsFromSiteGroups(siteGroups)
      console.log(`📊 从站点分组中发现 ${availableModels.size} 个已验证模型`)

      // 4. 分析需要创建/更新的分组
      const analysisResult = await this.analyzeRequiredGroups(
        availableModels,
        siteGroups,
        existingModelChannelGroups,
        existingAggregateGroups
      )

      console.log(
        `📋 分析结果: 需要创建 ${analysisResult.toCreate.modelChannel} 个第2层分组, ${analysisResult.toCreate.aggregate} 个第3层分组`
      )
      console.log(
        `📋 分析结果: 需要更新 ${analysisResult.toUpdate.modelChannel} 个第2层分组, ${analysisResult.toUpdate.aggregate} 个第3层分组`
      )

      // 5. 执行必要的创建和更新操作
      const createdModelChannelGroups = await this.createMissingModelChannelGroups(
        analysisResult.toCreate.modelChannelSpecs
      )
      const updatedModelChannelGroups = await this.updateExistingModelChannelGroups(
        analysisResult.toUpdate.modelChannelSpecs
      )

      const createdAggregateGroups = await this.createMissingAggregateGroups(analysisResult.toCreate.aggregateSpecs)
      const updatedAggregateGroups = await this.updateExistingAggregateGroups(analysisResult.toUpdate.aggregateSpecs)

      // 6. 设置被动恢复机制（移除主动验证）
      this.setupPassiveRecovery()
      console.log('🔄 被动恢复机制已启动')

      // 7. 启动权重优化
      this.startWeightOptimization()
      console.log('⚖️ 权重优化已启动')

      // 8. 更新uni-api配置
      console.log('🔧 更新uni-api配置...')
      try {
        const finalAggregateGroups = [...existingAggregateGroups, ...createdAggregateGroups]
        const yamlManager = getService<IYamlManager>('yamlManager')
        await yamlManager.updateUniApiConfig(finalAggregateGroups)
        console.log(`✅ 已将 ${finalAggregateGroups.length} 个聚合分组同步到uni-api配置`)
      } catch (error) {
        console.error('❌ 更新uni-api配置失败:', error.message)
      }

      console.log('✅ 三层架构初始化完成')

      return {
        siteGroups: siteGroups.length,
        modelChannelGroups: existingModelChannelGroups.length + createdModelChannelGroups.length,
        aggregateGroups: existingAggregateGroups.length + createdAggregateGroups.length,
        totalModels: availableModels.size,
      }
    } catch (error) {
      console.error('❌ 三层架构初始化失败:', error)
      throw error
    }
  }

  /**
   * 获取站点分组（第1层）
   */
  async getSiteGroups() {
    try {
      // 确保实例健康状态已检查
      await gptloadService.checkAllInstancesHealth()

      const allGroups = await gptloadService.getAllGroups()

      console.log(`🔍 检查所有分组 (共 ${allGroups.length} 个):`)
      allGroups.forEach((group) => {
        console.log(`  - ${group.name}: sort=${group.sort}, upstreams=${group.upstreams?.length || 0}`)
        if (group.upstreams && group.upstreams.length > 0) {
          group.upstreams.forEach((upstream) => {
            console.log(`    └─ ${upstream.url}`)
          })
        }
      })

      // 筛选站点分组：sort=20
      const siteGroups = allGroups.filter((group) => {
        return group.sort === layerConfigs.siteGroup.sort
      })

      console.log(`✅ 找到 ${siteGroups.length} 个站点分组 (sort=${layerConfigs.siteGroup.sort})`)

      return siteGroups
    } catch (error) {
      console.error('获取站点分组失败:', error)
      return []
    }
  }

  /**
   * 从站点分组的已验证模型列表中获取可用模型
   */
  async getAvailableModelsFromSiteGroups(siteGroups) {
    const availableModels = new Map() // 模型 -> 支持该模型的站点分组列表

    for (const siteGroup of siteGroups) {
      let models = []

      // 优先使用已缓存的验证模型列表
      if (siteGroup.validated_models && Array.isArray(siteGroup.validated_models)) {
        models = siteGroup.validated_models
        console.log(`📋 站点 ${siteGroup.name}: 使用已验证的 ${models.length} 个模型`)
      } else if (siteGroup.test_model) {
        // 回退到测试模型
        models = [siteGroup.test_model]
        console.log(`📋 站点 ${siteGroup.name}: 使用测试模型 ${siteGroup.test_model}`)
      } else {
        console.log(`⚠️ 站点 ${siteGroup.name}: 没有可用的模型信息`)
        continue
      }

      // 应用模型白名单过滤
      const filteredModels = modelConfig.filterModels(models)

      for (const model of filteredModels) {
        if (!availableModels.has(model)) {
          availableModels.set(model, [])
        }
        availableModels.get(model).push(siteGroup)
      }
    }

    return availableModels
  }

  /**
   * 从站点分组获取已验证的模型列表（保留原方法用于兼容性）
   */
  async getValidatedModelsForSite(siteGroup) {
    try {
      // 优先使用 gptload 存储的已验证模型列表
      if (siteGroup.validated_models && Array.isArray(siteGroup.validated_models)) {
        console.log(`📋 使用站点 ${siteGroup.name} 的缓存模型列表 (${siteGroup.validated_models.length} 个)`)
        return modelConfig.filterModels(siteGroup.validated_models)
      }

      // 如果没有验证模型列表，使用测试模型
      if (siteGroup.test_model) {
        console.log(`📋 站点 ${siteGroup.name}: 使用测试模型 ${siteGroup.test_model}`)
        return modelConfig.filterModels([siteGroup.test_model])
      }

      console.log(`⚠️ 站点 ${siteGroup.name}: 没有可用的模型信息，跳过`)
      return []
    } catch (error) {
      console.error(`获取站点 ${siteGroup.name} 的模型失败:`, error.message)
      return []
    }
  }

  /**
   * 分析需要创建和更新的分组
   */
  async analyzeRequiredGroups(availableModels, siteGroups, existingModelChannelGroups, existingAggregateGroups) {
    const result = {
      toCreate: {
        modelChannel: 0,
        aggregate: 0,
        modelChannelSpecs: [],
        aggregateSpecs: [],
      },
      toUpdate: {
        modelChannel: 0,
        aggregate: 0,
        modelChannelSpecs: [],
        aggregateSpecs: [],
      },
    }

    // 分析每个模型需要的分组
    for (const [model, supportingSites] of availableModels) {
      // 检查第2层分组（模型-渠道分组）
      for (const site of supportingSites) {
        const expectedGroupName = `${(modelConfig.constructor as any).generateModelChannelGroupName(model, site.name)}`
        const existingGroup = existingModelChannelGroups.find((g) => g.name === expectedGroupName)

        if (!existingGroup) {
          result.toCreate.modelChannel++
          result.toCreate.modelChannelSpecs.push({
            model,
            site,
            groupName: expectedGroupName,
          })
        } else {
          // 检查是否需要更新上游
          const expectedUpstream = `${
            site._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001'
          }/proxy/${site.name}`
          const hasCorrectUpstream = existingGroup.upstreams?.some((u) => u.url === expectedUpstream)

          if (!hasCorrectUpstream) {
            result.toUpdate.modelChannel++
            result.toUpdate.modelChannelSpecs.push({
              model,
              site,
              existingGroup,
              expectedUpstream,
            })
          }
        }
      }

      // 检查第3层分组（聚合分组）
      const expectedAggregateGroupName = (modelConfig.constructor as any).generateSafeGroupName(model)
      const existingAggregateGroup = existingAggregateGroups.find((g) => g.name === expectedAggregateGroupName)

      if (!existingAggregateGroup) {
        result.toCreate.aggregate++
        result.toCreate.aggregateSpecs.push({
          model,
          supportingSites,
          groupName: expectedAggregateGroupName,
        })
      } else {
        // 检查聚合分组的上游是否完整
        const expectedUpstreams = supportingSites.map(
          (site) =>
            `${site._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001'}/proxy/${(
              modelConfig.constructor as any
            ).generateModelChannelGroupName(model, site.name)}`
        )

        const needsUpdate = expectedUpstreams.some(
          (expectedUpstream) => !existingAggregateGroup.upstreams?.some((u) => u.url === expectedUpstream)
        )

        if (needsUpdate) {
          result.toUpdate.aggregate++
          result.toUpdate.aggregateSpecs.push({
            model,
            supportingSites,
            existingGroup: existingAggregateGroup,
            expectedUpstreams,
          })
        }
      }
    }

    return result
  }

  /**
   * 创建缺失的模型-渠道分组
   */
  async createMissingModelChannelGroups(specs) {
    const createdGroups = []

    for (const spec of specs) {
      try {
        const group = await this.createSingleModelChannelGroup(spec.model, spec.site, spec.groupName)
        if (group) {
          createdGroups.push(group)
          console.log(`✅ 创建第2层分组: ${spec.groupName}`)
        }
      } catch (error) {
        console.error(`❌ 创建第2层分组 ${spec.groupName} 失败:`, error.message)
      }
    }

    return createdGroups
  }

  /**
   * 更新现有的模型-渠道分组
   */
  async updateExistingModelChannelGroups(specs) {
    const updatedGroups = []

    for (const spec of specs) {
      try {
        const updateData = {
          upstreams: [{ url: spec.expectedUpstream, weight: 1 }],
        }

        await gptloadService.updateGroup(spec.existingGroup.id, spec.existingGroup._instance.id, updateData)
        updatedGroups.push(spec.existingGroup)
        console.log(`🔄 更新第2层分组: ${spec.existingGroup.name}`)
      } catch (error) {
        console.error(`❌ 更新第2层分组 ${spec.existingGroup.name} 失败:`, error.message)
      }
    }

    return updatedGroups
  }

  /**
   * 创建缺失的聚合分组
   */
  async createMissingAggregateGroups(specs) {
    const createdGroups = []

    for (const spec of specs) {
      try {
        const supportingChannels = spec.supportingSites.map((site) => ({
          name: `${(modelConfig.constructor as any).generateModelChannelGroupName(spec.model, site.name)}`,
          _instance: site._instance,
        }))

        const group = await this.createSingleAggregateGroup(
          spec.model,
          supportingChannels,
          this.layerConfigs.aggregateGroup
        )
        if (group) {
          createdGroups.push(group)
          console.log(`✅ 创建第3层分组: ${spec.groupName}`)
        }
      } catch (error) {
        console.error(`❌ 创建第3层分组 ${spec.groupName} 失败:`, error.message)
      }
    }

    return createdGroups
  }

  /**
   * 更新现有的聚合分组
   */
  async updateExistingAggregateGroups(specs) {
    const updatedGroups = []

    for (const spec of specs) {
      try {
        const updateData = {
          upstreams: spec.expectedUpstreams.map((url) => ({ url, weight: 1 })),
        }

        await gptloadService.updateGroup(spec.existingGroup.id, spec.existingGroup._instance.id, updateData)
        updatedGroups.push(spec.existingGroup)
        console.log(`🔄 更新第3层分组: ${spec.existingGroup.name}`)
      } catch (error) {
        console.error(`❌ 更新第3层分组 ${spec.existingGroup.name} 失败:`, error.message)
      }
    }

    return updatedGroups
  }

  /**
   * 创建单个模型-渠道分组
   */
  async createSingleModelChannelGroup(model, site, groupName) {
    let groupData
    try {
      // 选择第一个健康的实例用于二三层分组
      const allInstances = gptloadService.manager.getAllInstances()
      const instance = allInstances.find((inst) => inst.health?.healthy)

      if (!instance) {
        throw new Error('没有健康的 gptload 实例可用于创建二三层分组')
      }

      groupData = {
        name: groupName,
        display_name: `${model} @ ${site.name}`,
        description: `${model} 模型通过 ${site.name} 渠道的专用分组`,
        upstreams: [
          {
            url: `${instance.url}/proxy/${site.name}`,
            weight: 1,
          },
        ],
        test_model: model,
        channel_type: site.channel_type || 'openai',
        validation_endpoint: site.validation_endpoint,
        sort: layerConfigs.modelChannelGroup.sort, // 第2层分组
        param_overrides: {},
        config: {
          blacklist_threshold: this.layerConfigs.modelChannelGroup.blacklist_threshold,
          key_validation_interval_minutes: this.layerConfigs.modelChannelGroup.key_validation_interval_minutes,
        },
        tags: ['layer-2', 'model-channel', model, site.name],
      }

      console.log(`🔍 创建第2层分组请求参数:`, {
        name: groupData.name,
        display_name: groupData.display_name,
        channel_type: groupData.channel_type,
        validation_endpoint: groupData.validation_endpoint,
        test_model: groupData.test_model,
        upstreams: groupData.upstreams,
        sort: groupData.sort,
      })

      const response = await instance.apiClient.post('/groups', groupData)

      let created
      if (response.data && typeof response.data.code === 'number') {
        if (response.data.code === 0) {
          created = response.data.data
        } else {
          throw new Error(`创建失败: ${response.data.message}`)
        }
      } else {
        created = response.data
      }

      created._instance = {
        id: instance.id,
        name: instance.name,
        url: instance.url,
      }

      if (instance.token) {
        await gptloadService.manager.addApiKeysToGroup(instance, created.id, [instance.token])
      }

      return created
    } catch (error) {
      // 添加详细的错误信息输出
      console.error(`❌ 创建第2层分组失败详情:`)
      console.error(`  - 分组名称: ${groupData?.name}`)
      console.error(`  - 错误状态码: ${error.response?.status}`)
      console.error(`  - 错误消息: ${error.message}`)

      if (error.response?.data) {
        console.error(`  - 服务器响应:`, JSON.stringify(error.response.data, null, 2))
      }

      if (error.response?.headers) {
        console.error(`  - 响应头:`, error.response.headers)
      }

      if (error.config) {
        console.error(`  - 请求URL: ${error.config.method?.toUpperCase()} ${error.config.url}`)
        if (error.config.data) {
          console.error(
            `  - 请求体:`,
            typeof error.config.data === 'string'
              ? error.config.data
              : JSON.stringify(JSON.parse(error.config.data), null, 2)
          )
        }
      }

      throw new Error(
        `创建模型-渠道分组失败: ${error.response?.data?.message || error.response?.statusText || error.message}`
      )
    }
  }

  /**
   * 从站点分组获取所有独特模型（保留兼容性）
   */
  async getAllUniqueModels(siteGroups) {
    const allModels = new Set()

    for (const siteGroup of siteGroups) {
      const models = await this.getValidatedModelsForSite(siteGroup)
      models.forEach((model) => allModels.add(model))
    }

    return Array.from(allModels)
  }

  /**
   * 创建模型-渠道分组（第2层）
   */
  async createModelChannelGroups(models, siteGroups, modelSiteMap = null) {
    console.log('🔧 创建模型-渠道分组（第2层）...')

    // 🔧 添加参数验证
    if (!models || !Array.isArray(models)) {
      console.error('❌ models 参数无效:', models)
      return []
    }

    if (!siteGroups || !Array.isArray(siteGroups)) {
      console.error('❌ siteGroups 参数无效:', siteGroups)
      return []
    }

    if (models.length === 0) {
      console.log('⚠️ 没有模型需要处理')
      return []
    }

    if (siteGroups.length === 0) {
      console.log('⚠️ 没有站点分组需要处理')
      return []
    }

    const groups = []
    const config = this.layerConfigs.modelChannelGroup

    // 计算总任务数 - 如果有精确映射，使用实际的模型-站点组合数
    let totalTasks
    if (modelSiteMap) {
      totalTasks = 0
      modelSiteMap.forEach((sites, model) => {
        totalTasks += sites.length
      })
      console.log(`📊 基于精确映射处理 ${totalTasks} 个模型-站点组合`)
    } else {
      totalTasks = models.length * siteGroups.length
      console.log(`📊 准备处理 ${models.length} 个模型 × ${siteGroups.length} 个站点 = ${totalTasks} 个任务`)
    }

    // 一次性获取所有分组信息，避免重复查询
    console.log('📊 获取现有分组信息...')
    let allExistingGroups

    try {
      allExistingGroups = await gptloadService.getAllGroups()

      // 🔧 添加返回值验证
      if (!allExistingGroups || !Array.isArray(allExistingGroups)) {
        console.error('❌ getAllGroups 返回值无效:', allExistingGroups)
        allExistingGroups = []
      }

      console.log(`✅ 获取到 ${allExistingGroups.length} 个现有分组`)
    } catch (error) {
      console.error('❌ 获取现有分组失败:', error.message)
      allExistingGroups = []
      console.log('⚠️ 使用空数组继续处理')
    }

    let createdCount = 0
    let skippedCount = 0
    let failedCount = 0
    let processedTasks = 0

    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const model = models[modelIndex]

      // 🔧 添加模型名称验证
      if (!model || typeof model !== 'string') {
        console.error(`❌ 模型名称无效 (索引 ${modelIndex}):`, model)
        // 跳过计数调整
        const skipCount = modelSiteMap ? modelSiteMap.get(model)?.length || 0 : siteGroups.length
        failedCount += skipCount
        processedTasks += skipCount
        continue
      }

      console.log(`🎯 处理模型 ${modelIndex + 1}/${models.length}: ${model}`)

      let modelCreatedCount = 0
      let modelSkippedCount = 0
      let modelFailedCount = 0

      // 获取该模型支持的站点分组（精确匹配）
      const supportingSites = modelSiteMap ? modelSiteMap.get(model) || [] : siteGroups
      console.log(`📋 模型 ${model}: 将处理 ${supportingSites.length} 个支持的站点`)

      for (let siteIndex = 0; siteIndex < supportingSites.length; siteIndex++) {
        const site = supportingSites[siteIndex]
        processedTasks++

        // 🔧 添加站点分组验证
        if (!site || !site.name) {
          console.error(`❌ 站点分组无效 (索引 ${siteIndex}):`, site)
          failedCount++
          modelFailedCount++
          continue
        }

        try {
          // 生成分组名称
          const groupName = this.generateModelChannelGroupName(model, site.name)

          // 从缓存的分组列表中检查是否已存在
          const existing = allExistingGroups.find((g) => g.name === groupName)
          if (existing) {
            console.log(`ℹ️ [${processedTasks}/${totalTasks}] 分组已存在: ${groupName}`)
            groups.push(existing)
            skippedCount++
            modelSkippedCount++
            continue
          }

          // 选择第一个健康的实例用于二三层分组
          const allInstances = gptloadService.manager.getAllInstances()
          const instance = allInstances.find((inst) => inst.health?.healthy)

          if (!instance) {
            throw new Error('没有健康的 gptload 实例可用于创建二三层分组')
          }

          // 创建分组数据
          const groupData = {
            name: groupName,
            display_name: `${model} @ ${site.name}`,
            description: `${model} 模型通过 ${site.name} 渠道的专用分组`,
            upstreams: [
              {
                url: `${instance.url}/proxy/${site.name}`,
                weight: 1,
              },
            ],
            test_model: model,
            channel_type: site.channel_type || 'openai',
            validation_endpoint: site.validation_endpoint,
            sort: config.sort, // 确保使用正确的 sort 值：30
            param_overrides: {},
            config: {
              blacklist_threshold: config.blacklist_threshold,
              key_validation_interval_minutes: config.key_validation_interval_minutes,
            },
            tags: ['layer-2', 'model-channel', model, site.name],
          }

          // 直接调用实例 API 创建分组，避免 createSiteGroup 的 sort=20 覆盖
          const response = await instance.apiClient.post('/groups', groupData)

          // 处理响应
          let created
          if (response.data && typeof response.data.code === 'number') {
            if (response.data.code === 0) {
              created = response.data.data
            } else {
              throw new Error(`创建失败: ${response.data.message}`)
            }
          } else {
            created = response.data
          }

          // 添加实例信息
          created._instance = {
            id: instance.id,
            name: instance.name,
            url: instance.url,
          }

          if (created) {
            if (instance.token) {
              await gptloadService.manager.addApiKeysToGroup(instance, created.id, [instance.token])
              console.log(`🔑 [${processedTasks}/${totalTasks}] 已为第二层分组添加实例认证token`)
            }

            groups.push(created)
            createdCount++
            modelCreatedCount++
            console.log(`✅ [${processedTasks}/${totalTasks}] 创建第2层分组: ${groupName} (sort=${config.sort})`)

            // 将新创建的分组添加到缓存中，避免重复创建
            allExistingGroups.push(created)
          }
        } catch (error) {
          const groupName = this.generateModelChannelGroupName(model, site.name)
          console.log(`⚠️ [${processedTasks}/${totalTasks}] 创建失败: ${groupName} - ${error.message}`)
          failedCount++
          modelFailedCount++
          this.recordIncompatibleCombination(model, site.name)
        }

        // 每处理10个任务显示一次进度
        if (processedTasks % 10 === 0 || processedTasks === totalTasks) {
          const progress = ((processedTasks / totalTasks) * 100).toFixed(1)
          console.log(
            `📈 总进度: ${processedTasks}/${totalTasks} (${progress}%) - 已创建: ${createdCount}, 跳过: ${skippedCount}, 失败: ${failedCount}`
          )
        }
      }

      // 每个模型处理完成后的统计
      console.log(
        `📊 模型 ${model} 处理完成: 创建 ${modelCreatedCount}, 跳过 ${modelSkippedCount}, 失败 ${modelFailedCount}`
      )
    }

    // 最终统计
    console.log(`✅ 第2层分组创建完成：`)
    console.log(`   - 新建: ${createdCount} 个`)
    console.log(`   - 跳过: ${skippedCount} 个`)
    console.log(`   - 失败: ${failedCount} 个`)
    console.log(`   - 总计: ${groups.length} 个分组`)
    console.log(`   - 成功率: ${(((createdCount + skippedCount) / totalTasks) * 100).toFixed(1)}%`)

    return groups
  }

  /**
   * 创建模型聚合分组（第3层）
   */
  async createAggregateGroups(models, modelChannelGroups) {
    console.log('🔧 创建模型聚合分组（第3层）...')

    // 🔧 添加参数验证
    if (!models || !Array.isArray(models)) {
      console.error('❌ models 参数无效:', models)
      return []
    }

    if (!modelChannelGroups || !Array.isArray(modelChannelGroups)) {
      console.error('❌ modelChannelGroups 参数无效:', modelChannelGroups)
      return []
    }

    if (models.length === 0) {
      console.log('⚠️ 没有模型需要处理')
      return []
    }

    if (modelChannelGroups.length === 0) {
      console.log('⚠️ 没有模型渠道分组需要处理')
      return []
    }

    const groups = []
    const config = this.layerConfigs.aggregateGroup

    // 按模型分组
    const groupedByModel = this.groupModelChannelsByModel(modelChannelGroups)

    // 🔧 添加分组结果验证
    if (!groupedByModel || groupedByModel.size === 0) {
      console.log('⚠️ 按模型分组后没有结果')
      return []
    }

    const totalModels = groupedByModel.size
    console.log(`📊 准备为 ${totalModels} 个模型创建聚合分组`)

    // 一次性获取现有分组信息 - 关键优化点：只调用一次
    let allExistingGroups

    try {
      allExistingGroups = await gptloadService.getAllGroups()

      // 🔧 添加返回值验证
      if (!allExistingGroups || !Array.isArray(allExistingGroups)) {
        console.error('❌ getAllGroups 返回值无效:', allExistingGroups)
        allExistingGroups = []
      }

      console.log(`✅ 获取到 ${allExistingGroups.length} 个现有分组，开始批量处理`)
    } catch (error) {
      console.error('❌ 获取现有分组失败:', error.message)
      allExistingGroups = []
      console.log('⚠️ 使用空数组继续处理')
    }

    let createdCount = 0
    let updatedCount = 0
    let failedCount = 0
    let processedModels = 0

    for (const [model, channelGroups] of groupedByModel) {
      processedModels++
      try {
        const groupName = (modelConfig.constructor as any).generateSafeGroupName(model)

        console.log(`🎯 [${processedModels}/${totalModels}] 处理模型: ${model} (${channelGroups.length} 个渠道)`)

        // 从缓存中检查是否已存在 - 避免重复API调用
        const existing = allExistingGroups.find((g) => g.name === groupName)
        if (existing) {
          console.log(`ℹ️ [${processedModels}/${totalModels}] 聚合分组已存在: ${groupName}，更新配置...`)
          await this.updateAggregateUpstreams(existing, channelGroups)
          groups.push(existing)
          updatedCount++
          continue
        }

        // 创建新的聚合分组
        const created = await this.createSingleAggregateGroup(model, channelGroups, config)
        if (created) {
          groups.push(created)
          createdCount++
          console.log(
            `✅ [${processedModels}/${totalModels}] 创建聚合分组: ${created.name} (${
              created.upstreams?.length || 0
            }个上游)`
          )

          // 将新创建的分组添加到缓存中，避免后续重复检查
          allExistingGroups.push(created)
        } else {
          failedCount++
        }
      } catch (error) {
        console.error(`❌ [${processedModels}/${totalModels}] 创建模型 ${model} 的聚合分组失败:`, error.message)
        failedCount++
      }

      // 显示进度
      const progress = ((processedModels / totalModels) * 100).toFixed(1)
      if (processedModels % 5 === 0 || processedModels === totalModels) {
        console.log(
          `📈 第3层进度: ${processedModels}/${totalModels} (${progress}%) - 创建: ${createdCount}, 更新: ${updatedCount}, 失败: ${failedCount}`
        )
      }
    }

    // 最终统计
    console.log(`✅ 第3层分组处理完成：`)
    console.log(`   - 新建: ${createdCount} 个`)
    console.log(`   - 更新: ${updatedCount} 个`)
    console.log(`   - 失败: ${failedCount} 个`)
    console.log(`   - 总计: ${groups.length} 个聚合分组`)
    console.log(`   - 成功率: ${(((createdCount + updatedCount) / totalModels) * 100).toFixed(1)}%`)

    return groups
  }

  /**
   * 设置被动恢复机制
   */
  setupPassiveRecovery() {
    // 定期检查失败的组合
    setInterval(async () => {
      await this.performPassiveRecovery()
    }, 5 * 60 * 1000) // 每5分钟检查一次

    // 分析最近的请求日志
    setInterval(async () => {
      await this.analyzeRecentLogs()
    }, 60 * 1000) // 每分钟分析一次
  }

  /**
   * 执行被动恢复
   */
  async performPassiveRecovery() {
    for (const [combination, schedule] of this.recoverySchedule) {
      if (Date.now() >= schedule.nextRetry) {
        await this.attemptRecovery(combination)
      }
    }
  }

  /**
   * 尝试恢复单个组合
   */
  async attemptRecovery(combination) {
    const [model, channel] = combination.split(':')
    const groupName = this.generateModelChannelGroupName(model, channel)

    console.log(`🔄 尝试恢复 ${combination}...`)

    try {
      const group = await gptloadService.checkGroupExists(groupName)
      if (!group) {
        this.recoverySchedule.delete(combination)
        return
      }

      // 获取密钥状态
      const stats = await this.getGroupStats(group)
      const keyStats = stats?.key_stats

      if (keyStats && keyStats.invalid_keys > 0) {
        // 恢复密钥
        await gptloadService.toggleApiKeysStatusForGroup(group.id, group._instance.id, 'active')

        console.log(`♻️ ${combination} 密钥已恢复`)
        this.recoverySchedule.delete(combination)
        this.failureHistory.delete(combination)
      } else {
        // 更新下次重试时间（指数退避）
        const currentSchedule = this.recoverySchedule.get(combination)
        const nextDelay = Math.min(
          1000 * Math.pow(2, currentSchedule.retryCount),
          3600 * 1000 // 最多1小时
        )

        this.recoverySchedule.set(combination, {
          nextRetry: Date.now() + nextDelay,
          retryCount: currentSchedule.retryCount + 1,
        })
      }
    } catch (error) {
      console.error(`恢复 ${combination} 失败:`, error.message)
    }
  }

  /**
   * 分析最近的日志
   */
  async analyzeRecentLogs() {
    try {
      // 这里可以集成 gptload 的日志API
      // 现在先用简单的统计信息替代
      const allGroups = await gptloadService.getAllGroups()

      for (const group of allGroups) {
        if (group.tags?.includes('layer-2')) {
          // 检查第2层分组的统计
          const stats = await this.getGroupStats(group)

          if (stats && stats.hourly_stats) {
            const failureRate = stats.hourly_stats.failure_rate || 0

            if (failureRate > 0.5 && stats.hourly_stats.total_requests > 5) {
              // 高失败率，安排恢复
              const combination = this.extractModelChannelFromGroupName(group.name)
              this.scheduleRecovery(combination)
            }
          }
        }
      }
    } catch (error) {
      console.error('分析日志失败:', error.message)
    }
  }

  /**
   * 安排恢复任务
   */
  scheduleRecovery(combination) {
    if (!this.recoverySchedule.has(combination)) {
      this.recoverySchedule.set(combination, {
        nextRetry: Date.now() + 5 * 60 * 1000, // 5分钟后重试
        retryCount: 0,
      })

      console.log(`📅 安排恢复: ${combination}`)
    }
  }

  /**
   * 启动权重优化
   */
  startWeightOptimization() {
    // 每24小时优化一次权重，避免过于频繁的缓存重载
    this.weightOptimizationTimer = setInterval(async () => {
      await this.optimizeAggregateWeights()
    }, 24 * 60 * 60 * 1000)

    // 每2小时检查是否需要紧急权重调整
    this.emergencyOptimizationTimer = setInterval(async () => {
      await this.checkEmergencyOptimization()
    }, 2 * 60 * 60 * 1000)
  }

  /**
   * 检查是否需要紧急权重优化
   */
  async checkEmergencyOptimization() {
    try {
      const allGroups = await gptloadService.getAllGroups()
      const aggregateGroups = allGroups.filter((g) => g.tags?.includes('layer-3'))

      let criticalGroupsCount = 0

      // 检查是否有权重为0或失败率过高的分组
      for (const group of aggregateGroups.slice(0, 5)) {
        // 只检查前5个以控制负载
        try {
          const stats = await this.getGroupStats(group)
          if (stats && stats.hourly_stats) {
            const failureRate = stats.hourly_stats.failure_rate || 0
            const zeroWeightUpstreams = group.upstreams?.filter((u) => u.weight === 0).length || 0

            // 如果失败率超过50%或有零权重上游，认为需要紧急处理
            if (failureRate > 0.5 || zeroWeightUpstreams > 0) {
              criticalGroupsCount++
            }
          }
        } catch (error) {
          // 忽略单个分组的检查错误
        }
      }

      // 如果超过20%的检查分组有问题，触发紧急优化
      if (criticalGroupsCount > Math.max(1, Math.floor(aggregateGroups.length * 0.2))) {
        console.log(`🚨 发现 ${criticalGroupsCount} 个分组需要紧急权重调整`)

        const systemLoad = await this.getSystemLoad()
        if (systemLoad < 0.7) {
          // 系统负载不高时才执行
          await this.optimizeAggregateWeights()
        } else {
          console.log(`⚠️ 系统负载过高 (${(systemLoad * 100).toFixed(1)}%)，推迟紧急优化`)
        }
      }
    } catch (error) {
      console.error('紧急优化检查失败:', error.message)
    }
  }

  /**
   * 获取系统负载状态
   */
  async getSystemLoad() {
    try {
      // 检查当前正在运行的优化任务数量
      const runningTasks = [
        this.isRunning,
        // 可以添加其他服务的运行状态检查
      ].filter(Boolean).length

      // 简单的负载计算：基于运行任务数和实例健康状况
      const healthyInstances = Object.values(gptloadService.getMultiInstanceStatus().instances).filter(
        (inst: any) => inst.healthy
      ).length

      // 负载 = 运行任务数 / (健康实例数 + 1)，范围 0-1
      const load = runningTasks / Math.max(healthyInstances, 1)

      return Math.min(load, 1.0)
    } catch (error) {
      console.warn('获取系统负载失败:', error.message)
      return 0.5 // 默认中等负载
    }
  }

  /**
   * 优化聚合分组的权重
   */
  async optimizeAggregateWeights() {
    console.log('⚖️ 开始聚合分组权重优化...')

    try {
      // 检查系统负载
      const systemLoad = await this.getSystemLoad()
      if (systemLoad > 0.8) {
        console.log(`⚠️ 系统负载过高 (${(systemLoad * 100).toFixed(1)}%)，跳过本次权重优化`)
        return
      }

      console.log(`📊 系统负载: ${(systemLoad * 100).toFixed(1)}%，继续权重优化`)

      const allGroups = await gptloadService.getAllGroups()
      const aggregateGroups = allGroups.filter((g) => g.tags?.includes('layer-3'))

      console.log(`📊 发现 ${aggregateGroups.length} 个聚合分组需要检查权重`)

      let updatedCount = 0
      let skippedCount = 0
      let errorCount = 0

      for (const group of aggregateGroups) {
        try {
          const upstreamStats = []

          // 收集每个上游的统计
          for (const upstream of group.upstreams || []) {
            const upstreamGroupName = this.extractGroupNameFromUrl(upstream.url)

            // 根据分组名查找分组ID
            const upstreamGroup = allGroups.find((g) => g.name === upstreamGroupName)
            if (!upstreamGroup) {
              console.warn(`未找到上游分组: ${upstreamGroupName}，使用默认权重`)
              upstreamStats.push({
                url: upstream.url,
                weight: 1,
              })
              continue
            }

            try {
              const stats = await this.getGroupStats(upstreamGroup)

              let weight = 1
              if (stats && stats.hourly_stats) {
                const successRate = 1 - (stats.hourly_stats.failure_rate || 0)
                const avgTime = stats.hourly_stats.avg_response_time || 3000

                // 权重算法：成功率 * 响应时间因子
                const timeFactor = Math.max(0.1, 1 - avgTime / 10000)
                weight = Math.max(1, Math.round(successRate * timeFactor * 100))
              }

              upstreamStats.push({
                url: upstream.url,
                weight: weight,
              })
            } catch (statsError) {
              console.warn(`获取分组 ${upstreamGroup.name} 统计失败: ${statsError.message}，使用默认权重`)
              upstreamStats.push({
                url: upstream.url,
                weight: 1,
              })
            }
          }

          // 检查缓存，避免重复更新相同权重
          const cachedWeights = this.getCachedWeights(group.id)
          if (cachedWeights && this.compareWeights(upstreamStats, cachedWeights)) {
            skippedCount++
            continue // 权重未变化，跳过更新
          }

          // 更新权重
          if (upstreamStats.length > 0) {
            try {
              await gptloadService.updateGroup(group.id, group._instance.id, {
                upstreams: upstreamStats,
              })

              // 更新缓存
              this.updateWeightCache(group.id, upstreamStats)
              updatedCount++

              // 记录权重变化详情
              const weightChanges = upstreamStats.filter((us) => us.weight !== 1).length
              if (weightChanges > 0) {
                console.log(`📊 分组 ${group.name}: ${weightChanges}/${upstreamStats.length} 个上游权重被调整`)
              }

              // 动态调整延迟：根据系统负载决定等待时间
              const currentLoad = await this.getSystemLoad()
              const delayMs = Math.min(50 + currentLoad * 200, 500) // 50-500ms动态延迟
              await new Promise((resolve) => setTimeout(resolve, delayMs))
            } catch (updateError) {
              console.error(`更新分组 ${group.name} 权重失败: ${updateError.message}`)
              errorCount++

              // 如果是网络错误，增加更长的等待时间
              if (updateError.code === 'ECONNRESET' || updateError.message.includes('timeout')) {
                console.log(`⏳ 网络错误，等待2秒后继续...`)
                await new Promise((resolve) => setTimeout(resolve, 2000))
              }
            }
          }
        } catch (groupError) {
          console.error(`优化分组 ${group.name} 权重失败: ${groupError.message}`)
          errorCount++
        }
      }

      console.log(
        `✅ 权重优化完成: 更新了 ${updatedCount} 个分组，跳过了 ${skippedCount} 个分组（权重未变化），${errorCount} 个分组出错`
      )

      // 如果有大量错误，记录警告
      if (errorCount > aggregateGroups.length * 0.3) {
        console.warn(`⚠️ 权重优化中有 ${errorCount} 个分组出错，可能需要检查系统状态`)
      }
    } catch (error) {
      console.error('权重优化失败:', error.message)
    }
  }

  /**
   * 获取分组的统计信息
   */
  async getGroupStats(group) {
    if (!group) {
      return null
    }
    try {
      // 使用 gptload 内置的统计接口
      const instance = gptloadService.manager.getInstance(group._instance.id)
      if (!instance) {
        return null
      }

      const response = await instance.apiClient.get(`/groups/${group.id}/stats`)

      if (response.data && typeof response.data.code === 'number') {
        return response.data.data
      }
      return response.data
    } catch (error) {
      console.error(`获取分组 ${group.name} 统计信息失败:`, error.message)
      return null
    }
  }

  // 工具方法
  generateModelChannelGroupName(model, channelName) {
    return (modelConfig.constructor as any).generateModelChannelGroupName(model, channelName)
  }

  generateIdentityKey(model, channel) {
    return `key-${model}-${channel}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '-')
  }

  generateAggregateKey(model) {
    return (modelConfig.constructor as any).generateAggregateKey(model)
  }

  // 移除重复的sanitizeModelName方法，已迁移到modelConfig
  // sanitizeModelName 方法已在 model-config.ts 中统一实现

  groupModelChannelsByModel(modelChannelGroups) {
    const grouped = new Map()

    for (const group of modelChannelGroups) {
      const model = group.test_model
      if (!grouped.has(model)) {
        grouped.set(model, [])
      }
      grouped.get(model).push(group)
    }

    return grouped
  }

  extractGroupNameFromUrl(url) {
    const match = url.match(/\/proxy\/([^\/]+)/)
    return match ? match[1] : null
  }

  extractModelChannelFromGroupName(groupName) {
    // 从 "model-via-channel" 格式中提取
    const match = groupName.match(/^(.+)-via-(.+)$/)
    return match ? `${match[1]}:${match[2]}` : null
  }

  recordIncompatibleCombination(model, channel) {
    // 记录不兼容的组合，避免重复尝试
    const combination = `${model}:${channel}`
    console.log(`📝 记录不兼容组合: ${combination}`)
  }

  async updateAggregateUpstreams(existingGroup, channelGroups) {
    const newUpstreams = channelGroups.map((cg) => ({
      url: `${cg._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001'}/proxy/${cg.name}`,
      weight: 1,
    }))

    await gptloadService.updateGroup(existingGroup.id, existingGroup._instance.id, { upstreams: newUpstreams })

    console.log(`🔄 更新聚合分组 ${existingGroup.name} 的上游`)
  }

  /**
   * 创建单个聚合分组（从原 createAggregateGroupForModel 方法提取优化）
   */
  async createSingleAggregateGroup(model, channelGroups, config) {
    const groupName = (modelConfig.constructor as any).generateSafeGroupName(model)

    try {
      // 🔧 添加渠道分组验证
      if (!channelGroups || !Array.isArray(channelGroups) || channelGroups.length === 0) {
        console.log(`⚠️ 模型 ${model} 没有有效的支持渠道分组`)
        return null
      }

      // 创建上游列表
      const upstreams = channelGroups
        .filter((cg) => cg && cg.name) // 🔧 过滤无效的渠道分组
        .map((cg) => ({
          url: `${cg._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001'}/proxy/${cg.name}`,
          weight: 1,
        }))

      if (upstreams.length === 0) {
        console.log(`⚠️ 模型 ${model} 没有可用的渠道分组`)
        return null
      }

      // 直接创建第3层聚合分组，而不是通过 createSiteGroup
      // 选择第一个健康的实例用于二三层分组
      const allInstances = gptloadService.manager.getAllInstances()
      const instance = allInstances.find((inst) => inst.health?.healthy)

      if (!instance) {
        throw new Error('没有健康的 gptload 实例可用于创建二三层分组')
      }

      const groupData = {
        name: groupName,
        display_name: `${model} 聚合分组`,
        description: `${model} 模型的聚合分组，汇聚来自多个渠道的请求`,
        upstreams: upstreams,
        test_model: model,
        channel_type: channelGroups[0]?.channel_type || 'openai',
        validation_endpoint: channelGroups[0]?.validation_endpoint || '/v1/chat/completions',
        sort: config.sort, // 第3层分组
        param_overrides: {},
        config: {
          blacklist_threshold: config.blacklist_threshold,
          key_validation_interval_minutes: config.key_validation_interval_minutes,
        },
        tags: ['layer-3', 'aggregate', model],
      }

      console.log(`🔍 创建第3层聚合分组请求参数:`, {
        name: groupData.name,
        display_name: groupData.display_name,
        channel_type: groupData.channel_type,
        validation_endpoint: groupData.validation_endpoint,
        sort: groupData.sort,
        upstreams: groupData.upstreams,
        tags: groupData.tags,
      })

      const response = await instance.apiClient.post('/groups', groupData)

      let created
      if (response.data && typeof response.data.code === 'number') {
        if (response.data.code === 0) {
          created = response.data.data
        } else {
          throw new Error(`创建失败: ${response.data.message}`)
        }
      } else {
        created = response.data
      }

      created._instance = {
        id: instance.id,
        name: instance.name,
        url: instance.url,
      }

      // 获取实例并添加认证密钥
      if (instance && instance.token) {
        await gptloadService.manager.addApiKeysToGroup(instance, created.id, [instance.token])
      }

      return created
    } catch (error) {
      console.error(`❌ 创建模型 ${model} 的聚合分组失败:`, error.message)
      return null
    }
  }

  /**
   * 创建单个模型的聚合分组（兼容性方法，现在使用缓存优化版本）
   */
  async createAggregateGroupForModel(model, supportingChannels) {
    console.log(`🔧 为模型 ${model} 创建单个聚合分组...`)

    // 现在使用优化后的方法，避免重复调用 getAllGroups
    return await this.createSingleAggregateGroup(model, supportingChannels, this.layerConfigs.aggregateGroup)
  }

  /**
   * 获取架构状态
   */
  async getArchitectureStatus() {
    try {
      const allGroups = await gptloadService.getAllGroups()

      const siteGroups = allGroups.filter((g) => g.sort === layerConfigs.siteGroup.sort)
      const modelChannelGroups = allGroups.filter((g) => g.tags?.includes('layer-2'))
      const aggregateGroups = allGroups.filter((g) => g.tags?.includes('layer-3'))

      return {
        layers: {
          layer1: {
            name: '站点分组',
            count: siteGroups.length,
            groups: siteGroups.map((g) => g.name),
          },
          layer2: {
            name: '模型-渠道分组',
            count: modelChannelGroups.length,
            groups: modelChannelGroups.map((g) => g.name),
          },
          layer3: {
            name: '模型聚合分组',
            count: aggregateGroups.length,
            groups: aggregateGroups.map((g) => g.name),
          },
        },
        recovery: {
          scheduled: this.recoverySchedule.size,
          failed: this.failureHistory.size,
        },
      }
    } catch (error) {
      console.error('获取架构状态失败:', error)
      return null
    }
  }

  /**
   * 获取详细架构统计
   */
  async getDetailedArchitectureStats(): Promise<any> {
    return this.getArchitectureStatus()
  }

  /**
   * 手动触发恢复
   */
  async manualRecovery(model, channel) {
    const combination = `${model}:${channel}`
    console.log(`🔧 手动触发恢复: ${combination}`)

    await this.attemptRecovery(combination)
    return this.getRecoveryStatus(combination)
  }

  getRecoveryStatus(combination) {
    return {
      scheduled: this.recoverySchedule.has(combination),
      nextRetry: this.recoverySchedule.get(combination)?.nextRetry,
      failures: this.failureHistory.get(combination)?.failures || 0,
    }
  }

  /**
   * 获取缓存的权重
   */
  getCachedWeights(groupId) {
    return this.weightCache.get(groupId)
  }

  /**
   * 更新权重缓存
   */
  updateWeightCache(groupId, weights) {
    this.weightCache.set(groupId, JSON.parse(JSON.stringify(weights)))
  }

  /**
   * 比较两个权重配置是否相同
   */
  compareWeights(newWeights, cachedWeights) {
    if (!newWeights || !cachedWeights) return false
    if (newWeights.length !== cachedWeights.length) return false

    // 按URL排序后比较
    const sortedNew = [...newWeights].sort((a, b) => a.url.localeCompare(b.url))
    const sortedCached = [...cachedWeights].sort((a, b) => a.url.localeCompare(b.url))

    for (let i = 0; i < sortedNew.length; i++) {
      if (sortedNew[i].url !== sortedCached[i].url) {
        return false
      }

      // 权重变化容忍度：如果变化小于5%，认为相同
      const weightDiff = Math.abs(sortedNew[i].weight - sortedCached[i].weight)
      const tolerance = Math.max(sortedCached[i].weight * 0.05, 1) // 5%容忍度，最小1

      if (weightDiff > tolerance) {
        return false
      }
    }

    return true
  }

  /**
   * 停止服务
   */
  stop() {
    // 清理所有定时器
    const timers = ['weightOptimizationTimer', 'emergencyOptimizationTimer']

    timers.forEach((timerName) => {
      if (this[timerName]) {
        clearInterval(this[timerName])
        this[timerName] = null
        console.log(`🛑 已清理定时器: ${timerName}`)
      }
    })

    // 清理缓存等资源
    if (this.weightCache) {
      this.weightCache.clear()
    }

    console.log('🛑 三层架构管理器已停止')
  }

  /**
   * 从分组名称中提取模型名
   */
  extractModelFromGroupName(groupName) {
    // 处理 "model-via-channel" 格式
    const viaMatch = groupName.match(/^(.+)-via-(.+)$/)
    if (viaMatch) {
      return viaMatch[1]
    }

    // 处理其他格式
    const parts = groupName.split('-')
    if (parts.length >= 2) {
      // 假设模型名是前几个部分
      return parts.slice(0, -1).join('-')
    }

    return groupName
  }

  /**
   * 从第2层分组中提取渠道名
   */
  extractChannelFromLayer2Group(group) {
    // 方法1: 从分组名称提取
    const viaMatch = group.name.match(/^(.+)-via-(.+)$/)
    if (viaMatch) {
      return viaMatch[2]
    }

    // 方法2: 从上游URL提取
    if (group.upstreams && group.upstreams.length > 0) {
      const upstream = group.upstreams[0]
      const proxyMatch = upstream.url.match(/\/proxy\/([^\/\?]+)/)
      if (proxyMatch) {
        return proxyMatch[1]
      }
    }

    // 方法3: 从标签提取
    if (group.tags) {
      // 寻找可能是渠道名的标签
      const possibleChannels = group.tags.filter((tag) => !['layer-2', 'model-channel'].includes(tag) && tag.length > 2)

      if (possibleChannels.length > 0) {
        return possibleChannels[possibleChannels.length - 1] // 取最后一个，通常是渠道名
      }
    }

    return 'unknown'
  }
}

// 导出单例
const threeLayerArchitecture = new ThreeLayerArchitecture()

// 优雅关闭
process.on('SIGINT', () => {
  threeLayerArchitecture.stop()
})

process.on('SIGTERM', () => {
  threeLayerArchitecture.stop()
})

export default threeLayerArchitecture
