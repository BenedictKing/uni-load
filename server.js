const express = require('express');
const cors = require('cors');
const path = require('path');

// 按优先级加载环境变量：.env.local > .env
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const gptloadService = require('./src/gptload');
const modelsService = require('./src/models');
const yamlManager = require('./src/yaml-manager');
const modelSyncService = require('./src/model-sync');
const channelHealthMonitor = require('./src/channel-health');
const channelCleanupService = require('./src/channel-cleanup');

const app = express();
const PORT = process.env.PORT || 3002;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 自动生成站点名称的函数
function generateSiteNameFromUrl(baseUrl) {
  try {
    // 确保URL有协议前缀
    let url = baseUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    
    // 移除常见的前缀
    hostname = hostname.replace(/^(www\.|api\.|openai\.|claude\.)/, '');
    
    // 处理域名规则
    let siteName = hostname;
    
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      // 对于多级域名，优先选择有意义的子域名
      if (parts.length >= 3) {
        // 如果有3级或更多域名，优先选择第一个子域名（通常是服务名）
        // 例如：ai.luckylu71.qzz.io -> luckylu71
        // 但如果第一个是通用前缀，则选择第二个
        const firstPart = parts[0];
        const secondPart = parts[1];
        
        // 常见的通用前缀
        const commonPrefixes = ['api', 'www', 'app', 'admin', 'service'];
        
        // 检查 firstPart 是否为通用前缀或以通用前缀开头
        const isCommonPrefix = commonPrefixes.some(prefix => 
          firstPart === prefix || firstPart.startsWith(prefix + '-')
        );

        if (isCommonPrefix && secondPart) {
          siteName = secondPart;
        } else if (firstPart && firstPart.length > 2) {
          // 如果第一个部分不是通用前缀且长度合理，使用它
          siteName = firstPart;
        } else {
          // 否则使用第二个部分
          siteName = secondPart || parts[parts.length - 2];
        }
      } else {
        // 只有2级域名，取主域名
        siteName = parts[parts.length - 2];
      }
    }
    
    // 转换规则：
    // 1. 转为小写
    // 2. 替换 . 为 -
    // 3. 只保留字母、数字和连字符
    // 4. 移除开头和结尾的连字符
    siteName = siteName
      .toLowerCase()
      .replace(/\./g, '-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-'); // 合并多个连续的连字符
    
    // 确保长度在合理范围内 (3-30字符)
    if (siteName.length < 3) {
      siteName = siteName + '-ai';
    }
    if (siteName.length > 30) {
      siteName = siteName.substring(0, 30).replace(/-+$/, '');
    }
    
    return siteName;
  } catch (error) {
    throw new Error('Invalid URL format');
  }
}

// 预览站点名称的API端点
app.post('/api/preview-site-name', (req, res) => {
  try {
    const { baseUrl } = req.body;
    
    if (!baseUrl) {
      return res.status(400).json({ error: '需要提供 baseUrl' });
    }

    const siteName = generateSiteNameFromUrl(baseUrl);
    res.json({ siteName });
  } catch (error) {
    res.status(400).json({ error: '无效的 URL 格式' });
  }
});

