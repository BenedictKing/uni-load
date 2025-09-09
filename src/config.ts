import dotenv from 'dotenv'

// 按优先级加载环境变量：.env.local > .env
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

/**
 * 统一的应用配置
 * 从环境变量中读取，并提供默认值
 */
const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3002', 10),

  // gpt-load 实例配置
  gptload: {
    instancesFile: process.env.GPTLOAD_INSTANCES_FILE || 'gptload-instances.json',
  },

  // uni-api 配置
  uniApi: {
    path: process.env.UNI_API_PATH || '../uni-api',
    yamlPath: process.env.UNI_API_YAML_PATH || '../uni-api/api.yaml',
  },

  // 模型同步服务配置
  modelSync: {
    enabled: process.env.ENABLE_MODEL_SYNC !== 'false',
    intervalMinutes: parseInt(process.env.MODEL_SYNC_INTERVAL || '360', 10),
  },

  // 渠道健康监控配置
  channelHealth: {
    enabled: process.env.ENABLE_CHANNEL_HEALTH !== 'false',
    intervalMinutes: parseInt(process.env.CHANNEL_CHECK_INTERVAL || '10', 10),
    failureThreshold: parseInt(process.env.CHANNEL_FAILURE_THRESHOLD || '3', 10),
  },

  // 模型优化器配置
  modelOptimizer: {
    enabled: process.env.ENABLE_MODEL_OPTIMIZER !== 'false',
  },
}

export default Object.freeze(config)