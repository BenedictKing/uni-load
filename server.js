const express = require('express');
const cors = require('cors');
const path = require('path');

// 按优先级加载环境变量：.env.local > .env
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const gptloadService = require('./src/gptload');
const modelsService = require('./src/models');
const yamlManager = require('./src/yaml-manager');

const app = express();
const PORT = process.env.PORT || 3002;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 路由
app.post('/api/process-ai-site', async (req, res) => {
  try {
    const { baseUrl, apiKeys, siteName } = req.body;
    
    if (!baseUrl || !apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
      return res.status(400).json({ 
        error: '参数不完整：需要 baseUrl, apiKeys 数组和 siteName' 
      });
    }

    console.log(`开始处理AI站点：${siteName} (${baseUrl})`);
    
    // 步骤1：获取AI站点支持的模型
    console.log('获取模型列表...');
    const models = await modelsService.getModels(baseUrl, apiKeys[0]);
    
    if (!models || models.length === 0) {
      return res.status(400).json({ error: '无法获取模型列表或模型列表为空' });
    }
    
    console.log(`发现 ${models.length} 个模型`);

    // 步骤2：创建站点分组（第一层）
    console.log('创建站点分组...');
    const siteGroup = await gptloadService.createSiteGroup(siteName, baseUrl, apiKeys);
    
    // 步骤3：创建或更新模型分组（第二层），将站点分组添加为上游
    console.log('创建/更新模型分组...');
    const modelGroups = await gptloadService.createOrUpdateModelGroups(models, siteGroup);
    
    // 步骤4：更新 uni-api 配置，指向模型分组
    console.log('更新 uni-api 配置...');
    await yamlManager.updateUniApiConfig(models, modelGroups);
    
    res.json({
      success: true,
      message: `成功配置AI站点 ${siteName}`,
      data: {
        siteName,
        baseUrl,
        modelsCount: models.length,
        models: models,
        siteGroup: siteGroup,
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
    
    res.json({
      gptload: gptloadStatus,
      uniApi: uniApiStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 uni-load 服务器启动成功`);
  console.log(`📍 访问地址: http://localhost:${PORT}`);
  console.log(`🔗 gptload: ${process.env.GPTLOAD_URL || 'http://localhost:3001'}`);
  console.log(`🔗 uni-api: ${process.env.UNI_API_PATH || '../uni-api'}`);
});