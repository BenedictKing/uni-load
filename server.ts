import express, { Request, Response } from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { ProcessAiSiteRequest, ApiResponse, CleanupOptions, ApiErrorResponse } from './src/types'

// 按优先级加载环境变量：.env.local > .env
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import gptloadService from './src/gptload'
import modelsService from './src/models'
import yamlManager from './src/yaml-manager'
import modelSyncService from './src/model-sync'
import channelHealthMonitor from './src/channel-health'
import channelCleanupService from './src/channel-cleanup'
import threeLayerArchitecture from './src/three-layer-architecture'
import siteConfigurationService from './src/services/site-configuration'
import { initializeServices, validateServiceRegistration, cleanupServices, getService } from './src/services/service-factory'

const app = express()
const PORT: number = parseInt(process.env.PORT || '3002', 10)

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// 预览站点名称的API端点
app.post('/api/preview-site-name', (req: Request, res: Response) => {
  try {
    let { baseUrl } = req.body

    if (!baseUrl) {
      return res.status(400).json({ error: '需要提供 baseUrl' })
    }

    // 规范化baseUrl：移除末尾的斜杠
    baseUrl = baseUrl.replace(/\/+$/, '')

    const siteName = siteConfigurationService.generateSiteNameFromUrl(baseUrl)
    res.json({ siteName })
  } catch (error) {
    res.status(400).json({ error: '无效的 URL 格式' })
  }
})

