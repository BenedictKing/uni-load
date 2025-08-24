const fs = require("fs").promises;
const path = require("path");
const YAML = require("yaml");

class YamlManager {
  constructor() {
    this.uniApiPath = process.env.UNI_API_PATH || "../uni-api";
    this.yamlPath =
      process.env.UNI_API_YAML_PATH || path.join(this.uniApiPath, "api.yaml");
    this.gptloadUrl = process.env.GPTLOAD_URL || "http://localhost:3001";
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
          error: "配置文件不存在",
        };
      }

      const config = await this.loadConfig();
      const providersCount = config.providers ? config.providers.length : 0;

      return {
        exists: true,
        path: this.yamlPath,
        providersCount,
      };
    } catch (error) {
      return {
        exists: true,
        error: error.message,
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
      const content = await fs.readFile(this.yamlPath, "utf8");
      return YAML.parse(content);
    } catch (error) {
      console.error("加载配置文件失败:", error.message);
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
        minContentWidth: 0,
      });

      // 保存文件
      await fs.writeFile(this.yamlPath, yamlContent, "utf8");
      console.log("✅ 配置文件保存成功");
    } catch (error) {
      console.error("保存配置文件失败:", error.message);
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

      // 确保backup目录存在
      const backupDir = path.join(path.dirname(this.yamlPath), "backup");
      try {
        await fs.mkdir(backupDir, { recursive: true });
      } catch (error) {
        // 目录可能已存在，忽略错误
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFileName = `${path.basename(
        this.yamlPath
      )}.backup.${timestamp}`;
      const backupPath = path.join(backupDir, backupFileName);

      const content = await fs.readFile(this.yamlPath, "utf8");
      await fs.writeFile(backupPath, content, "utf8");

      console.log(`📁 配置文件备份至: ${backupPath}`);
    } catch (error) {
      console.warn("创建备份失败:", error.message);
    }
  }

  /**
   * 更新 uni-api 配置
   */
  async updateUniApiConfig(modelGroups) {
    try {
      console.log("更新 uni-api 配置文件...");

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

      // 获取gpt-load实例的token
      const gptloadService = require("./gptload");
      const multiInstanceStatus = gptloadService.getMultiInstanceStatus();
      const gptloadToken = await this.getGptloadToken(multiInstanceStatus);

      // 为每个模型添加或更新 provider
      for (const modelGroup of modelGroups) {
        if (modelGroup && modelGroup.name && modelGroup.test_model) {
          this.addOrUpdateModelProvider(
            config,
            modelGroup.test_model,
            modelGroup.name,
            modelGroup.validation_endpoint,
            modelGroup.channel_type,
            gptloadToken
          );
        } else {
          console.warn("⚠️ 跳过一个无效的模型分组数据:", modelGroup);
        }
      }

      // 保存配置
      await this.saveConfig(config);

      console.log(
        `✅ 成功将 ${modelGroups.length} 个模型分组更新到 uni-api 配置`
      );
    } catch (error) {
      console.error("更新 uni-api 配置失败:", error.message);
      throw new Error(`更新 uni-api 配置失败: ${error.message}`);
    }
  }

  /**
   * 获取gpt-load实例的token
   */
  async getGptloadToken(multiInstanceStatus) {
    try {
      // 优先使用本地实例的token
      const localInstance = Object.values(multiInstanceStatus.instances).find(
        (instance) => instance.name && instance.name.includes("本地")
      );

      if (localInstance) {
        const multiGptloadManager = require("./multi-gptload");
        const instance = multiGptloadManager.getInstance("local");
        if (instance && instance.token) {
          console.log("✅ 使用本地gpt-load实例的token");
          return instance.token;
        }
      }

      // 如果本地实例没有token，使用第一个有token的健康实例
      for (const [instanceId, status] of Object.entries(
        multiInstanceStatus.instances
      )) {
        if (status.healthy) {
          const multiGptloadManager = require("./multi-gptload");
          const instance = multiGptloadManager.getInstance(instanceId);
          if (instance && instance.token) {
            console.log(`✅ 使用实例 ${instance.name} 的token`);
            return instance.token;
          }
        }
      }

      console.warn("⚠️ 未找到可用的gpt-load token，将使用默认API密钥");
      return "sk-uni-load-auto-generated";
    } catch (error) {
      console.error("获取gpt-load token失败:", error.message);
      return "sk-uni-load-auto-generated";
    }
  }

  /**
   * 标准化模型名称，处理重定向
   */
  normalizeModelName(originalModel) {
    let normalizedModel = originalModel;

    // 处理带组织名的模型：deepseek-ai/DeepSeek-V3 -> DeepSeek-V3
    if (normalizedModel.includes("/")) {
      const parts = normalizedModel.split("/");
      normalizedModel = parts[parts.length - 1]; // 取最后一部分
    }

    // 转换为小写
    normalizedModel = normalizedModel.toLowerCase();

    // 使用正则表达式移除日期格式和版本号
    const furtherSimplified = normalizedModel
      // 移除 YYYY-MM-DD 格式的日期 (如 2025-08-07, -2025-03-24)
      .replace(/-?\d{4}-\d{2}-\d{2}/g, "")
      // 移除 YYYYMMDD 格式的日期 (如 20250219, -20250324)
      .replace(/-?\d{8}/g, "")
      // 移除其他常见的版本号和日期模式
      .replace(/-\d{2}-\d{2}$/g, "") // 移除 -05-20 格式（月-日）
      .replace(/-\d{3,4}$/g, "") // 移除 -001, -0324 等格式
      .replace(/-latest$/g, "") // 移除 -latest 后缀
      .replace(/-preview$/g, "") // 移除 -preview 后缀
      .replace(/-beta$/g, "") // 移除 -beta 后缀
      .replace(/-alpha$/g, "") // 移除 -alpha 后缀
      // 替换连续的多个连字符为单个连字符
      .replace(/-+/g, "-")
      // 移除字符串开头和结尾的连字符
      .replace(/^-+|-+$/g, "");

    if (originalModel !== normalizedModel) {
      console.log(`🔄 模型名称处理: ${originalModel} -> ${normalizedModel}`);
    }

    if (normalizedModel !== furtherSimplified) {
      console.log(
        `🔄 模型名称进一步简化: ${normalizedModel} -> ${furtherSimplified}`
      );
    }

    return {
      withoutOrg: normalizedModel, // 去除组织名的小写版本
      simplified: furtherSimplified, // 进一步简化的版本
    };
  }

  /**
   * 添加或更新模型 provider
   */
  addOrUpdateModelProvider(
    config,
    originalModelName,
    groupName,
    validationEndpoint,
    channelType,
    gptloadToken = "sk-uni-load-auto-generated"
  ) {
    // 标准化模型名称用于重定向
    const normalizedResult = this.normalizeModelName(originalModelName);
    const withoutOrgName = normalizedResult.withoutOrg;
    const simplifiedName = normalizedResult.simplified;

    // 使用 gptload 服务生成的、确切的分组名
    const modelNameForUrl = groupName;
    const providerName = `gptload-${modelNameForUrl}`;

    let apiPath;
    // 优先使用 gptload 分组中已设定的验证端点
    if (
      validationEndpoint &&
      typeof validationEndpoint === "string" &&
      validationEndpoint.startsWith("/")
    ) {
      apiPath = validationEndpoint;
    } else {
      // 否则，根据渠道类型回退到默认值
      console.warn(
        `⚠️ 模型分组 ${groupName} 未设置有效的 validation_endpoint，将根据 channel_type [${
          channelType || "default"
        }] 回退到默认 API 路径`
      );
      switch (channelType) {
        case "anthropic":
          apiPath = "/v1/messages";
          break;
        case "gemini":
          apiPath = "/v1beta/openai/chat/completions";
          break;
        default: // openai 及其他
          apiPath = "/v1/chat/completions";
      }
    }

    // 查找是否已存在该 provider
    const existingProviderIndex = config.providers.findIndex(
      (provider) => provider.provider === providerName
    );

    // 构建 provider 配置
    const providerConfig = {
      provider: providerName,
      base_url: `${this.gptloadUrl}/proxy/${modelNameForUrl}${apiPath}`,
      api: gptloadToken, // 使用gpt-load的访问token
      tools: true,
    };

    // 构建模型映射：原始名称 + 独立的重命名映射
    const modelMappings = [originalModelName]; // 始终包含原始名称

    // 检查是否需要添加重命名映射
    const needsWithoutOrgMapping = originalModelName !== withoutOrgName;
    const needsSimplifiedMapping = 
      withoutOrgName !== simplifiedName && originalModelName !== simplifiedName;

    let mappingsAdded = 0;

    // 添加去除组织名的重命名映射
    if (needsWithoutOrgMapping) {
      const renameMapping = {};
      renameMapping[originalModelName] = withoutOrgName;
      modelMappings.push(renameMapping);
      mappingsAdded++;
      console.log(`📝 添加重命名映射 #1: ${originalModelName} -> ${withoutOrgName}`);
    }

    // 添加简化名称的重命名映射
    if (needsSimplifiedMapping) {
      const renameMapping = {};
      renameMapping[originalModelName] = simplifiedName;
      modelMappings.push(renameMapping);
      mappingsAdded++;
      console.log(`📝 添加重命名映射 #2: ${originalModelName} -> ${simplifiedName}`);
    }

    providerConfig.model = modelMappings;

    // 生成友好的日志输出
    if (mappingsAdded > 0) {
      const aliases = [];
      if (needsWithoutOrgMapping) aliases.push(`"${withoutOrgName}"`);
      if (needsSimplifiedMapping) aliases.push(`"${simplifiedName}"`);
      console.log(`✅ 模型 "${originalModelName}" 添加 ${mappingsAdded} 个别名: ${aliases.join(', ')}`);
    } else {
      console.log(`📝 模型 "${originalModelName}" 无需别名`);
    }

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
          api: "sk-uni-load-default-key",
          model: ["all"],
          preferences: {
            SCHEDULING_ALGORITHM: "round_robin",
            AUTO_RETRY: true,
          },
        },
      ],
      providers: [],
      preferences: {
        model_timeout: {
          default: 600,
        },
        rate_limit: "999999/min",
      },
    };
  }

  /**
   * 移除模型 provider
   */
  async removeModelProvider(modelName) {
    try {
      const config = await this.loadConfig();
      const normalizedModelName = modelName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const providerName = `gptload-${normalizedModelName}`;

      // 过滤掉指定的 provider
      const originalLength = config.providers.length;
      config.providers = config.providers.filter(
        (provider) => provider.provider !== providerName
      );

      if (config.providers.length < originalLength) {
        await this.saveConfig(config);
        console.log(`🗑️ 移除 provider: ${providerName}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error("移除 provider 失败:", error.message);
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
        (provider) => !provider.provider.startsWith("gptload-")
      );

      if (config.providers.length < originalLength) {
        await this.saveConfig(config);
        console.log(
          `🧹 清理了 ${
            originalLength - config.providers.length
          } 个 gptload providers`
        );
        return originalLength - config.providers.length;
      }

      return 0;
    } catch (error) {
      console.error("清理 providers 失败:", error.message);
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

      config.providers.forEach((provider) => {
        if (provider.provider.startsWith("gptload-") && provider.model) {
          provider.model.forEach((model) => models.add(model));
        }
      });

      return Array.from(models);
    } catch (error) {
      console.error("获取当前模型列表失败:", error.message);
      return [];
    }
  }

  /**
   * 验证配置文件格式
   */
  async validateConfig(config) {
    try {
      // 基本结构检查
      if (!config || typeof config !== "object") {
        throw new Error("配置文件格式无效");
      }

      if (!config.api_keys || !Array.isArray(config.api_keys)) {
        throw new Error("api_keys 配置缺失或格式错误");
      }

      if (!config.providers || !Array.isArray(config.providers)) {
        throw new Error("providers 配置缺失或格式错误");
      }

      // 检查每个 provider 的必需字段
      for (const provider of config.providers) {
        if (!provider.provider || !provider.base_url) {
          throw new Error(`Provider 配置不完整: ${JSON.stringify(provider)}`);
        }
      }

      return true;
    } catch (error) {
      console.error("配置文件验证失败:", error.message);
      throw error;
    }
  }
}

module.exports = new YamlManager();
