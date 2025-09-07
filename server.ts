import express, { Request, Response } from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
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
import { TempGroupCleaner } from './src/temp-group-cleaner'
import { layerConfigs } from './src/layer-configs'
import {
  initializeServices,
  validateServiceRegistration,
  cleanupServices,
  getService,
} from './src/services/service-factory'

// ES Module 中 __dirname 的替代方案
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT: number = parseInt(process.env.PORT || '3002', 10)

// 中间件
app.use(cors())
app.use(express.json())
// 动态计算 public 目录的路径，以兼容开发和生产模式
const publicPath = path.join(__dirname, __dirname.endsWith('dist') ? '../public' : 'public')
app.use(express.static(publicPath))

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
      // 将所有业务逻辑委托给站点配置服务处理
      const result = await siteConfigurationService.processSiteConfiguration(req.body);

      // 根据服务返回的结果，向前端发送响应
      if (result.success) {
        res.json(result);
      } else {
        // 如果处理失败，返回 400 错误
        res.status(400).json({
          success: false,
          error: result.message,
          details: result.data
        });
      }
    } catch (error) {
      console.error('处理AI站点时发生意外错误:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误',
        details: error.message,
      });
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
    const siteGroups = allGroups.filter((g) => g.sort === layerConfigs.siteGroup.sort)
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

// 维护脚本：删除所有二三层分组 (sort=40/sort=30) 并清理uni-api配置
app.post('/api/maintenance/delete-model-groups', async (req, res) => {
  console.log(`🚨 开始执行维护任务：删除所有二三层分组 (sort=${layerConfigs.aggregateGroup.sort}/sort=${layerConfigs.modelChannelGroup.sort})`)

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

// 重新分配渠道实例
app.post('/api/channels/reassign', async (req, res) => {
  try {
    const { channelName, action } = req.body

    if (!channelName || !action || !['promote', 'demote'].includes(action)) {
      return res.status(400).json({ success: false, message: '参数无效: 需要 channelName 和 action (promote/demote)' })
    }

    const result = await gptloadService.reassignChannelInstance(channelName, action)
    res.json({
      success: true,
      message: `渠道 ${channelName} 已成功${action === 'promote' ? '提级' : '降级'}到实例 ${result.newInstanceName}`,
      data: result,
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// 临时分组清理API
// 获取临时分组统计
app.get('/api/temp-groups/stats', async (req, res) => {
  try {
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

app.listen(PORT, async () => {
  console.log(`🚀 uni-load 服务器启动成功`)
  console.log(`📍 访问地址: http://localhost:${PORT}`)
  console.log(`🔗 gptload: ${process.env.GPTLOAD_URL || 'http://localhost:3001'}`)
  console.log(`🔗 uni-api: ${process.env.UNI_API_PATH || '../uni-api'}`)

  // 初始化依赖注入服务
  try {
    await initializeServices()
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