// API 路由
app.post(
  '/api/process-ai-site',
  async (req: Request<{}, any, ProcessAiSiteRequest>, res: Response<ApiResponse | ApiErrorResponse>) => {
    try {
      let { baseUrl, apiKeys, channelTypes, customValidationEndpoints, models: manualModels } = req.body

      if (!baseUrl) {
        return res.status(400).json({
          error: '参数不完整：需要 baseUrl',
        })
      }

      // 规范化baseUrl：移除末尾的斜杠
      baseUrl = baseUrl.replace(/\/+$/, '')
      console.log(`📝 规范化后的baseUrl: ${baseUrl}`)

      // apiKeys 现在是可选的，如果为空或未提供，后续处理中会跳过密钥更新
      const hasNewApiKeys = apiKeys && Array.isArray(apiKeys) && apiKeys.length > 0

      if (!hasNewApiKeys) {
        console.log('⚠️ 未提供新的API密钥，将保持现有密钥不变')
      }

      // 验证和处理 channelTypes
      const validChannelTypes = ['openai', 'anthropic', 'gemini']
      let selectedChannelTypes = channelTypes

      // 如果没有提供 channelTypes，默认使用 openai（向后兼容）
      if (!selectedChannelTypes || !Array.isArray(selectedChannelTypes)) {
        selectedChannelTypes = ['openai']
      }

      // 验证所有选择的类型都是有效的
      const invalidTypes = selectedChannelTypes.filter((type) => !validChannelTypes.includes(type))
      if (invalidTypes.length > 0) {
        return res.status(400).json({
          error: `无效的 channelTypes：${invalidTypes.join(', ')}，支持的类型：${validChannelTypes.join(', ')}`,
        })
      }

      if (selectedChannelTypes.length === 0) {
        return res.status(400).json({
          error: '请至少选择一种API格式类型',
        })
      }

      // 自动生成站点名称
      let siteName
      try {
        siteName = siteConfigurationService.generateSiteNameFromUrl(baseUrl)
      } catch (error) {
        return res.status(400).json({
          error: '无效的 baseUrl 格式，无法生成站点名称',
        })
      }

      console.log(`开始处理AI站点：${siteName} (${baseUrl})，格式：${selectedChannelTypes.join(', ')}`)
      console.log(`自动生成的站点名称：${siteName}`)

      // 步骤1：获取或使用指定的模型列表
      let allModels
      let successfulInstance = null

      // 检查是否提供了手动模型列表
      if (manualModels && Array.isArray(manualModels) && manualModels.length > 0) {
        console.log(`🎯 使用手动指定的模型列表 (${manualModels.length} 个模型)`)
        allModels = manualModels
        console.log('手动模型列表:', manualModels.map((m) => m.id || m).join(', '))
      } else if (hasNewApiKeys) {
        // 有新密钥且未提供手动模型，尝试使用多实例获取模型
        console.log('获取模型列表...')
        console.log('尝试通过多个gptload实例获取模型...')

        try {
          const result = await gptloadService.manager.getModelsViaMultiInstance(baseUrl, apiKeys[0])
          allModels = result.models
          successfulInstance = result.instanceId
          console.log(`✅ 实例 ${result.instanceName} 成功获取 ${allModels.length} 个模型`)
        } catch (error) {
          console.error('多实例获取模型失败:', error.message)

          // 回退到直接调用（兼容性）
          console.log('回退到直接调用模型接口...')
          try {
            allModels = await modelsService.getModels(baseUrl, apiKeys[0], 3)
          } catch (fallbackError) {
            return res.status(400).json({
              error: '所有方式都无法获取模型列表',
              details: {
                multiInstanceError: error.message,
                directCallError: fallbackError.message,
              },
            })
          }
        }
      } else {
        // 没有新密钥，检查是否提供了手动模型列表
        if (manualModels && Array.isArray(manualModels) && manualModels.length > 0) {
          console.log(`🎯 使用手动指定的模型列表 (${manualModels.length} 个模型)`)
          allModels = manualModels
          console.log('手动模型列表:', manualModels.map((m) => m.id || m).join(', '))
        } else {
          // 没有新密钥也没有手动模型，需要从现有渠道分组中获取密钥来获取模型
          console.log('尝试从现有渠道配置中获取API密钥...')
          const channelName = `${siteName}-${selectedChannelTypes[0]}`

          console.log(`🔍 查找渠道分组: ${channelName}`)

          // 查找现有的渠道分组
          const allGroups = await gptloadService.getAllGroups()
          console.log(`📊 总共获取到 ${allGroups.length} 个分组`)

          // 添加调试：列出所有可能匹配的分组
          const possibleMatches = allGroups.filter(
            (g) => g.name && (g.name.includes(siteName) || g.name === channelName)
          )
          console.log(
            `🔍 可能匹配的分组 (包含 "${siteName}"):`,
            possibleMatches.map((g) => ({
              name: g.name,
              sort: g.sort,
              instance: g._instance?.name,
            }))
          )

          // 精确查找
          const exactMatch = allGroups.find((g) => g.name === channelName)
          console.log(
            `🎯 精确匹配的分组 "${channelName}":`,
            exactMatch
              ? {
                  name: exactMatch.name,
                  sort: exactMatch.sort,
                  instance: exactMatch._instance?.name,
                  hasUpstreams: exactMatch.upstreams?.length > 0,
                }
              : '未找到'
          )

          // 如果精确匹配失败，尝试模糊匹配
          let existingChannel = exactMatch
          if (!existingChannel) {
            console.log(`⚠️ 精确匹配失败，尝试模糊匹配...`)
            // 查找包含站点名的所有分组
            const fuzzyMatches = allGroups.filter(
              (g) => g.name && g.name.includes(siteName) && g.name.includes(selectedChannelTypes[0])
            )

            console.log(
              `🔍 模糊匹配结果:`,
              fuzzyMatches.map((g) => ({
                name: g.name,
                sort: g.sort,
                instance: g._instance?.name,
              }))
            )

            if (fuzzyMatches.length > 0) {
              existingChannel = fuzzyMatches[0]
              console.log(`✅ 使用模糊匹配的分组: ${existingChannel.name}`)
            }

            if (!existingChannel) {
              return res.status(400).json({
                error: `首次配置渠道时必须提供API密钥`,
                details: {
                  searchedChannelName: channelName,
                  siteName: siteName,
                  totalGroupsFound: allGroups.length,
                  possibleMatches: possibleMatches.length,
                },
              })
            }
          }

          // 获取现有渠道的API密钥
          console.log(`🔑 尝试获取分组 ${existingChannel.name} 的API密钥 (实例: ${existingChannel._instance?.name})`)

          const existingKeys = await gptloadService.getGroupApiKeys(existingChannel.id, existingChannel._instance.id)

          console.log(`📋 获取到 ${existingKeys.length} 个API密钥`)

          if (existingKeys.length > 0) {
            console.log(`✅ 使用现有渠道的API密钥 (${existingKeys.length} 个)`)

            // 对于现有渠道，也尝试多实例获取模型
            try {
              const result = await gptloadService.manager.getModelsViaMultiInstance(baseUrl, existingKeys[0])
              allModels = result.models
              successfulInstance = result.instanceId
              console.log(`✅ 实例 ${result.instanceName} 成功获取现有渠道的 ${allModels.length} 个模型`)
            } catch (error) {
              console.log('多实例获取失败，回退到直接调用:', error.message)
              allModels = await modelsService.getModels(baseUrl, existingKeys[0], 3)
            }
          } else {
            return res.status(400).json({
              error: `现有渠道 ${existingChannel.name} 没有可用的API密钥，且未提供新的API密钥`,
              details: {
                channelName: existingChannel.name,
                instance: existingChannel._instance?.name,
                keysFound: existingKeys.length,
              },
            })
          }
        }
      }

      // 检查是否成功获取模型
      if (!allModels || allModels.length === 0) {
        // 处理空模型列表的情况：清理上层分组但保留渠道分组
        console.log('⚠️ 站点返回空模型列表，开始清理上层分组引用...')
        const channelName = `${siteName}-${selectedChannelTypes[0]}`

        try {
          const cleanupResult = await gptloadService.handleEmptyModelList(channelName)
          console.log('🧹 清理结果:', cleanupResult)

          return res.json({
            success: true,
            message: `站点 ${siteName} 返回空模型列表，已保留渠道分组但清理了上层引用`,
            data: {
              siteName,
              baseUrl,
              channelTypes: selectedChannelTypes,
              emptyModelListHandling: true,
              cleanupResult,
            },
          })
        } catch (cleanupError) {
          console.error('清理上层分组失败:', cleanupError)
          return res.status(400).json({
            error: '站点返回空模型列表且清理失败',
            details: cleanupError.message,
          })
        }
      }

      // 应用白名单过滤
      const models = modelsService.filterModels(allModels)

      if (models.length === 0) {
        console.log(`发现 ${allModels.length} 个模型，但白名单过滤后为空`)
        return res.status(400).json({
          error: '白名单过滤后没有可用模型',
          details: `原始模型数量: ${allModels.length}，过滤后: 0`,
        })
      }

      console.log(`发现 ${allModels.length} 个模型，白名单过滤后剩余 ${models.length} 个模型`)

      // 步骤2：为每种格式创建站点分组（第一层）
      console.log('创建站点分组...')
      const siteGroups = []
      let groupsCreated = 0

      // 如果有成功的实例，预先分配站点到该实例
      if (successfulInstance) {
        const instance = gptloadService.manager.getInstance(successfulInstance)
        if (instance) {
          console.log(`🎯 预分配站点 ${baseUrl} 到成功实例 ${instance.name}`)
          gptloadService.manager.siteAssignments.set(baseUrl, successfulInstance)
        }
      }

      for (const channelType of selectedChannelTypes) {
        try {
          const siteGroup = await gptloadService.createSiteGroup(
            siteName,
            baseUrl,
            apiKeys,
            channelType,
            customValidationEndpoints,
            models
          )
          if (siteGroup && siteGroup.name) {
            siteGroups.push(siteGroup)
            groupsCreated++
            console.log(`✅ ${channelType} 格式站点分组创建成功 (实例: ${siteGroup._instance?.name})`)
          } else {
            console.error(`❌ ${channelType} 格式站点分组创建返回无效数据:`, siteGroup)
          }
        } catch (error) {
          console.error(`❌ ${channelType} 格式站点分组创建失败:`, error.message)
          // 继续处理其他格式，不中断整个流程
        }
      }

      if (siteGroups.length === 0) {
        return res.status(500).json({ error: '所有格式的站点分组都创建失败' })
      }

      // 步骤3：创建或更新模型分组（第二层），将所有站点分组添加为上游
      console.log('创建/更新模型分组...')
      const modelGroups = await gptloadService.createOrUpdateModelGroups(models, siteGroups)

      // 步骤4：更新 uni-api 配置，指向模型分组
      console.log('更新 uni-api 配置...')
      await yamlManager.updateUniApiConfig(modelGroups)

      res.json({
        success: true,
        message: `成功配置AI站点 ${siteName}`,
        data: {
          siteName,
          baseUrl,
          channelTypes: selectedChannelTypes,
          groupsCreated,
          modelsCount: models.length,
          models: models,
          siteGroups: siteGroups,
          modelGroups: modelGroups.length,
          usingManualModels: !!(manualModels && manualModels.length > 0),
          successfulInstance: successfulInstance
            ? {
                id: successfulInstance,
                name: gptloadService.manager.getInstance(successfulInstance)?.name,
              }
            : null,
        },
      })
    } catch (error) {
      console.error('处理AI站点时出错:', error)
      res.status(500).json({
        error: '服务器内部错误',
        details: error.message,
      })
    }
  }
)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 获取当前配置状态
app.get('/api/status', async (req, res) => {
  try {
    const gptloadStatus = await gptloadService.getStatus()
    const uniApiStatus = await yamlManager.getStatus()
    const modelSyncStatus = modelSyncService.getStatus()
    const channelHealthStatus = channelHealthMonitor.getStatus()
    const channelCleanupStatus = channelCleanupService.getStatus()

    res.json({
      gptload: gptloadStatus,
      uniApi: uniApiStatus,
      modelSync: modelSyncStatus,
      channelHealth: channelHealthStatus,
      channelCleanup: channelCleanupStatus,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 手动触发模型同步
app.post('/api/sync-models', async (req, res) => {
  try {
    // 异步执行，立即返回
    modelSyncService.syncAllModels().catch((error) => {
      console.error('手动模型同步失败:', error)
    })

    res.json({
      success: true,
      message: '模型同步已开始，请查看控制台日志了解进度',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 控制模型同步服务
app.post('/api/sync-models/control', (req, res) => {
  try {
    const { action } = req.body

    switch (action) {
      case 'start':
        modelSyncService.start()
        res.json({ success: true, message: '模型同步服务已启动' })
        break
      case 'stop':
        modelSyncService.stop()
        res.json({ success: true, message: '模型同步服务已停止' })
        break
      default:
        res.status(400).json({ error: '无效的操作，支持: start, stop' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取所有站点分组
app.get('/api/channels/site-groups', async (req, res) => {
  try {
    const allGroups = await gptloadService.getAllGroups()
    // 假设站点分组的 sort 值为 20
    const siteGroups = allGroups.filter((g) => g.sort === 20)
    res.json({ siteGroups })
  } catch (error) {
    res.status(500).json({ error: '获取站点分组失败', details: error.message })
  }
})

// 手动触发渠道健康检查
app.post('/api/check-channels', async (req, res) => {
  try {
    // 异步执行，立即返回
    channelHealthMonitor.checkChannelHealth().catch((error) => {
      console.error('手动渠道健康检查失败:', error)
    })

    res.json({
      success: true,
      message: '渠道健康检查已开始，请查看控制台日志了解进度',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 控制渠道健康监控服务
app.post('/api/check-channels/control', (req, res) => {
  try {
    const { action } = req.body

    switch (action) {
      case 'start':
        channelHealthMonitor.start()
        res.json({ success: true, message: '渠道健康监控已启动' })
        break
      case 'stop':
        channelHealthMonitor.stop()
        res.json({ success: true, message: '渠道健康监控已停止' })
        break
      default:
        res.status(400).json({ error: '无效的操作，支持: start, stop' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取失败的渠道列表
app.get('/api/failed-channels', (req, res) => {
  try {
    const failedChannels = channelHealthMonitor.getFailedChannels()
    res.json({ failedChannels })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 重置渠道失败计数
app.post('/api/reset-channel-failures', (req, res) => {
  try {
    const { channelName } = req.body
    channelHealthMonitor.resetChannelFailures(channelName)

    res.json({
      success: true,
      message: channelName ? `已重置渠道 ${channelName} 的失败计数` : '已重置所有渠道的失败计数',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 初始化三层架构
app.post('/api/initialize-architecture', async (req, res) => {
  try {
    const result = await threeLayerArchitecture.initialize()

    res.json({
      success: true,
      message: '三层架构初始化成功',
      result,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取架构状态
app.get('/api/architecture-status', async (req, res) => {
  try {
    const status = await threeLayerArchitecture.getArchitectureStatus()
    res.json(status)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 手动触发架构恢复
app.post('/api/manual-recovery/:model/:channel', async (req, res) => {
  try {
    const { model, channel } = req.params
    const result = await threeLayerArchitecture.manualRecovery(model, channel)

    res.json({
      success: true,
      message: `已触发 ${model}:${channel} 的手动恢复`,
      result,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取多实例状态
app.get('/api/multi-instances', (req, res) => {
  try {
    const status = gptloadService.getMultiInstanceStatus()
    res.json(status)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// API探测功能
app.post('/api/probe-api', async (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body

    if (!baseUrl) {
      return res.status(400).json({ error: '需要提供 baseUrl' })
    }

    const modelsService = require('./src/models')
    const result = await modelsService.probeApiStructure(baseUrl, apiKey)

    res.json({
      success: true,
      baseUrl,
      probeResult: result,
    })
  } catch (error) {
    res.status(500).json({
      error: 'API探测失败',
      details: error.message,
    })
  }
})

// 手动触发多实例健康检查
app.post('/api/check-instances', async (req, res) => {
  try {
    // 异步执行，立即返回
    gptloadService
      .checkAllInstancesHealth()
      .then((results) => {
        console.log('✅ 多实例健康检查完成')
      })
      .catch((error) => {
        console.error('❌ 多实例健康检查失败:', error)
      })

    res.json({
      success: true,
      message: '多实例健康检查已开始，请查看控制台日志了解进度',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 重新分配站点到指定实例
app.post('/api/reassign-site', async (req, res) => {
  try {
    const { siteUrl, instanceId } = req.body

    if (!siteUrl) {
      return res.status(400).json({ error: '需要提供 siteUrl' })
    }

    await gptloadService.reassignSite(siteUrl, instanceId)

    res.json({
      success: true,
      message: instanceId
        ? `已将站点 ${siteUrl} 分配到实例 ${instanceId}`
        : `已清除站点 ${siteUrl} 的分配，将重新自动分配`,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 预览渠道清理（试运行）
app.post('/api/cleanup-channels/preview', async (req, res) => {
  try {
    const options = req.body || {}

    const results = await channelCleanupService.previewCleanup(options)

    res.json({
      success: true,
      message: '预览完成',
      results,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 执行渠道清理
app.post('/api/cleanup-channels', async (req, res) => {
  try {
    const options = req.body || {}

    // 异步执行，立即返回
    channelCleanupService
      .cleanupDisconnectedChannels(options)
      .then((results) => {
        console.log('✅ 渠道清理完成:', results)
      })
      .catch((error) => {
        console.error('❌ 渠道清理失败:', error)
      })

    res.json({
      success: true,
      message: '渠道清理已开始，请查看控制台日志了解进度',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 手动清理指定渠道
app.post('/api/cleanup-channels/manual', async (req, res) => {
  try {
    const { channelNames, dryRun = false } = req.body

    if (!channelNames || !Array.isArray(channelNames) || channelNames.length === 0) {
      return res.status(400).json({ error: '需要提供渠道名称数组' })
    }

    const results = await channelCleanupService.manualCleanupChannels(channelNames, dryRun)

    res.json({
      success: true,
      message: `${dryRun ? '预览' : '清理'}完成`,
      results,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取清理历史
app.get('/api/cleanup-history', (req, res) => {
  try {
    const history = channelCleanupService.getCleanupHistory()
    res.json({ history })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取三层架构详细统计
app.get('/api/architecture-stats', async (req, res) => {
  try {
    const stats = await threeLayerArchitecture.getDetailedArchitectureStats()

    res.json({
      success: true,
      message: '架构统计分析完成',
      data: stats,
    })
  } catch (error) {
    res.status(500).json({
      error: '获取架构统计失败',
      details: error.message,
    })
  }
})

// 维护脚本：删除所有二三层分组 (sort=10/sort=15) 并清理uni-api配置
app.post('/api/maintenance/delete-model-groups', async (req, res) => {
  console.log('🚨 开始执行维护任务：删除所有二三层分组 (sort=10/sort=15)')

  try {
    const results = await modelSyncService.cleanupAndResetModels()

    // 增强响应信息
    const successMessage = `操作完成：成功删除 ${results.deletedGroups} 个分组，失败 ${results.failedGroups} 个，清理了 ${results.cleanedProviders} 个uni-api配置`
    const detailedResults = {
      deletedGroups: results.deletedGroups,
      failedGroups: results.failedGroups,
      cleanedProviders: results.cleanedProviders,
      errors: results.errors,
    }

    res.json({
      success: true,
      message: successMessage,
      results: detailedResults,
    })
  } catch (error) {
    console.error('清理操作失败:', error)
    res.status(500).json({
      error: '清理操作失败',
      details: error.message,
    })
  }
})

// 删除指定的渠道
app.delete('/api/channels/:channelName', async (req, res) => {
  try {
    const { channelName } = req.params
    if (!channelName) {
      return res.status(400).json({ error: '需要提供渠道名称' })
    }

    const results = await gptloadService.deleteChannelCompletely(channelName)

    if (results.errors.length > 0 && !results.deletedSiteGroup) {
      return res.status(500).json({
        success: false,
        message: `删除渠道 ${channelName} 失败`,
        data: results,
      })
    }

    res.json({
      success: true,
      message: `渠道 ${channelName} 删除操作完成`,
      data: results,
    })
  } catch (error) {
    console.error(`删除渠道时发生严重错误:`, error)
    res.status(500).json({ error: '服务器内部错误', details: error.message })
  }
})

// 临时分组清理API
// 获取临时分组统计
app.get('/api/temp-groups/stats', async (req, res) => {
  try {
    const { TempGroupCleaner } = require('./src/temp-group-cleaner')
    const cleaner = new TempGroupCleaner(gptloadService.getMultiGPTLoadManager())

    const stats = await cleaner.getTempGroupsStats()

    res.json({
      success: true,
      message: '临时分组统计完成',
      data: stats,
    })
  } catch (error) {
    res.status(500).json({
      error: '获取临时分组统计失败',
      details: error.message,
    })
  }
})

// 清理所有临时分组
app.post('/api/temp-groups/cleanup', async (req, res) => {
  try {
    const { TempGroupCleaner } = require('./src/temp-group-cleaner')
    const cleaner = new TempGroupCleaner(gptloadService.getMultiGPTLoadManager())

    const results = await cleaner.cleanupAllTempGroups()

    res.json({
      success: true,
      message: `临时分组清理完成，共清理 ${results.totalCleaned} 个分组`,
      data: results,
    })
  } catch (error) {
    res.status(500).json({
      error: '清理临时分组失败',
      details: error.message,
    })
  }
})

// 清理过期临时分组（默认24小时前创建的）
app.post('/api/temp-groups/cleanup-old', async (req, res) => {
  try {
    const { hoursOld = 24 } = req.body
    const { TempGroupCleaner } = require('./src/temp-group-cleaner')
    const cleaner = new TempGroupCleaner(gptloadService.getMultiGPTLoadManager())

    const results = await cleaner.cleanupOldTempGroups(hoursOld)

    res.json({
      success: true,
      message: `过期临时分组清理完成，共清理 ${results.totalCleaned} 个分组`,
      data: results,
    })
  } catch (error) {
    res.status(500).json({
      error: '清理过期临时分组失败',
      details: error.message,
    })
  }
})

// 优雅退出处理
const gracefulShutdown = () => {
  console.log('\n🔄 正在优雅关闭服务器...')

  // 停止所有服务
  try {
    if (process.env.ENABLE_MODEL_SYNC !== 'false') {
      console.log('🛑 停止模型同步服务...')
      modelSyncService.stop()
    }

    if (process.env.ENABLE_CHANNEL_HEALTH !== 'false') {
      console.log('🛑 停止渠道健康监控...')
      channelHealthMonitor.stop()
    }

    // 清理依赖注入容器
    console.log('🛑 清理依赖注入容器...')
    cleanupServices()

    console.log('✅ 所有服务已停止')
  } catch (error) {
    console.error('❌ 停止服务时出错:', error)
  }

  console.log('👋 服务器已关闭')
  process.exit(0)
}

// 监听进程退出信号
process.on('SIGINT', gracefulShutdown) // Ctrl+C
process.on('SIGTERM', gracefulShutdown) // 终止信号
process.on('SIGQUIT', gracefulShutdown) // 退出信号

app.listen(PORT, () => {
  console.log(`🚀 uni-load 服务器启动成功`)
  console.log(`📍 访问地址: http://localhost:${PORT}`)
  console.log(`🔗 gptload: ${process.env.GPTLOAD_URL || 'http://localhost:3001'}`)
  console.log(`🔗 uni-api: ${process.env.UNI_API_PATH || '../uni-api'}`)

  // 初始化依赖注入服务
  try {
    initializeServices()
    if (validateServiceRegistration()) {
      console.log('✅ 依赖注入系统初始化成功')
    } else {
      console.warn('⚠️ 依赖注入系统初始化不完整，某些服务可能无法正常工作')
    }
  } catch (error) {
    console.error('❌ 依赖注入系统初始化失败:', error.message)
    console.warn('⚠️ 继续使用传统服务实例化方式')
  }

  // 启动模型同步服务
  if (process.env.ENABLE_MODEL_SYNC !== 'false') {
    console.log(`🔄 启动模型同步服务...`)
    modelSyncService.start()
  } else {
    console.log(`⚠️ 模型同步服务已禁用 (ENABLE_MODEL_SYNC=false)`)
  }

  // 启动渠道健康监控
  if (process.env.ENABLE_CHANNEL_HEALTH !== 'false') {
    console.log(`🩺 启动渠道健康监控...`)
    channelHealthMonitor.start()
  } else {
    console.log(`⚠️ 渠道健康监控已禁用 (ENABLE_CHANNEL_HEALTH=false)`)
  }

  // 启动三层架构管理器
  if (process.env.ENABLE_MODEL_OPTIMIZER !== 'false') {
    console.log(`🏗️  启动三层架构管理器...`)
    threeLayerArchitecture
      .initialize()
      .then((result) => {
        console.log(`✅ 三层架构初始化成功: ${JSON.stringify(result)}`)
      })
      .catch((error) => {
        console.error('三层架构初始化失败:', error)
      })
  } else {
    console.log(`⚠️ 三层架构管理器已禁用 (ENABLE_MODEL_OPTIMIZER=false)`)
  }
})
