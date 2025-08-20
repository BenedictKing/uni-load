const axios = require("axios");
const https = require("https");

// 优先使用的小模型列表（按优先级排序）
const PREFERRED_TEST_MODELS = [
  // OpenAI 小模型
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-3.5-turbo",

  // DeepSeek 小模型
  "deepseek-v3",
  "deepseek-chat",

  // Google 小模型
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-1.5-flash",

  // Anthropic 小模型
  "claude-3-haiku",
  "claude-3-5-haiku",

  // Qwen 小模型
  "qwen-2.5-turbo",
  "qwen-turbo",

  // 其他小模型
  "llama-3.2-3b",
  "mistral-7b",
  "yi-lightning",
];

class MultiGptloadManager {
  constructor() {
    this.instances = new Map(); // gptload实例配置
    this.healthStatus = new Map(); // 实例健康状态
    this.siteAssignments = new Map(); // 站点到实例的分配

    // 创建允许自签名证书的 HTTPS Agent
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, // 允许自签名证书和无效证书
    });

    this.initializeInstances();
  }

  /**
   * 初始化gptload实例配置
   */
  initializeInstances() {
    // 从环境变量读取配置
    const instancesConfig = this.parseInstancesConfig();

    for (const config of instancesConfig) {
      this.addInstance(config);
    }

    console.log(`🌐 初始化了 ${this.instances.size} 个 gptload 实例`);

    // 立即进行一次健康检查
    setTimeout(() => {
      this.checkAllInstancesHealth().catch((error) => {
        console.error("初始健康检查失败:", error);
      });
    }, 1000); // 延迟1秒执行，让服务器完全启动
  }

  /**
   * 解析实例配置
   */
  parseInstancesConfig() {
    // 从 JSON 文件读取配置
    const configs = this.parseInstancesFromJsonFile();

    // 强制要求使用 JSON 文件配置
    if (configs.length === 0) {
      throw new Error(
        "❌ 未找到 gptload-instances.json 配置文件或配置为空！\n请复制示例文件：cp gptload-instances.json.example gptload-instances.json"
      );
    }

    return configs;
  }

  /**
   * 从 JSON 文件解析实例配置
   */
  parseInstancesFromJsonFile() {
    const fs = require("fs");
    const path = require("path");
    const configs = [];

    // 支持的配置文件路径（按优先级）
    const configFiles = [
      "gptload-instances.json", // 生产配置
      "gptload-instances.local.json", // 本地配置（优先级更高）
      process.env.GPTLOAD_INSTANCES_FILE, // 自定义文件路径
    ].filter(Boolean);

    for (const configFile of configFiles) {
      try {
        const configPath = path.resolve(configFile);

        if (fs.existsSync(configPath)) {
          console.log(`📋 从 JSON 文件读取 gptload 实例配置: ${configFile}`);

          const fileContent = fs.readFileSync(configPath, "utf8");
          const instances = JSON.parse(fileContent);

          if (Array.isArray(instances)) {
            configs.push(...instances);
            console.log(
              `✅ 从 ${configFile} 成功加载 ${instances.length} 个实例配置`
            );
          } else {
            console.warn(`⚠️ ${configFile} 格式错误：期望数组格式`);
          }

          // 只读取第一个找到的配置文件
          break;
        }
      } catch (error) {
        console.error(`❌ 读取配置文件 ${configFile} 失败:`, error.message);
      }
    }

    return configs;
  }

  /**
   * 添加gptload实例
   */
  addInstance(config) {
    const instance = {
      id: config.id,
      name: config.name,
      url: config.url,
      token: config.token || "",
      priority: config.priority || 10,
      description: config.description || "",
      apiClient: axios.create({
        baseURL: config.url + "/api",
        timeout: 30000,
        httpsAgent: this.httpsAgent, // 使用自定义的 HTTPS Agent
        headers: {
          "Content-Type": "application/json",
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
      }),
    };

    this.instances.set(config.id, instance);
    this.healthStatus.set(config.id, {
      healthy: false,
      lastCheck: null,
      error: null,
    });

    console.log(`➕ 添加 gptload 实例: ${config.name} (${config.url})`);
  }

  /**
   * 检查所有实例的健康状态
   */
  async checkAllInstancesHealth() {
    console.log("🩺 检查所有 gptload 实例健康状态...");

    const checkPromises = Array.from(this.instances.keys()).map((instanceId) =>
      this.checkInstanceHealth(instanceId)
    );

    await Promise.allSettled(checkPromises);

    const healthyCount = Array.from(this.healthStatus.values()).filter(
      (status) => status.healthy
    ).length;

    console.log(`✅ ${healthyCount}/${this.instances.size} 个实例健康`);
  }

  /**
   * 检查单个实例健康状态
   */
  async checkInstanceHealth(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    try {
      const startTime = Date.now();
      const response = await instance.apiClient.get("/groups");
      const responseTime = Date.now() - startTime;

      // 处理不同的响应格式
      let groupsCount = 0;
      if (Array.isArray(response.data)) {
        groupsCount = response.data.length;
      } else if (response.data && Array.isArray(response.data.data)) {
        groupsCount = response.data.data.length;
      } else if (
        response.data &&
        typeof response.data.code === "number" &&
        Array.isArray(response.data.data)
      ) {
        // gptload 特定格式: { code: 0, message: "Success", data: [...] }
        groupsCount = response.data.data.length;
      } else if (response.data && Array.isArray(response.data.groups)) {
        groupsCount = response.data.groups.length;
      }

      this.healthStatus.set(instanceId, {
        healthy: true,
        lastCheck: new Date().toISOString(),
        responseTime,
        groupsCount,
        error: null,
      });

      console.log(
        `✅ ${instance.name}: 健康 (${responseTime}ms, ${groupsCount} 个分组)`
      );
    } catch (error) {
      this.healthStatus.set(instanceId, {
        healthy: false,
        lastCheck: new Date().toISOString(),
        responseTime: null,
        groupsCount: 0,
        error: error.message,
      });

      console.log(`❌ ${instance.name}: 不健康 - ${error.message}`);
    }
  }

  /**
   * 为站点选择最佳的gptload实例
   */
  async selectBestInstance(siteUrl, options = {}) {
    // 首先检查是否有预分配的实例
    const existingAssignment = this.siteAssignments.get(siteUrl);
    if (existingAssignment) {
      const instance = this.instances.get(existingAssignment);
      const health = this.healthStatus.get(existingAssignment);

      if (instance && health?.healthy) {
        console.log(`🎯 使用预分配实例 ${instance.name} 处理 ${siteUrl}`);
        return instance;
      } else {
        // 预分配的实例不健康，移除分配
        this.siteAssignments.delete(siteUrl);
      }
    }

    // 测试站点可访问性并选择最佳实例
    const bestInstance = await this.findBestInstanceForSite(siteUrl, options);

    if (bestInstance) {
      // 记录分配
      this.siteAssignments.set(siteUrl, bestInstance.id);
      console.log(`📌 分配站点 ${siteUrl} 到实例 ${bestInstance.name}`);
    }

    return bestInstance;
  }

  /**
   * 为站点找到最佳实例
   */
  async findBestInstanceForSite(siteUrl, options) {
    // 获取健康的实例，按优先级排序
    let healthyInstances = Array.from(this.instances.values())
      .filter((instance) => this.healthStatus.get(instance.id)?.healthy)
      .sort((a, b) => a.priority - b.priority);

    if (healthyInstances.length === 0) {
      console.log("⚠️ 没有健康的 gptload 实例，执行健康检查...");

      // 主动进行健康检查
      await this.checkAllInstancesHealth();

      // 重新获取健康的实例
      healthyInstances = Array.from(this.instances.values())
        .filter((instance) => this.healthStatus.get(instance.id)?.healthy)
        .sort((a, b) => a.priority - b.priority);

      if (healthyInstances.length === 0) {
        console.log("❌ 健康检查后仍没有健康的 gptload 实例可用");
        return null;
      }

      console.log(`✅ 健康检查后发现 ${healthyInstances.length} 个健康实例`);
    }

    // 测试每个实例是否能访问该站点
    for (const instance of healthyInstances) {
      const canAccess = await this.testSiteAccessibility(
        instance,
        siteUrl,
        options
      );

      if (canAccess) {
        console.log(`✅ 实例 ${instance.name} 可以访问 ${siteUrl}`);
        return instance;
      } else {
        console.log(`❌ 实例 ${instance.name} 无法访问 ${siteUrl}`);
      }
    }

    // 如果都无法访问，返回优先级最高的健康实例
    const fallbackInstance = healthyInstances[0];
    console.log(
      `⚠️ 所有实例都无法访问 ${siteUrl}，使用回退实例 ${fallbackInstance.name}`
    );
    return fallbackInstance;
  }

  /**
   * 测试实例是否可以访问指定站点
   */
  async testSiteAccessibility(instance, siteUrl, options) {
    try {
      // 方法1：直接测试groups接口的连通性
      const groupsResponse = await instance.apiClient.get("/groups");

      // 如果能成功获取groups，说明实例本身是健康的
      // 对于站点连通性，我们简化假设实例健康就能访问大部分站点
      console.log(
        `✅ 实例 ${instance.name} 健康检查通过，假设可访问 ${siteUrl}`
      );
      return true;
    } catch (error) {
      // 如果连groups接口都访问不了，说明实例有问题
      console.log(`❌ 实例 ${instance.name} 健康检查失败: ${error.message}`);

      // 根据错误类型判断是否为连通性问题
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || error.message;

        // 5xx错误或连接超时可能表示实例不可用
        if (
          status >= 500 ||
          message.includes("timeout") ||
          message.includes("ECONNREFUSED")
        ) {
          return false;
        }

        // 其他错误（如4xx认证问题）可能表示实例可用但配置问题
        return true;
      }

      // 网络错误表示无法连接到实例
      return false;
    }
  }

  /**
   * 通过最佳实例执行操作
   */
  async executeOnBestInstance(siteUrl, operation, options = {}) {
    const instance = await this.selectBestInstance(siteUrl, options);

    if (!instance) {
      throw new Error("没有可用的 gptload 实例");
    }

    try {
      console.log(`🔄 通过实例 ${instance.name} 执行操作`);
      return await operation(instance);
    } catch (error) {
      console.error(`实例 ${instance.name} 执行操作失败:`, error.message);

      // 如果是网络错误，标记实例为不健康并重试其他实例
      if (this.isNetworkError(error)) {
        this.healthStatus.set(instance.id, {
          ...this.healthStatus.get(instance.id),
          healthy: false,
          error: error.message,
        });

        // 移除站点分配，强制重新选择
        this.siteAssignments.delete(siteUrl);

        console.log(`🔄 重试其他实例...`);
        return await this.executeOnBestInstance(siteUrl, operation, options);
      }

      throw error;
    }
  }

  /**
   * 判断是否为网络错误
   */
  isNetworkError(error) {
    return (
      error.code === "ECONNREFUSED" ||
      error.code === "ETIMEDOUT" ||
      error.message.includes("timeout") ||
      error.message.includes("Network Error")
    );
  }

  /**
   * 获取所有实例状态
   */
  getAllInstancesStatus() {
    const status = {};

    for (const [id, instance] of this.instances) {
      const health = this.healthStatus.get(id);
      status[id] = {
        name: instance.name,
        url: instance.url,
        priority: instance.priority,
        description: instance.description,
        healthy: health?.healthy || false,
        lastCheck: health?.lastCheck,
        responseTime: health?.responseTime,
        groupsCount: health?.groupsCount || 0,
        error: health?.error,
      };
    }

    return status;
  }

  /**
   * 获取站点分配情况
   */
  getSiteAssignments() {
    const assignments = {};

    for (const [siteUrl, instanceId] of this.siteAssignments) {
      const instance = this.instances.get(instanceId);
      assignments[siteUrl] = {
        instanceId,
        instanceName: instance?.name || "Unknown",
        instanceUrl: instance?.url || "Unknown",
      };
    }

    return assignments;
  }

  /**
   * 重新分配站点到实例
   */
  async reassignSite(siteUrl, instanceId = null) {
    if (instanceId) {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`实例 ${instanceId} 不存在`);
      }

      this.siteAssignments.set(siteUrl, instanceId);
      console.log(`📌 手动分配站点 ${siteUrl} 到实例 ${instance.name}`);
    } else {
      // 清除分配，下次访问时重新自动分配
      this.siteAssignments.delete(siteUrl);
      console.log(`🔄 清除站点 ${siteUrl} 的分配，将重新自动分配`);
    }
  }

  /**
   * 获取指定实例的API客户端
   */
  getInstanceClient(instanceId) {
    const instance = this.instances.get(instanceId);
    return instance?.apiClient;
  }

  /**
   * 获取实例信息
   */
  getInstance(instanceId) {
    return this.instances.get(instanceId);
  }

  /**
   * 统一的API接口 - 创建站点分组
   */
  async createSiteGroup(
    siteName,
    baseUrl,
    apiKeys,
    channelType = "openai",
    customValidationEndpoints = {},
    availableModels = null
  ) {
    return await this.executeOnBestInstance(
      baseUrl,
      async (instance) => {
        // 为不同格式创建不同的分组名
        const groupName = `${siteName.toLowerCase()}-${channelType}`;

        // 检查分组是否已存在
        const existingGroup = await this.checkGroupExists(instance, groupName);
        if (existingGroup) {
          console.log(`站点分组 ${groupName} 已存在，更新配置...`);
          return await this.updateSiteGroup(
            instance,
            existingGroup,
            baseUrl,
            apiKeys,
            channelType,
            customValidationEndpoints,
            availableModels
          );
        }

        console.log(`创建站点分组: ${groupName}，格式: ${channelType}`);

        // 根据不同 channel_type 设置默认参数
        const channelConfig = this.getChannelConfig(channelType);

        // 选择验证模型：优先使用小模型列表中的模型
        const testModel = this.selectTestModel(availableModels, channelType);

        // 确定要使用的验证端点
        const validationEndpoint =
          customValidationEndpoints[channelType] ||
          channelConfig.validation_endpoint;

        // 创建分组
        const groupData = {
          name: groupName,
          display_name: `${siteName} ${channelType.toUpperCase()} 站点`,
          description: `${siteName} AI站点 - ${baseUrl} (${channelType}) [实例: ${instance.name}]`,
          upstreams: [{ url: baseUrl, weight: 1 }],
          channel_type: channelType,
          test_model: testModel, // 使用选择的验证模型
          validation_endpoint: validationEndpoint, // 使用自定义端点或默认值
          sort: 20, // 渠道分组的排序号为20
          param_overrides: {},
          config: {
            blacklist_threshold: 99,
          },
        };

        try {
          const response = await instance.apiClient.post("/groups", groupData);

          // 处理不同的响应格式
          let group;
          if (
            response.data &&
            typeof response.data.code === "number" &&
            response.data.data
          ) {
            // gptload 特定格式: { code: 0, message: "Success", data: {...} }
            group = response.data.data;
          } else if (response.data) {
            // 直接返回数据
            group = response.data;
          } else {
            throw new Error("响应格式不正确");
          }

          // 添加 API 密钥
          if (apiKeys && apiKeys.length > 0) {
            await this.addApiKeysToGroup(instance, group.id, apiKeys);
          }

          console.log(
            `✅ 站点分组 ${groupName} 创建成功 (实例: ${instance.name})`
          );

          // 在返回的分组信息中添加实例信息
          return {
            ...group,
            _instance: {
              id: instance.id,
              name: instance.name,
              url: instance.url,
            },
          };
        } catch (error) {
          // 如果是409错误（分组已存在），重新检查并返回现有分组
          if (error.response && error.response.status === 409) {
            console.log(
              `⚠️ 分组 ${groupName} 已存在（409错误），重新获取分组信息...`
            );
            const existingGroup = await this.checkGroupExists(
              instance,
              groupName
            );
            if (existingGroup) {
              console.log(`✅ 找到已存在的分组 ${groupName}，将更新配置`);
              return await this.updateSiteGroup(
                instance,
                existingGroup,
                baseUrl,
                apiKeys,
                channelType,
                customValidationEndpoints,
                availableModels
              );
            }
          }
          throw error;
        }
      },
      { channelType }
    );
  }

  /**
   * 检查分组是否存在
   */
  async checkGroupExists(instance, groupName) {
    try {
      const response = await instance.apiClient.get("/groups");
      let groups = [];

      // 处理不同的响应格式
      if (Array.isArray(response.data)) {
        // 直接是数组格式
        groups = response.data;
      } else if (
        response.data &&
        typeof response.data.code === "number" &&
        Array.isArray(response.data.data)
      ) {
        // gptload 特定格式: { code: 0, message: "Success", data: [...] }
        groups = response.data.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        // 包装在 data 字段中
        groups = response.data.data;
      } else if (response.data && Array.isArray(response.data.groups)) {
        // 包装在 groups 字段中
        groups = response.data.groups;
      } else {
        console.warn(
          `实例 ${instance.name} 返回未知的分组数据格式:`,
          response.data
        );
        return null;
      }

      return groups.find((group) => group.name === groupName);
    } catch (error) {
      console.error("检查分组失败:", error.message);
      return null;
    }
  }

  /**
   * 从可用模型中选择最佳的验证模型
   */
  selectTestModel(availableModels, channelType) {
    const channelConfig = this.getChannelConfig(channelType);

    if (!availableModels || availableModels.length === 0) {
      // 如果没有可用模型，使用默认配置
      console.log(
        `⚠️ 未提供可用模型列表，使用默认验证模型: ${channelConfig.test_model}`
      );
      return channelConfig.test_model;
    }

    // 将可用模型转换为小写以便比较
    const availableModelsLower = availableModels.map((model) =>
      model.toLowerCase()
    );

    // 优先从小模型列表中选择
    for (const preferredModel of PREFERRED_TEST_MODELS) {
      const preferredLower = preferredModel.toLowerCase();

      // 精确匹配
      const exactMatch = availableModels.find(
        (model) => model.toLowerCase() === preferredLower
      );
      if (exactMatch) {
        console.log(`✅ 选择优先小模型作为验证模型: ${exactMatch}`);
        return exactMatch;
      }

      // 模糊匹配（包含关系）
      const fuzzyMatch = availableModels.find((model) => {
        const modelLower = model.toLowerCase();
        // 检查是否包含小模型的关键部分
        const preferredParts = preferredLower.split("-");
        return preferredParts.every((part) => modelLower.includes(part));
      });
      if (fuzzyMatch) {
        console.log(
          `✅ 选择匹配的小模型作为验证模型: ${fuzzyMatch} (匹配 ${preferredModel})`
        );
        return fuzzyMatch;
      }
    }

    // 如果小模型列表中没有匹配的，选择第一个可用模型
    const fallbackModel = availableModels[0];
    console.log(
      `⚠️ 小模型列表中无匹配模型，使用第一个可用模型作为验证模型: ${fallbackModel}`
    );
    return fallbackModel;
  }

  /**
   * 获取不同 channel_type 的默认配置
   */
  getChannelConfig(channelType) {
    const configs = {
      openai: {
        test_model: "gpt-4o-mini",
        validation_endpoint: "/v1/chat/completions",
      },
      anthropic: {
        test_model: "claude-sonnet-3-5-20250614",
        validation_endpoint: "/v1/messages",
      },
      gemini: {
        test_model: "gemini-2.5-flash",
        validation_endpoint: "/v1beta/openai/chat/completions",
      },
    };

    return configs[channelType] || configs.openai;
  }

  /**
   * 更新站点分组
   */
  async updateSiteGroup(
    instance,
    existingGroup,
    baseUrl,
    apiKeys,
    channelType,
    customValidationEndpoints = {},
    availableModels = null
  ) {
    try {
      console.log(
        `更新站点分组: ${existingGroup.name}，格式: ${channelType} (实例: ${instance.name})`
      );

      // 根据不同 channel_type 设置默认参数
      const channelConfig = this.getChannelConfig(channelType);

      // 选择验证模型：优先使用小模型列表中的模型
      const testModel = this.selectTestModel(availableModels, channelType);

      // 确定要使用的验证端点
      const validationEndpoint =
        customValidationEndpoints[channelType] ||
        channelConfig.validation_endpoint;

      // 更新分组配置
      const updateData = {
        upstreams: [{ url: baseUrl, weight: 1 }],
        channel_type: channelType,
        test_model: testModel, // 使用选择的验证模型
        validation_endpoint: validationEndpoint, // 使用自定义端点或默认值
        sort: 20, // 渠道分组的排序号为20
        param_overrides: {},
        config: {
          blacklist_threshold: 99,
        },
      };

      await instance.apiClient.put(`/groups/${existingGroup.id}`, updateData);

      // 添加新的 API 密钥（如果有）
      if (apiKeys && apiKeys.length > 0) {
        await this.addApiKeysToGroup(instance, existingGroup.id, apiKeys);
      }

      console.log(
        `✅ 站点分组 ${existingGroup.name} 更新成功 (实例: ${instance.name})`
      );

      return {
        ...existingGroup,
        ...updateData,
        _instance: {
          id: instance.id,
          name: instance.name,
          url: instance.url,
        },
      };
    } catch (error) {
      console.error(`更新站点分组失败: ${error.message}`);
      throw new Error(`更新站点分组失败: ${error.message}`);
    }
  }

  /**
   * 向分组添加 API 密钥
   */
  async addApiKeysToGroup(instance, groupId, apiKeys) {
    try {
      const keysText = apiKeys.join("\n");

      const response = await instance.apiClient.post("/keys/add-multiple", {
        group_id: groupId,
        keys_text: keysText,
      });

      console.log(
        `✅ 成功添加 ${apiKeys.length} 个API密钥到分组 ${groupId} (实例: ${instance.name})`
      );
      return response.data;
    } catch (error) {
      console.error(`添加API密钥失败: ${error.message}`);
      console.warn("警告: API密钥添加失败，但分组已创建，可手动添加密钥");
    }
  }

  /**
   * 删除分组下的所有 API 密钥
   */
  async deleteAllApiKeysFromGroup(instance, groupId) {
    try {
      // 1. 获取该分组的所有密钥
      const params = {
        group_id: groupId,
        page: 1,
        page_size: 1000,
        status: "active",
      };
      const response = await instance.apiClient.get("/keys", { params });

      const keys = response.data?.data?.items;
      if (!keys || keys.length === 0) {
        console.log(
          `ℹ️ 分组 ${groupId} (实例: ${instance.name}) 下没有可删除的密钥`
        );
        return 0;
      }

      console.log(
        `🗑️ 准备从分组 ${groupId} (实例: ${instance.name}) 删除 ${keys.length} 个密钥...`
      );

      // 2. 逐个删除密钥
      let deletedCount = 0;
      for (const key of keys) {
        try {
          await instance.apiClient.delete(`/keys/${key.id}`);
          deletedCount++;
        } catch (keyError) {
          console.error(`❌ 删除密钥 ${key.id} 失败: ${keyError.message}`);
        }
      }

      console.log(`✅ 成功从分组 ${groupId} 删除了 ${deletedCount} 个密钥`);
      return deletedCount;
    } catch (error) {
      console.error(`删除分组 ${groupId} 的密钥失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 切换分组下所有 API 密钥的状态
   * 使用 ValidateGroupKeys 来禁用密钥，使用 RestoreAllInvalidKeys 来恢复密钥
   */
  async toggleApiKeysStatusForGroup(instance, groupId, newStatus) {
    if (newStatus !== "active" && newStatus !== "disabled") {
      throw new Error('无效的密钥状态，必须是 "active" 或 "disabled"');
    }

    try {
      if (newStatus === "disabled") {
        // 使用 ValidateGroupKeys 来验证并禁用失效的密钥
        console.log(`🔄 准备验证分组 ${groupId} 的密钥并禁用失效的密钥...`);

        // 最多验证2次
        for (let attempt = 1; attempt <= 2; attempt++) {
          console.log(`🔍 第 ${attempt} 次验证分组 ${groupId} 的密钥...`);

          // 1. 启动验证任务
          try {
            const response = await instance.apiClient.post(
              "/keys/validate-group",
              {
                group_id: groupId,
              }
            );

            console.log(`✅ 成功启动分组 ${groupId} 的密钥验证任务`);
          } catch (error) {
            // 409 错误表示任务已经在运行，这是正常情况
            if (error.response && error.response.status === 409) {
              console.log(
                `ℹ️ 分组 ${groupId} 的验证任务已在运行中，等待完成...`
              );
            } else {
              throw error;
            }
          }

          // 2. 等待任务完成并获取结果
          const validationResult = await this.waitForValidationTask(
            instance,
            groupId
          );

          // 3. 检查验证后的密钥状态
          const keyStats = await this.getGroupKeyStats(instance, groupId);

          if (
            keyStats &&
            keyStats.active_keys === 0 &&
            keyStats.invalid_keys > 0
          ) {
            // 所有密钥都被标记为无效，验证成功
            console.log(`✅ 分组 ${groupId} 验证完成: 所有密钥已被标记为无效`);
            return {
              success: true,
              attempt: attempt,
              ...validationResult,
              final_stats: keyStats,
            };
          } else if (keyStats && keyStats.active_keys > 0) {
            // 仍有有效密钥，可能是临时失败
            console.log(
              `⚠️ 分组 ${groupId} 第 ${attempt} 次验证后仍有 ${keyStats.active_keys} 个有效密钥，可能是临时失败`
            );

            if (attempt === 2) {
              // 两次验证后仍然有效，跳过这个分组
              console.log(
                `ℹ️ 分组 ${groupId} 经过 ${attempt} 次验证后仍有有效密钥，跳过禁用操作`
              );
              return {
                success: false,
                reason: "keys_still_valid_after_retries",
                attempts: attempt,
                final_stats: keyStats,
              };
            }

            // 等待一段时间后再次验证
            console.log(`⏳ 等待 3 秒后进行第 ${attempt + 1} 次验证...`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
          } else {
            // 获取状态失败或异常情况
            console.log(`⚠️ 分组 ${groupId} 无法获取密钥状态，验证结果不确定`);
            return {
              success: true,
              attempt: attempt,
              ...validationResult,
              final_stats: keyStats || {},
            };
          }
        }
      } else if (newStatus === "active") {
        // 使用 RestoreAllInvalidKeys 来恢复所有无效的密钥
        console.log(`🔄 准备恢复分组 ${groupId} 的所有无效密钥...`);

        const response = await instance.apiClient.post(
          "/keys/restore-all-invalid",
          {
            group_id: groupId,
          }
        );

        const message = response.data?.data?.message || "密钥恢复完成";
        console.log(`✅ ${message}`);

        // 从响应消息中提取影响的行数
        const match = message.match(/(\d+) keys restored/);
        return match ? parseInt(match[1]) : 0;
      }
    } catch (error) {
      console.error(`更新分组 ${groupId} 的密钥状态失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 等待验证任务完成
   */
  async waitForValidationTask(instance, groupId) {
    let maxWaitTime = 30000; // 最多等待30秒
    let interval = 1000; // 每秒检查一次
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      try {
        const statusResponse = await instance.apiClient.get("/tasks/status");
        const taskStatus = statusResponse.data?.data;

        if (!taskStatus) {
          console.log(`⚠️ 未找到分组 ${groupId} 的任务状态`);
          break;
        }

        if (!taskStatus.is_running) {
          // 任务已完成
          const result = taskStatus.result;
          if (result) {
            const { invalid_keys, valid_keys, total_keys } = result;
            console.log(
              `📊 分组 ${groupId} 验证结果: ${total_keys} 个密钥中 ${invalid_keys} 个无效, ${valid_keys} 个有效`
            );
            return { invalid_keys, valid_keys, total_keys };
          } else {
            console.log(`✅ 分组 ${groupId} 的密钥验证任务已完成`);
            return {};
          }
        }

        // 任务还在运行，继续等待
        console.log(
          `⏳ 分组 ${groupId} 验证进度: ${taskStatus.processed}/${taskStatus.total}`
        );
        await new Promise((resolve) => setTimeout(resolve, interval));
        elapsedTime += interval;
      } catch (statusError) {
        console.error(`检查任务状态失败: ${statusError.message}`);
        break;
      }
    }

    if (elapsedTime >= maxWaitTime) {
      console.log(`⚠️ 分组 ${groupId} 验证任务等待超时`);
    }

    return {};
  }

  /**
   * 获取分组的密钥统计信息
   */
  async getGroupKeyStats(instance, groupId) {
    try {
      const response = await instance.apiClient.get(`/groups/${groupId}/stats`);
      const keyStats = response.data?.data?.key_stats;

      if (keyStats) {
        console.log(
          `📊 分组 ${groupId} 密钥状态: 总计 ${keyStats.total_keys}, 有效 ${keyStats.active_keys}, 无效 ${keyStats.invalid_keys}`
        );
        return keyStats;
      } else {
        console.log(`⚠️ 无法获取分组 ${groupId} 的密钥统计信息`);
        return null;
      }
    } catch (error) {
      console.error(`获取分组 ${groupId} 密钥统计失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 从指定实例删除分组
   */
  async deleteGroup(instance, groupId) {
    try {
      await instance.apiClient.delete(`/groups/${groupId}`);
      console.log(`✅ 成功从实例 ${instance.name} 删除分组 ${groupId}`);
      return true;
    } catch (error) {
      console.error(
        `❌ 从实例 ${instance.name} 删除分组 ${groupId} 失败: ${error.message}`
      );
      // 即使是404（已不存在）也视为成功
      if (error.response && error.response.status === 404) {
        console.log(`ℹ️ 分组 ${groupId} 在实例 ${instance.name} 中已不存在`);
        return true;
      }
      return false;
    }
  }

  /**
   * 获取所有分组（从所有实例）
   */
  async getAllGroups() {
    const allGroups = [];

    for (const [instanceId, instance] of this.instances) {
      const health = this.healthStatus.get(instanceId);
      if (!health?.healthy) continue;

      try {
        const response = await instance.apiClient.get("/groups");
        let groups = [];

        // 处理不同的响应格式
        if (Array.isArray(response.data)) {
          // 直接是数组格式
          groups = response.data;
        } else if (
          response.data &&
          typeof response.data.code === "number" &&
          Array.isArray(response.data.data)
        ) {
          // gptload 特定格式: { code: 0, message: "Success", data: [...] }
          groups = response.data.data;
        } else if (response.data && Array.isArray(response.data.data)) {
          // 包装在 data 字段中
          groups = response.data.data;
        } else if (response.data && Array.isArray(response.data.groups)) {
          // 包装在 groups 字段中
          groups = response.data.groups;
        } else {
          console.warn(
            `实例 ${instance.name} 返回未知的分组数据格式:`,
            response.data
          );
          continue;
        }

        const processedGroups = groups.map((group) => ({
          ...group,
          _instance: {
            id: instance.id,
            name: instance.name,
            url: instance.url,
          },
        }));

        allGroups.push(...processedGroups);
        console.log(`✅ 从实例 ${instance.name} 获取 ${groups.length} 个分组`);
      } catch (error) {
        console.error(`获取实例 ${instance.name} 的分组失败:`, error.message);
      }
    }

    return allGroups;
  }
}

module.exports = new MultiGptloadManager();
