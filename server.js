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
        
        if (commonPrefixes.includes(firstPart) && secondPart) {
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
    const { baseUrl, apiKeys } = req.body;
    
    if (!baseUrl || !apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
      return res.status(400).json({ 
        error: '参数不完整：需要 baseUrl 和 apiKeys 数组' 
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

    console.log(`开始处理AI站点：${siteName} (${baseUrl})`);
    console.log(`自动生成的站点名称：${siteName}`);
    
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