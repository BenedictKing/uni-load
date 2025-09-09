import { promises as fs } from 'fs'
import path from 'path'
import YAML from 'yaml'
import modelConfig from './model-config'
import { IGptloadService, IMultiGptloadManager, IYamlManager } from './interfaces'
import { getService } from './services/service-factory'
import config from './config'

class YamlManager implements IYamlManager {
  private uniApiPath: string
  private yamlPath: string

  constructor() {
    this.uniApiPath = config.uniApi.path
    this.yamlPath = config.uniApi.yamlPath
  }

  /**
   * 获取 uni-api 状态
   */
  async getStatus() {
    try {
      const exists = await this.checkYamlExists()
      if (!exists) {
        return {
          exists: false,
          error: '配置文件不存在',
        }
      }

      const config = await this.loadConfig()
      const providersCount = config.providers ? config.providers.length : 0

      return {
        exists: true,
        path: this.yamlPath,
        providersCount,
      }
    } catch (error) {
      return {
        exists: true,
        error: error.message,
      }
    }
  }

  /**
   * 检查配置文件是否存在
   */
  async checkYamlExists() {
    try {
      await fs.access(this.yamlPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 加载配置文件
   */
  async loadConfig() {
    try {
      const content = await fs.readFile(this.yamlPath, 'utf8')
      return YAML.parse(content)
    } catch (error) {
      console.error('加载配置文件失败:', error.message)
      throw new Error(`加载配置文件失败: ${error.message}`)
    }
  }

  /**
   * 保存配置文件
   */
  async saveConfig(config) {
    try {
      // 创建备份
      await this.createBackup()

      // 生成YAML内容
      const yamlContent = YAML.stringify(config, {
        indent: 2,
        lineWidth: 120,
        minContentWidth: 0,
      })

      // 保存文件
      await fs.writeFile(this.yamlPath, yamlContent, 'utf8')
      console.log('✅ 配置文件保存成功')
    } catch (error) {
      console.error('保存配置文件失败:', error.message)
      throw new Error(`保存配置文件失败: ${error.message}`)
    }
  }

  /**
   * 创建配置文件备份
   */
  async createBackup() {
    try {
      const exists = await this.checkYamlExists()
      if (!exists) return

      // 确保backup目录存在
      const backupDir = path.join(path.dirname(this.yamlPath), 'backup')
      try {
        await fs.mkdir(backupDir, { recursive: true })
      } catch (error) {
        // 目录可能已存在，忽略错误
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupFileName = `${path.basename(this.yamlPath)}.backup.${timestamp}`
      const backupPath = path.join(backupDir, backupFileName)

      const content = await fs.readFile(this.yamlPath, 'utf8')
      await fs.writeFile(backupPath, content, 'utf8')

      console.log(`📁 配置文件备份至: ${backupPath}`)
    } catch (error) {
      console.warn('创建备份失败:', error.message)
    }
  }

  /**
   * 更新 uni-api 配置
   */
  async updateUniApiConfig(modelGroups) {
    try {
      console.log('更新 uni-api 配置文件...')

      let config

      // 加载现有配置或创建新配置
      const exists = await this.checkYamlExists()
      if (exists) {
        config = await this.loadConfig()
      } else {
        config = this.createDefaultConfig()
      }

      // 确保 providers 数组存在
      if (!config.providers) {
        config.providers = []
      }

      // 使用服务工厂获取依赖
      const gptloadService = getService<IGptloadService>('gptloadService')
      if (!gptloadService) {
        throw new Error('无法从服务工厂获取 GptloadService')
      }

      const multiInstanceStatus = gptloadService.getMultiInstanceStatus()
      const gptloadToken = await this.getGptloadToken(multiInstanceStatus)

      // 为每个模型添加或更新 provider
      for (const modelGroup of modelGroups) {
        if (modelGroup && modelGroup.name && modelGroup.test_model) {
          const instanceUrl = modelGroup._instance?.url
          if (!instanceUrl) {
            console.warn(`⚠️ 模型分组 ${modelGroup.name} 没有配置对应的 gpt-load 实例，跳过 uni-api 配置`)
            continue
          }
          
          this.addOrUpdateModelProvider(
            config,
            modelGroup.test_model,
            modelGroup.name,
            modelGroup.validation_endpoint,
            modelGroup.channel_type,
            gptloadToken,
            instanceUrl
          )
        } else {
          console.warn('⚠️ 跳过一个无效的模型分组数据:', modelGroup)
        }
      }

      // 保存配置
      await this.saveConfig(config)

      console.log(`✅ 成功将 ${modelGroups.length} 个模型分组更新到 uni-api 配置`)
    } catch (error) {
      console.error('更新 uni-api 配置失败:', error.message)
      throw new Error(`更新 uni-api 配置失败: ${error.message}`)
    }
  }

  /**
   * 获取gpt-load实例的token
   */
  async getGptloadToken(multiInstanceStatus) {
    try {
      // 优先使用本地实例的token
      const localInstance = Object.values(multiInstanceStatus.instances).find(
        (instance: any) => instance.name && instance.name.includes('本地')
      )

      const multiGptloadManager = getService<IMultiGptloadManager>('multiGptloadManager')

      if (localInstance && multiGptloadManager) {
        const instance = multiGptloadManager.getInstance('local')
        if (instance && instance.token) {
          console.log('✅ 使用本地gpt-load实例的token')
          return instance.token
        }
      }

      // 如果本地实例没有token，使用第一个有token的健康实例
      if (multiGptloadManager) {
        for (const [instanceId, status] of Object.entries(multiInstanceStatus.instances)) {
          if ((status as any).healthy) {
            const instance = multiGptloadManager.getInstance(instanceId)
            if (instance && instance.token) {
              console.log(`✅ 使用实例 ${instance.name} 的token`)
              return instance.token
            }
          }
        }
      }

      console.warn('⚠️ 未找到可用的gpt-load token，将使用默认API密钥')
      return 'sk-uni-load-auto-generated'
    } catch (error) {
      console.error('获取gpt-load token失败:', error.message)
      return 'sk-uni-load-auto-generated'
    }
  }

  /**
   * 标准化模型名称，处理重定向
   * 完全依赖 modelConfig 的统一实现
   */
  normalizeModelName(originalModel) {
    // 直接使用 model-config 的标准化方法
    const result = (modelConfig.constructor as any).normalizeForUniApi(originalModel)
    const normalizedModel = result.normalizedModel
    const withoutOrgModel = result.withoutOrgModel

    // 删除冗余的自定义处理逻辑，统一使用 model-config
    if (originalModel !== normalizedModel) {
      console.log(`🔄 模型名称标准化: ${originalModel} -> ${normalizedModel}`)
    }

    return {
      withoutOrg: withoutOrgModel,
      simplified: normalizedModel,
    }
  }

  /**
   * 添加或更新模型 provider
   */
  addOrUpdateModelProvider(
    config,
    originalModelName,
    groupName,
    validationEndpoint, // 这个参数实际上不应该用于生成 base_url
    channelType,
    gptloadToken = 'sk-uni-load-auto-generated',
    instanceUrl = null // 新增参数：实例 URL
  ) {
    // 标准化模型名称用于重定向
    const normalizedResult = this.normalizeModelName(originalModelName)
    const withoutOrgName = normalizedResult.withoutOrg
    const simplifiedName = normalizedResult.simplified

    // 使用 gptload 服务生成的、确切的分组名
    const modelNameForUrl = groupName
    const providerName = `gptload-${modelNameForUrl}`

    let apiPath
    // --- 关键修复 ---
    // 移除使用 validationEndpoint 的逻辑，因为它用于健康检查，而不是内容生成。
    // 直接根据 channelType 来决定正确的 API 路径。
    switch (channelType) {
      case 'anthropic':
        apiPath = '/v1/messages'
        break
      case 'gemini':
        // 修复：为 Gemini 使用正确的 v1beta 路径
        // uni-api 会在此基础上构建完整的请求，例如: .../proxy/group-name/v1beta/models/gemini-pro:generateContent
        apiPath = '/v1beta'
        break
      default: // openai 及其他
        apiPath = '/v1/chat/completions'
    }

    // 查找是否已存在该 provider
    const existingProviderIndex = config.providers.findIndex((provider) => provider.provider === providerName)

    // 构建 provider 配置
    const providerConfig: any = {
      provider: providerName,
      // 使用传入的实例 URL 或跳过
      base_url: instanceUrl ? `${instanceUrl}/proxy/${modelNameForUrl}${apiPath}` : undefined,
      api: gptloadToken,
      tools: true,
    }

    // 构建模型映射：原始名称 + 重命名映射对象
    const modelMappings = [originalModelName] // 始终包含原始名称

    // 检查是否需要添加重命名映射
    const needsWithoutOrgMapping = originalModelName !== withoutOrgName
    const needsSimplifiedMapping = withoutOrgName !== simplifiedName && originalModelName !== simplifiedName

    let mappingsAdded = 0

    // 如果需要任何映射，创建一个重命名映射对象
    if (needsWithoutOrgMapping || needsSimplifiedMapping) {
      const renameMapping = {}

      // 优先使用简化名称，如果没有则使用去组织名称
      if (needsSimplifiedMapping) {
        renameMapping[originalModelName] = simplifiedName
        mappingsAdded++
        console.log(`📝 添加重命名映射: ${originalModelName} -> ${simplifiedName}`)
      } else if (needsWithoutOrgMapping) {
        renameMapping[originalModelName] = withoutOrgName
        mappingsAdded++
        console.log(`📝 添加重命名映射: ${originalModelName} -> ${withoutOrgName}`)
      }

      modelMappings.push(renameMapping)
    }

    providerConfig.model = modelMappings

    // 生成友好的日志输出
    if (mappingsAdded > 0) {
      const targetAlias = needsSimplifiedMapping ? simplifiedName : withoutOrgName
      console.log(`✅ 模型 "${originalModelName}" 添加别名: "${targetAlias}"`)
    } else {
      console.log(`📝 模型 "${originalModelName}" 无需别名`)
    }

    if (existingProviderIndex >= 0) {
      // 更新现有 provider
      config.providers[existingProviderIndex] = providerConfig
      console.log(`🔄 更新 provider: ${providerName}`)
    } else {
      // 添加新 provider
      config.providers.push(providerConfig)
      console.log(`➕ 添加 provider: ${providerName}`)
    }
  }

  /**
   * 创建默认配置
   */
  createDefaultConfig() {
    return {
      api_keys: [
        {
          api: 'sk-uni-load-default-key',
          model: ['all'],
          preferences: {
            SCHEDULING_ALGORITHM: 'round_robin',
            AUTO_RETRY: true,
          },
        },
      ],
      providers: [],
      preferences: {
        model_timeout: {
          default: 600,
        },
        cooldown_period: 60,
      },
    }
  }

  /**
   * 移除模型 provider
   */
  async removeModelProvider(modelName) {
    try {
      const config = await this.loadConfig()
      const normalizedModelName = modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      const providerName = `gptload-${normalizedModelName}`

      // 过滤掉指定的 provider
      const originalLength = config.providers.length
      config.providers = config.providers.filter((provider) => provider.provider !== providerName)

      if (config.providers.length < originalLength) {
        await this.saveConfig(config)
        console.log(`🗑️ 移除 provider: ${providerName}`)
        return true
      }

      return false
    } catch (error) {
      console.error('移除 provider 失败:', error.message)
      throw new Error(`移除 provider 失败: ${error.message}`)
    }
  }

  /**
   * 清理无效的 providers
   */
  async cleanupProviders() {
    try {
      const config = await this.loadConfig()
      const originalLength = config.providers.length

      // 移除所有 gptload- 开头的 providers
      config.providers = config.providers.filter((provider) => !provider.provider.startsWith('gptload-'))

      if (config.providers.length < originalLength) {
        await this.saveConfig(config)
        console.log(`🧹 清理了 ${originalLength - config.providers.length} 个 gptload providers`)
        return originalLength - config.providers.length
      }

      return 0
    } catch (error) {
      console.error('清理 providers 失败:', error.message)
      throw new Error(`清理 providers 失败: ${error.message}`)
    }
  }

  /**
   * 获取当前配置的模型列表
   */
  async getCurrentModels() {
    try {
      const config = await this.loadConfig()
      const models = new Set()

      config.providers.forEach((provider) => {
        if (provider.provider.startsWith('gptload-') && provider.model) {
          provider.model.forEach((model) => models.add(model))
        }
      })

      return Array.from(models)
    } catch (error) {
      console.error('获取当前模型列表失败:', error.message)
      return []
    }
  }

  /**
   * 验证配置文件格式
   */
  async validateConfig(config) {
    try {
      // 基本结构检查
      if (!config || typeof config !== 'object') {
        throw new Error('配置文件格式无效')
      }

      if (!config.api_keys || !Array.isArray(config.api_keys)) {
        throw new Error('api_keys 配置缺失或格式错误')
      }

      if (!config.providers || !Array.isArray(config.providers)) {
        throw new Error('providers 配置缺失或格式错误')
      }

      // 检查每个 provider 的必需字段
      for (const provider of config.providers) {
        if (!provider.provider || !provider.base_url) {
          throw new Error(`Provider 配置不完整: ${JSON.stringify(provider)}`)
        }
      }

      return true
    } catch (error) {
      console.error('配置文件验证失败:', error.message)
      throw error
    }
  }
}

export default new YamlManager()