// API 路由
app.post('/api/process-ai-site', async (req, res) => {
  try {
    const { baseUrl, apiKeys, channelTypes, validationEndpoint } = req.body;
    
    if (!baseUrl || !apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
      return res.status(400).json({ 
        error: '参数不完整：需要 baseUrl 和 apiKeys 数组' 
      });
    }

    // 验证和处理 channelTypes
    const validChannelTypes = ['openai', 'anthropic', 'gemini'];
    let selectedChannelTypes = channelTypes;
    
    // 如果没有提供 channelTypes，默认使用 openai（向后兼容）
    if (!selectedChannelTypes || !Array.isArray(selectedChannelTypes)) {
      selectedChannelTypes = ['openai'];
    }
    
    // 验证所有选择的类型都是有效的
    const invalidTypes = selectedChannelTypes.filter(type => !validChannelTypes.includes(type));
    if (invalidTypes.length > 0) {
      return res.status(400).json({ 
        error: `无效的 channelTypes：${invalidTypes.join(', ')}，支持的类型：${validChannelTypes.join(', ')}` 
      });
    }
    
    if (selectedChannelTypes.length === 0) {
      return res.status(400).json({ 
        error: '请至少选择一种API格式类型' 
      });
    }

    // 自动生成站点名称
    let siteName;
    try {
      siteName = generateSiteNameFromUrl(baseUrl);
    } catch (error) {
      return res.status(400).json({ 
        error: '无效的 baseUrl 格式，无法生成站点名称' 
      });
    }

    console.log(`开始处理AI站点：${siteName} (${baseUrl})，格式：${selectedChannelTypes.join(', ')}`);
    console.log(`自动生成的站点名称：${siteName}`);
    
    // 步骤1：获取AI站点支持的模型
    console.log('获取模型列表...');
    const allModels = await modelsService.getModels(baseUrl, apiKeys[0]);
    
    if (!allModels || allModels.length === 0) {
      return res.status(400).json({ error: '无法获取模型列表或模型列表为空' });
    }
    
    // 应用白名单过滤
    const models = modelsService.filterModels(allModels);
    
    if (models.length === 0) {
      console.log(`发现 ${allModels.length} 个模型，但白名单过滤后为空`);
      return res.status(400).json({ 
        error: '白名单过滤后没有可用模型', 
        details: `原始模型数量: ${allModels.length}，过滤后: 0` 
      });
    }
    
    console.log(`发现 ${allModels.length} 个模型，白名单过滤后剩余 ${models.length} 个模型`);

    // 步骤2：为每种格式创建站点分组（第一层）
    console.log('创建站点分组...');
    const siteGroups = [];
    let groupsCreated = 0;
    
    for (const channelType of selectedChannelTypes) {
      try {
        const siteGroup = await gptloadService.createSiteGroup(siteName, baseUrl, apiKeys, channelType, validationEndpoint, models);
        if (siteGroup && siteGroup.name) {
          siteGroups.push(siteGroup);
          groupsCreated++;
          console.log(`✅ ${channelType} 格式站点分组创建成功`);
        } else {
          console.error(`❌ ${channelType} 格式站点分组创建返回无效数据:`, siteGroup);
        }
      } catch (error) {
        console.error(`❌ ${channelType} 格式站点分组创建失败:`, error.message);
        // 继续处理其他格式，不中断整个流程
      }
    }
    
    if (siteGroups.length === 0) {
      return res.status(500).json({ error: '所有格式的站点分组都创建失败' });
    }
    
    // 步骤3：创建或更新模型分组（第二层），将所有站点分组添加为上游
    console.log('创建/更新模型分组...');
    const modelGroups = await gptloadService.createOrUpdateModelGroups(models, siteGroups);
    
    // 步骤4：更新 uni-api 配置，指向模型分组
    console.log('更新 uni-api 配置...');
    await yamlManager.updateUniApiConfig(modelGroups);
    
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
        modelGroups: modelGroups.length
      }
    });
    
  } catch (error) {
    console.error('处理AI站点时出错:', error);
    res.status(500).json({ 
      error: '服务器内部错误', 
      details: error.message 
    });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 获取当前配置状态
app.get('/api/status', async (req, res) => {
  try {
    const gptloadStatus = await gptloadService.getStatus();
    const uniApiStatus = await yamlManager.getStatus();
    const modelSyncStatus = modelSyncService.getStatus();
    const channelHealthStatus = channelHealthMonitor.getStatus();
    const channelCleanupStatus = channelCleanupService.getStatus();
    
    res.json({
      gptload: gptloadStatus,
      uniApi: uniApiStatus,
      modelSync: modelSyncStatus,
      channelHealth: channelHealthStatus,
      channelCleanup: channelCleanupStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 手动触发模型同步
app.post('/api/sync-models', async (req, res) => {
  try {
    // 异步执行，立即返回
    modelSyncService.syncAllModels().catch(error => {
      console.error('手动模型同步失败:', error);
    });
    
    res.json({ 
      success: true, 
      message: '模型同步已开始，请查看控制台日志了解进度' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 控制模型同步服务
app.post('/api/sync-models/control', (req, res) => {
  try {
    const { action } = req.body;
    
    switch (action) {
      case 'start':
        modelSyncService.start();
        res.json({ success: true, message: '模型同步服务已启动' });
        break;
      case 'stop':
        modelSyncService.stop();
        res.json({ success: true, message: '模型同步服务已停止' });
        break;
      default:
        res.status(400).json({ error: '无效的操作，支持: start, stop' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 清理并重置所有模型配置
app.post('/api/sync-models/cleanup', async (req, res) => {
  try {
    const results = await modelSyncService.cleanupAndResetModels();
    res.json({
      success: true,
      message: '模型清理与重置任务完成',
      data: results
    });
  } catch (error) {
    res.status(500).json({ 
      error: '清理模型配置时出错', 
      details: error.message 
    });
  }
});

// 手动触发渠道健康检查
app.post('/api/check-channels', async (req, res) => {
  try {
    // 异步执行，立即返回
    channelHealthMonitor.checkChannelHealth().catch(error => {
      console.error('手动渠道健康检查失败:', error);
    });
    
    res.json({ 
      success: true, 
      message: '渠道健康检查已开始，请查看控制台日志了解进度' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 控制渠道健康监控服务
app.post('/api/check-channels/control', (req, res) => {
  try {
    const { action } = req.body;
    
    switch (action) {
      case 'start':
        channelHealthMonitor.start();
        res.json({ success: true, message: '渠道健康监控已启动' });
        break;
      case 'stop':
        channelHealthMonitor.stop();
        res.json({ success: true, message: '渠道健康监控已停止' });
        break;
      default:
        res.status(400).json({ error: '无效的操作，支持: start, stop' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取失败的渠道列表
app.get('/api/failed-channels', (req, res) => {
  try {
    const failedChannels = channelHealthMonitor.getFailedChannels();
    res.json({ failedChannels });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 重置渠道失败计数
app.post('/api/reset-channel-failures', (req, res) => {
  try {
    const { channelName } = req.body;
    channelHealthMonitor.resetChannelFailures(channelName);
    
    res.json({ 
      success: true, 
      message: channelName ? 
        `已重置渠道 ${channelName} 的失败计数` : 
        '已重置所有渠道的失败计数'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取多实例状态
app.get('/api/multi-instances', (req, res) => {
  try {
    const status = gptloadService.getMultiInstanceStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 手动触发多实例健康检查
app.post('/api/check-instances', async (req, res) => {
  try {
    // 异步执行，立即返回
    gptloadService.checkAllInstancesHealth().then(results => {
      console.log('✅ 多实例健康检查完成');
    }).catch(error => {
      console.error('❌ 多实例健康检查失败:', error);
    });
    
    res.json({ 
      success: true, 
      message: '多实例健康检查已开始，请查看控制台日志了解进度' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 重新分配站点到指定实例
app.post('/api/reassign-site', async (req, res) => {
  try {
    const { siteUrl, instanceId } = req.body;
    
    if (!siteUrl) {
      return res.status(400).json({ error: '需要提供 siteUrl' });
    }
    
    await gptloadService.reassignSite(siteUrl, instanceId);
    
    res.json({ 
      success: true, 
      message: instanceId ? 
        `已将站点 ${siteUrl} 分配到实例 ${instanceId}` :
        `已清除站点 ${siteUrl} 的分配，将重新自动分配`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 预览渠道清理（试运行）
app.post('/api/cleanup-channels/preview', async (req, res) => {
  try {
    const options = req.body || {};
    
    const results = await channelCleanupService.previewCleanup(options);
    
    res.json({
      success: true,
      message: '预览完成',
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 执行渠道清理
app.post('/api/cleanup-channels', async (req, res) => {
  try {
    const options = req.body || {};
    
    // 异步执行，立即返回
    channelCleanupService.cleanupDisconnectedChannels(options).then(results => {
      console.log('✅ 渠道清理完成:', results);
    }).catch(error => {
      console.error('❌ 渠道清理失败:', error);
    });
    
    res.json({
      success: true,
      message: '渠道清理已开始，请查看控制台日志了解进度'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 手动清理指定渠道
app.post('/api/cleanup-channels/manual', async (req, res) => {
  try {
    const { channelNames, dryRun = false } = req.body;
    
    if (!channelNames || !Array.isArray(channelNames) || channelNames.length === 0) {
      return res.status(400).json({ error: '需要提供渠道名称数组' });
    }
    
    const results = await channelCleanupService.manualCleanupChannels(channelNames, dryRun);
    
    res.json({
      success: true,
      message: `${dryRun ? '预览' : '清理'}完成`,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取清理历史
app.get('/api/cleanup-history', (req, res) => {
  try {
    const history = channelCleanupService.getCleanupHistory();
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 维护脚本：删除所有模型分组 (sort=10)
app.post('/api/maintenance/delete-model-groups', async (req, res) => {
  console.log('🚨 开始执行维护任务：删除所有模型分组 (sort=10)');
  
  try {
    const allGroups = await gptloadService.getAllGroups();
    
    // 筛选出所有 sort=10 的分组
    const modelGroupsToDelete = allGroups.filter(group => group.sort === 10);

    if (modelGroupsToDelete.length === 0) {
      console.log('✅ 没有找到需要删除的模型分组');
      return res.json({
        success: true,
        message: '没有找到 sort=10 的模型分组，无需操作。'
      });
    }

    console.log(`🗑️ 发现 ${modelGroupsToDelete.length} 个模型分组需要删除...`);

    const results = {
      deleted: [],
      failed: []
    };

    for (const group of modelGroupsToDelete) {
      try {
        const success = await gptloadService.deleteGroupById(group.id, group._instance.id);
        if (success) {
          results.deleted.push(group.name);
        } else {
          results.failed.push({ name: group.name, reason: '删除失败' });
        }
      } catch (error) {
        results.failed.push({ name: group.name, reason: error.message });
      }
    }

    console.log(`🏁 维护任务完成: 成功删除 ${results.deleted.length} 个, 失败 ${results.failed.length} 个`);
    
    res.json({
      success: true,
      message: `操作完成。成功删除 ${results.deleted.length} 个分组，失败 ${results.failed.length} 个。`,
      results
    });

  } catch (error) {
    console.error('💥 删除模型分组时发生严重错误:', error);
    res.status(500).json({ error: '服务器内部错误', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 uni-load 服务器启动成功`);
  console.log(`📍 访问地址: http://localhost:${PORT}`);
  console.log(`🔗 gptload: ${process.env.GPTLOAD_URL || 'http://localhost:3001'}`);
  console.log(`🔗 uni-api: ${process.env.UNI_API_PATH || '../uni-api'}`);
  
  // 启动模型同步服务
  if (process.env.ENABLE_MODEL_SYNC !== 'false') {
    console.log(`🔄 启动模型同步服务...`);
    modelSyncService.start();
  } else {
    console.log(`⚠️ 模型同步服务已禁用 (ENABLE_MODEL_SYNC=false)`);
  }
  
  // 启动渠道健康监控
  if (process.env.ENABLE_CHANNEL_HEALTH !== 'false') {
    console.log(`🩺 启动渠道健康监控...`);
    channelHealthMonitor.start();
  } else {
    console.log(`⚠️ 渠道健康监控已禁用 (ENABLE_CHANNEL_HEALTH=false)`);
  }
});
