const fs = require('fs').promises;
const path = require('path');
const YAML = require('yaml');

class YamlManager {
  constructor() {
    this.uniApiPath = process.env.UNI_API_PATH || '../uni-api';
    this.yamlPath = process.env.UNI_API_YAML_PATH || path.join(this.uniApiPath, 'api.yaml');
    this.gptloadUrl = process.env.GPTLOAD_URL || 'http://localhost:3001';
  }

  /**
   * 获取 uni-api 状态
   */
  async getStatus() {
    try {
      const exists = await this.checkYamlExists();
      if (!exists) {
        return {
          exists: false,
          error: '配置文件不存在'
        };
      }

      const config = await this.loadConfig();
      const providersCount = config.providers ? config.providers.length : 0;
      
      return {
        exists: true,
        path: this.yamlPath,
        providersCount
      };
    } catch (error) {
      return {
        exists: true,
        error: error.message
      };
    }
  }

  /**
   * 检查配置文件是否存在
   */
  async checkYamlExists() {
    try {
      await fs.access(this.yamlPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 加载配置文件
   */
  async loadConfig() {
    try {
      const content = await fs.readFile(this.yamlPath, 'utf8');
      return YAML.parse(content);
    } catch (error) {
      console.error('加载配置文件失败:', error.message);
      throw new Error(`加载配置文件失败: ${error.message}`);
    }
  }

  /**
   * 保存配置文件
   */
  async saveConfig(config) {
    try {
      // 创建备份
      await this.createBackup();
      
      // 生成YAML内容
      const yamlContent = YAML.stringify(config, {
        indent: 2,
        lineWidth: 120,
        minContentWidth: 0
      });
      
      // 保存文件
      await fs.writeFile(this.yamlPath, yamlContent, 'utf8');
      console.log('✅ 配置文件保存成功');
      
    } catch (error) {
      console.error('保存配置文件失败:', error.message);
      throw new Error(`保存配置文件失败: ${error.message}`);
    }
  }

  /**
   * 创建配置文件备份
   */
  async createBackup() {
    try {
      const exists = await this.checkYamlExists();
      if (!exists) return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.yamlPath}.backup.${timestamp}`;
      
      const content = await fs.readFile(this.yamlPath, 'utf8');
      await fs.writeFile(backupPath, content, 'utf8');
      
      console.log(`📁 配置文件备份至: ${backupPath}`);
    } catch (error) {
      console.warn('创建备份失败:', error.message);
    }
  }

  /**
   * 更新 uni-api 配置
   */
  async updateUniApiConfig(models, modelGroups) {
    try {
      console.log('更新 uni-api 配置文件...');
      
      let config;
      
      // 加载现有配置或创建新配置
      const exists = await this.checkYamlExists();
      if (exists) {
        config = await this.loadConfig();
      } else {
        config = this.createDefaultConfig();
      }

      // 确保 providers 数组存在
      if (!config.providers) {
        config.providers = [];
      }

      // 为每个模型添加或更新 provider
      for (const model of models) {
        this.addOrUpdateModelProvider(config, model);
      }

      // 保存配置
      await this.saveConfig(config);
      
      console.log(`✅ 成功添加 ${models.length} 个模型到 uni-api 配置`);
      
    } catch (error) {
      console.error('更新 uni-api 配置失败:', error.message);
      throw new Error(`更新 uni-api 配置失败: ${error.message}`);
    }
  }

  /**
   * 添加或更新模型 provider
   */
  addOrUpdateModelProvider(config, modelName) {
    const normalizedModelName = modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const providerName = `gptload-${normalizedModelName}`;
    
    // 查找是否已存在该 provider
    const existingProviderIndex = config.providers.findIndex(
      provider => provider.provider === providerName
    );

    // 构建 provider 配置
    const providerConfig = {
      provider: providerName,
      base_url: `${this.gptloadUrl}/proxy/${normalizedModelName}/v1/chat/completions`,
      api: 'sk-uni-load-auto-generated',
      model: [modelName],
      tools: true,
      preferences: {
        AUTO_RETRY: true,
        SCHEDULING_ALGORITHM: 'round_robin'
      }
    };

    if (existingProviderIndex >= 0) {
      // 更新现有 provider
      config.providers[existingProviderIndex] = providerConfig;
      console.log(`🔄 更新 provider: ${providerName}`);
    } else {
      // 添加新 provider
      config.providers.push(providerConfig);
      console.log(`➕ 添加 provider: ${providerName}`);
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
            AUTO_RETRY: true
          }
        }
      ],
      providers: [],
      preferences: {
        model_timeout: {
          default: 600
        },
        rate_limit: '999999/min'
      }
    };
  }

  /**
   * 移除模型 provider
   */
  async removeModelProvider(modelName) {
    try {
      const config = await this.loadConfig();
      const normalizedModelName = modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const providerName = `gptload-${normalizedModelName}`;
      
      // 过滤掉指定的 provider
      const originalLength = config.providers.length;
      config.providers = config.providers.filter(
        provider => provider.provider !== providerName
      );
      
      if (config.providers.length < originalLength) {
        await this.saveConfig(config);
        console.log(`🗑️ 移除 provider: ${providerName}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('移除 provider 失败:', error.message);
      throw new Error(`移除 provider 失败: ${error.message}`);
    }
  }

  /**
   * 清理无效的 providers
   */
  async cleanupProviders() {
    try {
      const config = await this.loadConfig();
      const originalLength = config.providers.length;
      
      // 移除所有 gptload- 开头的 providers
      config.providers = config.providers.filter(
        provider => !provider.provider.startsWith('gptload-')
      );
      
      if (config.providers.length < originalLength) {
        await this.saveConfig(config);
        console.log(`🧹 清理了 ${originalLength - config.providers.length} 个 gptload providers`);
        return originalLength - config.providers.length;
      }
      
      return 0;
    } catch (error) {
      console.error('清理 providers 失败:', error.message);
      throw new Error(`清理 providers 失败: ${error.message}`);
    }
  }

  /**
   * 获取当前配置的模型列表
   */
  async getCurrentModels() {
    try {
      const config = await this.loadConfig();
      const models = new Set();
      
      config.providers.forEach(provider => {
        if (provider.provider.startsWith('gptload-') && provider.model) {
          provider.model.forEach(model => models.add(model));
        }
      });
      
      return Array.from(models);
    } catch (error) {
      console.error('获取当前模型列表失败:', error.message);
      return [];
    }
  }

  /**
   * 验证配置文件格式
   */
  async validateConfig(config) {
    try {
      // 基本结构检查
      if (!config || typeof config !== 'object') {
        throw new Error('配置文件格式无效');
      }

      if (!config.api_keys || !Array.isArray(config.api_keys)) {
        throw new Error('api_keys 配置缺失或格式错误');
      }

      if (!config.providers || !Array.isArray(config.providers)) {
        throw new Error('providers 配置缺失或格式错误');
      }

      // 检查每个 provider 的必需字段
      for (const provider of config.providers) {
        if (!provider.provider || !provider.base_url) {
          throw new Error(`Provider 配置不完整: ${JSON.stringify(provider)}`);
        }
      }

      return true;
    } catch (error) {
      console.error('配置文件验证失败:', error.message);
      throw error;
    }
  }
}

module.exports = new YamlManager();