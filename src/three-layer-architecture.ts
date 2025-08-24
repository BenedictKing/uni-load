/**
 * 三层架构管理器
 *
 * 实现基于 gptload 的三层分组架构：
 * 第1层：站点分组 (sort=20) - 直接连接外部API
 * 第2层：模型-渠道分组 (sort=15) - 细粒度控制，每个模型在每个渠道的独立分组
 * 第3层：模型聚合分组 (sort=10) - 统一入口，聚合所有渠道的同一模型
 *
 * 核心理念：
 * 1. 利用 gptload 的密钥管理和黑名单机制
 * 2. 被动验证策略，避免API消耗
 * 3. 快速故障隔离和智能恢复
 */

const gptloadService = require("./gptload");
const modelConfig = require("./model-config");

class ThreeLayerArchitecture {
  constructor() {
    // 层级配置
    this.layerConfigs = {
      // 第1层：站点分组
      siteGroup: {
        sort: 20,
        blacklist_threshold: 99, // 高容错，站点问题通常是暂时的
        key_validation_interval_minutes: 60, // 1小时验证一次
      },

      // 第2层：模型-渠道分组（核心控制层）
      modelChannelGroup: {
        sort: 15,
        blacklist_threshold: 2, // 快速失败，立即识别不兼容组合
        key_validation_interval_minutes: 10080, // 7天验证一次，避免API消耗
      },

      // 第3层：模型聚合分组
      aggregateGroup: {
        sort: 10,
        blacklist_threshold: 50, // 中等容错
        key_validation_interval_minutes: 30, // 30分钟验证一次
        max_retries: 9, // 增加尝试次数，适合多上游
      },
    };

    // 恢复策略
    this.recoverySchedule = new Map(); // "model:channel" -> { nextRetry: Date, retryCount: number }
    this.failureHistory = new Map(); // "model:channel" -> { failures: number, lastFailure: Date }
    
    // 权重缓存，避免频繁的重复更新
    this.weightCache = new Map(); // groupId -> cached weights
  }

  /**
   * 初始化三层架构
   */
  async initialize() {
    console.log("🚀 初始化三层 gptload 架构...");

    try {
      // 1. 获取现有的站点分组（第1层）
      const siteGroups = await this.getSiteGroups();
      console.log(`✅ 第1层: 发现 ${siteGroups.length} 个站点分组`);

      // 2. 创建模型到站点的精确映射
      const modelSiteMap = new Map(); // 模型 -> 支持该模型的站点分组
      
      console.log("📊 分析每个站点分组支持的模型...");
      for (const siteGroup of siteGroups) {
        try {
          // 获取站点支持的实际模型列表
          const siteModels = await this.getValidatedModelsForSite(siteGroup);
          console.log(`🔍 站点 ${siteGroup.name}: 支持 ${siteModels.length} 个模型`);
          
          for (const model of siteModels) {
            if (!modelSiteMap.has(model)) {
              modelSiteMap.set(model, []);
            }
            modelSiteMap.get(model).push(siteGroup);
          }
        } catch (error) {
          console.error(`获取站点 ${siteGroup.name} 的模型失败:`, error.message);
        }
      }

      // 提取所有已验证的模型
      const models = Array.from(modelSiteMap.keys());
      console.log(`📊 发现 ${models.length} 个已验证可用模型`);
      console.log(`🎯 模型分布统计:`);
      modelSiteMap.forEach((sites, model) => {
        console.log(`  - ${model}: ${sites.length} 个站点支持`);
      });

      // 3. 创建模型-渠道分组（第2层）
      const modelChannelGroups = await this.createModelChannelGroups(
        models,
        siteGroups,
        modelSiteMap
      );
      console.log(
        `✅ 第2层: 创建 ${modelChannelGroups.length} 个模型-渠道分组`
      );

      // 4. 创建模型聚合分组（第3层）- 基于精确映射
      const aggregateGroups = [];
      console.log("🔧 为每个模型创建聚合分组...");
      
      for (const [model, supportingSites] of modelSiteMap) {
        try {
          // 仅选择支持该模型的模型-渠道分组
          const supportingChannels = modelChannelGroups.filter(group => 
            group.test_model === model && 
            supportingSites.some(site => group.name.includes(site.name))
          );
          
          if (supportingChannels.length > 0) {
            console.log(`🎯 模型 ${model}: 找到 ${supportingChannels.length} 个支持的渠道分组`);
            const aggregateGroup = await this.createAggregateGroupForModel(
              model,
              supportingChannels
            );
            if (aggregateGroup) {
              aggregateGroups.push(aggregateGroup);
            }
          } else {
            console.log(`⚠️ 模型 ${model}: 未找到支持的渠道分组，跳过聚合`);
          }
        } catch (error) {
          console.error(`为模型 ${model} 创建聚合分组失败:`, error.message);
        }
      }
      
      console.log(`✅ 第3层: 创建 ${aggregateGroups.length} 个模型聚合分组`);

      // 5. 设置被动恢复机制
      this.setupPassiveRecovery();
      console.log("🔄 被动恢复机制已启动");

      // 6. 启动权重优化
      this.startWeightOptimization();
      console.log("⚖️ 权重优化已启动");

      console.log("✅ 三层架构初始化完成");

      return {
        siteGroups: siteGroups.length,
        modelChannelGroups: modelChannelGroups.length,
        aggregateGroups: aggregateGroups.length,
        totalModels: models.length,
      };
    } catch (error) {
      console.error("❌ 三层架构初始化失败:", error);
      throw error;
    }
  }

  /**
   * 获取站点分组（第1层）
   */
  async getSiteGroups() {
    try {
      // 确保实例健康状态已检查
      await gptloadService.checkAllInstancesHealth();

      const allGroups = await gptloadService.getAllGroups();

      console.log(`🔍 检查所有分组 (共 ${allGroups.length} 个):`);
      allGroups.forEach((group) => {
        console.log(
          `  - ${group.name}: sort=${group.sort}, upstreams=${
            group.upstreams?.length || 0
          }`
        );
        if (group.upstreams && group.upstreams.length > 0) {
          group.upstreams.forEach((upstream) => {
            console.log(`    └─ ${upstream.url}`);
          });
        }
      });

      // 筛选站点分组：sort=20
      const siteGroups = allGroups.filter((group) => {
        return group.sort === 20;
      });

      console.log(`✅ 找到 ${siteGroups.length} 个站点分组 (sort=20)`);

      return siteGroups;
    } catch (error) {
      console.error("获取站点分组失败:", error);
      return [];
    }
  }

  /**
   * 从站点分组获取已验证的模型列表
   */
  async getValidatedModelsForSite(siteGroup) {
    try {
      // 优先使用 gptload 存储的已验证模型列表
      if (siteGroup.validated_models && Array.isArray(siteGroup.validated_models)) {
        console.log(`📋 使用站点 ${siteGroup.name} 的缓存模型列表 (${siteGroup.validated_models.length} 个)`);
        return modelConfig.filterModels(siteGroup.validated_models);
      }
      
      // 回退方案：从 API 重新获取
      const apiKeys = await gptloadService.getGroupApiKeys(
        siteGroup.id,
        siteGroup._instance.id
      );

      if (apiKeys.length === 0) {
        console.log(`⚠️ 站点 ${siteGroup.name} 没有可用的 API 密钥，跳过模型获取`);
        return [];
      }

      const modelsService = require("./models");
      const baseUrl = siteGroup.upstreams[0]?.url;

      if (!baseUrl) {
        console.log(`⚠️ 站点 ${siteGroup.name} 没有配置上游 URL，跳过模型获取`);
        return [];
      }

      console.log(`🔄 从站点 ${siteGroup.name} API 获取模型列表...`);
      const allModels = await modelsService.getModels(baseUrl, apiKeys[0]);
      const filteredModels = modelConfig.filterModels(allModels);
      
      console.log(`✅ 站点 ${siteGroup.name}: 获取到 ${allModels.length} 个模型，过滤后 ${filteredModels.length} 个`);
      
      return filteredModels;
    } catch (error) {
      console.error(`获取站点 ${siteGroup.name} 的模型失败:`, error.message);
      return [];
    }
  }

  /**
   * 从站点分组获取所有独特模型（保留兼容性）
   */
  async getAllUniqueModels(siteGroups) {
    const allModels = new Set();

    for (const siteGroup of siteGroups) {
      const models = await this.getValidatedModelsForSite(siteGroup);
      models.forEach((model) => allModels.add(model));
    }

    return Array.from(allModels);
  }

  /**
   * 创建模型-渠道分组（第2层）
   */
  async createModelChannelGroups(models, siteGroups, modelSiteMap = null) {
    console.log("🔧 创建模型-渠道分组（第2层）...");

    // 🔧 添加参数验证
    if (!models || !Array.isArray(models)) {
      console.error("❌ models 参数无效:", models);
      return [];
    }

    if (!siteGroups || !Array.isArray(siteGroups)) {
      console.error("❌ siteGroups 参数无效:", siteGroups);
      return [];
    }

    if (models.length === 0) {
      console.log("⚠️ 没有模型需要处理");
      return [];
    }

    if (siteGroups.length === 0) {
      console.log("⚠️ 没有站点分组需要处理");
      return [];
    }

    const groups = [];
    const config = this.layerConfigs.modelChannelGroup;

    // 计算总任务数 - 如果有精确映射，使用实际的模型-站点组合数
    let totalTasks;
    if (modelSiteMap) {
      totalTasks = 0;
      modelSiteMap.forEach((sites, model) => {
        totalTasks += sites.length;
      });
      console.log(`📊 基于精确映射处理 ${totalTasks} 个模型-站点组合`);
    } else {
      totalTasks = models.length * siteGroups.length;
      console.log(
        `📊 准备处理 ${models.length} 个模型 × ${siteGroups.length} 个站点 = ${totalTasks} 个任务`
      );
    }

    // 一次性获取所有分组信息，避免重复查询
    console.log("📊 获取现有分组信息...");
    let allExistingGroups;

    try {
      allExistingGroups = await gptloadService.getAllGroups();

      // 🔧 添加返回值验证
      if (!allExistingGroups || !Array.isArray(allExistingGroups)) {
        console.error("❌ getAllGroups 返回值无效:", allExistingGroups);
        allExistingGroups = [];
      }

      console.log(`✅ 获取到 ${allExistingGroups.length} 个现有分组`);
    } catch (error) {
      console.error("❌ 获取现有分组失败:", error.message);
      allExistingGroups = [];
      console.log("⚠️ 使用空数组继续处理");
    }

    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let processedTasks = 0;

    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const model = models[modelIndex];

      // 🔧 添加模型名称验证
      if (!model || typeof model !== "string") {
        console.error(`❌ 模型名称无效 (索引 ${modelIndex}):`, model);
        // 跳过计数调整
        const skipCount = modelSiteMap ? modelSiteMap.get(model)?.length || 0 : siteGroups.length;
        failedCount += skipCount;
        processedTasks += skipCount;
        continue;
      }

      console.log(`🎯 处理模型 ${modelIndex + 1}/${models.length}: ${model}`);

      let modelCreatedCount = 0;
      let modelSkippedCount = 0;
      let modelFailedCount = 0;

      // 获取该模型支持的站点分组（精确匹配）
      const supportingSites = modelSiteMap ? modelSiteMap.get(model) || [] : siteGroups;
      console.log(`📋 模型 ${model}: 将处理 ${supportingSites.length} 个支持的站点`);

      for (let siteIndex = 0; siteIndex < supportingSites.length; siteIndex++) {
        const site = supportingSites[siteIndex];
        processedTasks++;

        // 🔧 添加站点分组验证
        if (!site || !site.name) {
          console.error(`❌ 站点分组无效 (索引 ${siteIndex}):`, site);
          failedCount++;
          modelFailedCount++;
          continue;
        }

        try {
          // 生成分组名称
          const groupName = this.generateModelChannelGroupName(
            model,
            site.name
          );

          // 从缓存的分组列表中检查是否已存在
          const existing = allExistingGroups.find((g) => g.name === groupName);
          if (existing) {
            console.log(
              `ℹ️ [${processedTasks}/${totalTasks}] 分组已存在: ${groupName}`
            );
            groups.push(existing);
            skippedCount++;
            modelSkippedCount++;
            continue;
          }

          // 选择合适的实例
          const instance = await gptloadService.manager.selectBestInstance(
            site.upstreams[0]?.url || ""
          );

          if (!instance) {
            throw new Error("没有可用的 gptload 实例");
          }

          // 创建分组数据
          const groupData = {
            name: groupName,
            display_name: `${model} @ ${site.name}`,
            description: `${model} 模型通过 ${site.name} 渠道的专用分组`,
            upstreams: [
              {
                url: `${
                  site._instance?.url ||
                  process.env.GPTLOAD_URL ||
                  "http://localhost:3001"
                }/proxy/${site.name}`,
                weight: 1,
              },
            ],
            test_model: model,
            channel_type: site.channel_type || "openai",
            validation_endpoint: site.validation_endpoint,
            sort: config.sort, // 确保使用正确的 sort 值：15
            param_overrides: {},
            config: {
              blacklist_threshold: config.blacklist_threshold,
              key_validation_interval_minutes:
                config.key_validation_interval_minutes,
            },
            tags: ["layer-2", "model-channel", model, site.name],
          };

          // 直接调用实例 API 创建分组，避免 createSiteGroup 的 sort=20 覆盖
          const response = await instance.apiClient.post("/groups", groupData);

          // 处理响应
          let created;
          if (response.data && typeof response.data.code === "number") {
            if (response.data.code === 0) {
              created = response.data.data;
            } else {
              throw new Error(`创建失败: ${response.data.message}`);
            }
          } else {
            created = response.data;
          }

          // 添加实例信息
          created._instance = {
            id: instance.id,
            name: instance.name,
            url: instance.url,
          };

          if (created) {
            if (instance.token) {
              await gptloadService.manager.addApiKeysToGroup(
                instance,
                created.id,
                [instance.token]
              );
              console.log(
                `🔑 [${processedTasks}/${totalTasks}] 已为第二层分组添加实例认证token`
              );
            }

            groups.push(created);
            createdCount++;
            modelCreatedCount++;
            console.log(
              `✅ [${processedTasks}/${totalTasks}] 创建第2层分组: ${groupName} (sort=${config.sort})`
            );

            // 将新创建的分组添加到缓存中，避免重复创建
            allExistingGroups.push(created);
          }
        } catch (error) {
          const groupName = this.generateModelChannelGroupName(
            model,
            site.name
          );
          console.log(
            `⚠️ [${processedTasks}/${totalTasks}] 创建失败: ${groupName} - ${error.message}`
          );
          failedCount++;
          modelFailedCount++;
          this.recordIncompatibleCombination(model, site.name);
        }

        // 每处理10个任务显示一次进度
        if (processedTasks % 10 === 0 || processedTasks === totalTasks) {
          const progress = ((processedTasks / totalTasks) * 100).toFixed(1);
          console.log(
            `📈 总进度: ${processedTasks}/${totalTasks} (${progress}%) - 已创建: ${createdCount}, 跳过: ${skippedCount}, 失败: ${failedCount}`
          );
        }
      }

      // 每个模型处理完成后的统计
      console.log(
        `📊 模型 ${model} 处理完成: 创建 ${modelCreatedCount}, 跳过 ${modelSkippedCount}, 失败 ${modelFailedCount}`
      );
    }

    // 最终统计
    console.log(`✅ 第2层分组创建完成：`);
    console.log(`   - 新建: ${createdCount} 个`);
    console.log(`   - 跳过: ${skippedCount} 个`);
    console.log(`   - 失败: ${failedCount} 个`);
    console.log(`   - 总计: ${groups.length} 个分组`);
    console.log(
      `   - 成功率: ${(
        ((createdCount + skippedCount) / totalTasks) *
        100
      ).toFixed(1)}%`
    );

    return groups;
  }

  /**
   * 创建模型聚合分组（第3层）
   */
  async createAggregateGroups(models, modelChannelGroups) {
    console.log("🔧 创建模型聚合分组（第3层）...");

    // 🔧 添加参数验证
    if (!models || !Array.isArray(models)) {
      console.error("❌ models 参数无效:", models);
      return [];
    }

    if (!modelChannelGroups || !Array.isArray(modelChannelGroups)) {
      console.error("❌ modelChannelGroups 参数无效:", modelChannelGroups);
      return [];
    }

    if (models.length === 0) {
      console.log("⚠️ 没有模型需要处理");
      return [];
    }

    if (modelChannelGroups.length === 0) {
      console.log("⚠️ 没有模型渠道分组需要处理");
      return [];
    }

    const groups = [];
    const config = this.layerConfigs.aggregateGroup;

    // 按模型分组
    const groupedByModel = this.groupModelChannelsByModel(modelChannelGroups);

    // 🔧 添加分组结果验证
    if (!groupedByModel || groupedByModel.size === 0) {
      console.log("⚠️ 按模型分组后没有结果");
      return [];
    }

    const totalModels = groupedByModel.size;
    console.log(`📊 准备为 ${totalModels} 个模型创建聚合分组`);

    // 一次性获取现有分组信息
    let allExistingGroups;

    try {
      allExistingGroups = await gptloadService.getAllGroups();

      // 🔧 添加返回值验证
      if (!allExistingGroups || !Array.isArray(allExistingGroups)) {
        console.error("❌ getAllGroups 返回值无效:", allExistingGroups);
        allExistingGroups = [];
      }

      console.log(`✅ 获取到 ${allExistingGroups.length} 个现有分组`);
    } catch (error) {
      console.error("❌ 获取现有分组失败:", error.message);
      allExistingGroups = [];
      console.log("⚠️ 使用空数组继续处理");
    }

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let processedModels = 0;

    for (const [model, channelGroups] of groupedByModel) {
      processedModels++;
      try {
        const groupName = this.sanitizeModelName(model);

        console.log(
          `🎯 [${processedModels}/${totalModels}] 处理模型: ${model} (${channelGroups.length} 个渠道)`
        );

        // 从缓存中检查是否已存在
        const existing = allExistingGroups.find((g) => g.name === groupName);
        if (existing) {
          console.log(
            `ℹ️ [${processedModels}/${totalModels}] 聚合分组已存在: ${groupName}，更新配置...`
          );
          await this.updateAggregateUpstreams(existing, channelGroups);
          groups.push(existing);
          updatedCount++;
          continue;
        }

        // 🔧 添加渠道分组验证
        if (
          !channelGroups ||
          !Array.isArray(channelGroups) ||
          channelGroups.length === 0
        ) {
          console.log(
            `⚠️ [${processedModels}/${totalModels}] 模型 ${model} 没有有效的渠道分组`
          );
          failedCount++;
          continue;
        }

        // 创建上游列表
        const upstreams = channelGroups
          .filter((cg) => cg && cg.name) // 🔧 过滤无效的渠道分组
          .map((cg) => ({
            url: `${
              cg._instance?.url ||
              process.env.GPTLOAD_URL ||
              "http://localhost:3001"
            }/proxy/${cg.name}`,
            weight: 1,
          }));

        if (upstreams.length === 0) {
          console.log(
            `⚠️ [${processedModels}/${totalModels}] 模型 ${model} 没有可用的渠道分组`
          );
          failedCount++;
          continue;
        }

        // 创建聚合分组数据
        const groupData = {
          name: groupName,
          display_name: `${model} (聚合)`,
          description: `${model} 模型的聚合入口，包含 ${upstreams.length} 个渠道`,
          upstreams: upstreams,
          test_model: model,
          channel_type: channelGroups[0]?.channel_type || "openai",
          validation_endpoint: channelGroups[0]?.validation_endpoint,
          sort: config.sort,
          param_overrides: {},
          config: {
            blacklist_threshold: config.blacklist_threshold,
            key_validation_interval_minutes:
              config.key_validation_interval_minutes,
          },
          tags: ["layer-3", "model-aggregate", model],
        };

        // 创建分组
        const created = await gptloadService.createSiteGroup(
          groupName,
          upstreams[0].url,
          [],
          groupData.channel_type,
          {},
          [model],
          true // 标记为模型分组，直接使用指定模型
        );

        if (created) {
          // 更新为聚合配置
          await gptloadService.updateGroup(created.id, created._instance.id, {
            upstreams: upstreams,
            config: groupData.config,
            sort: config.sort,
          });

          // 获取实例并添加认证密钥
          const instance = gptloadService.manager.getInstance(
            created._instance.id
          );
          if (instance && instance.token) {
            await gptloadService.manager.addApiKeysToGroup(
              instance,
              created.id,
              [instance.token]
            );
            console.log(
              `🔑 [${processedModels}/${totalModels}] 已为第三层分组添加实例认证token`
            );
          }

          groups.push(created);
          createdCount++;
          console.log(
            `✅ [${processedModels}/${totalModels}] 创建聚合分组: ${groupName} (${upstreams.length}个上游)`
          );
        }
      } catch (error) {
        console.error(
          `❌ [${processedModels}/${totalModels}] 创建模型 ${model} 的聚合分组失败:`,
          error.message
        );
        failedCount++;
      }

      // 显示进度
      const progress = ((processedModels / totalModels) * 100).toFixed(1);
      if (processedModels % 5 === 0 || processedModels === totalModels) {
        console.log(
          `📈 第3层进度: ${processedModels}/${totalModels} (${progress}%) - 创建: ${createdCount}, 更新: ${updatedCount}, 失败: ${failedCount}`
        );
      }
    }

    // 最终统计
    console.log(`✅ 第3层分组处理完成：`);
    console.log(`   - 新建: ${createdCount} 个`);
    console.log(`   - 更新: ${updatedCount} 个`);
    console.log(`   - 失败: ${failedCount} 个`);
    console.log(`   - 总计: ${groups.length} 个聚合分组`);
    console.log(
      `   - 成功率: ${(
        ((createdCount + updatedCount) / totalModels) *
        100
      ).toFixed(1)}%`
    );

    return groups;
  }

  /**
   * 设置被动恢复机制
   */
  setupPassiveRecovery() {
    // 定期检查失败的组合
    setInterval(async () => {
      await this.performPassiveRecovery();
    }, 5 * 60 * 1000); // 每5分钟检查一次

    // 分析最近的请求日志
    setInterval(async () => {
      await this.analyzeRecentLogs();
    }, 60 * 1000); // 每分钟分析一次
  }

  /**
   * 执行被动恢复
   */
  async performPassiveRecovery() {
    for (const [combination, schedule] of this.recoverySchedule) {
      if (Date.now() >= schedule.nextRetry) {
        await this.attemptRecovery(combination);
      }
    }
  }

  /**
   * 尝试恢复单个组合
   */
  async attemptRecovery(combination) {
    const [model, channel] = combination.split(":");
    const groupName = this.generateModelChannelGroupName(model, channel);

    console.log(`🔄 尝试恢复 ${combination}...`);

    try {
      const group = await gptloadService.checkGroupExists(groupName);
      if (!group) {
        this.recoverySchedule.delete(combination);
        return;
      }

      // 获取密钥状态
      const keyStats = await gptloadService.getGroupKeyStats(group.id);

      if (keyStats.invalid_keys > 0) {
        // 恢复密钥
        await gptloadService.toggleApiKeysStatusForGroup(
          group.id,
          group._instance.id,
          "active"
        );

        console.log(`♻️ ${combination} 密钥已恢复`);
        this.recoverySchedule.delete(combination);
        this.failureHistory.delete(combination);
      } else {
        // 更新下次重试时间（指数退避）
        const currentSchedule = this.recoverySchedule.get(combination);
        const nextDelay = Math.min(
          1000 * Math.pow(2, currentSchedule.retryCount),
          3600 * 1000 // 最多1小时
        );

        this.recoverySchedule.set(combination, {
          nextRetry: Date.now() + nextDelay,
          retryCount: currentSchedule.retryCount + 1,
        });
      }
    } catch (error) {
      console.error(`恢复 ${combination} 失败:`, error.message);
    }
  }

  /**
   * 分析最近的日志
   */
  async analyzeRecentLogs() {
    try {
      // 这里可以集成 gptload 的日志API
      // 现在先用简单的统计信息替代
      const allGroups = await gptloadService.getAllGroups();

      for (const group of allGroups) {
        if (group.tags?.includes("layer-2")) {
          // 检查第2层分组的统计
          const stats = await gptloadService.getGroupStats(group.id);

          if (stats && stats.hourly_stats) {
            const failureRate = stats.hourly_stats.failure_rate || 0;

            if (failureRate > 0.5 && stats.hourly_stats.total_requests > 5) {
              // 高失败率，安排恢复
              const combination = this.extractModelChannelFromGroupName(
                group.name
              );
              this.scheduleRecovery(combination);
            }
          }
        }
      }
    } catch (error) {
      console.error("分析日志失败:", error.message);
    }
  }

  /**
   * 安排恢复任务
   */
  scheduleRecovery(combination) {
    if (!this.recoverySchedule.has(combination)) {
      this.recoverySchedule.set(combination, {
        nextRetry: Date.now() + 5 * 60 * 1000, // 5分钟后重试
        retryCount: 0,
      });

      console.log(`📅 安排恢复: ${combination}`);
    }
  }

  /**
   * 启动权重优化
   */
  startWeightOptimization() {
    // 每24小时优化一次权重，避免过于频繁的缓存重载
    setInterval(async () => {
      await this.optimizeAggregateWeights();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * 优化聚合分组的权重
   */
  async optimizeAggregateWeights() {
    console.log("⚖️ 开始聚合分组权重优化...");

    try {
      const allGroups = await gptloadService.getAllGroups();
      const aggregateGroups = allGroups.filter((g) =>
        g.tags?.includes("layer-3")
      );

      console.log(`📊 发现 ${aggregateGroups.length} 个聚合分组需要检查权重`);
      
      let updatedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const group of aggregateGroups) {
        try {
          const upstreamStats = [];

          // 收集每个上游的统计
          for (const upstream of group.upstreams || []) {
            const upstreamGroupName = this.extractGroupNameFromUrl(upstream.url);

            // 根据分组名查找分组ID
            const upstreamGroup = allGroups.find(
              (g) => g.name === upstreamGroupName
            );
            if (!upstreamGroup) {
              console.warn(`未找到上游分组: ${upstreamGroupName}，使用默认权重`);
              upstreamStats.push({
                url: upstream.url,
                weight: 1,
              });
              continue;
            }

            try {
              const stats = await this.getGroupStats(upstreamGroup.id);

              let weight = 1;
              if (stats && stats.hourly_stats) {
                const successRate = 1 - (stats.hourly_stats.failure_rate || 0);
                const avgTime = stats.hourly_stats.avg_response_time || 3000;

                // 权重算法：成功率 * 响应时间因子
                const timeFactor = Math.max(0.1, 1 - avgTime / 10000);
                weight = Math.max(1, Math.round(successRate * timeFactor * 100));
              }

              upstreamStats.push({
                url: upstream.url,
                weight: weight,
              });
            } catch (statsError) {
              console.warn(`获取分组 ${upstreamGroup.name} 统计失败: ${statsError.message}，使用默认权重`);
              upstreamStats.push({
                url: upstream.url,
                weight: 1,
              });
            }
          }

          // 检查缓存，避免重复更新相同权重
          const cachedWeights = this.getCachedWeights(group.id);
          if (cachedWeights && this.compareWeights(upstreamStats, cachedWeights)) {
            skippedCount++;
            continue; // 权重未变化，跳过更新
          }

          // 更新权重
          if (upstreamStats.length > 0) {
            await gptloadService.updateGroup(group.id, group._instance.id, {
              upstreams: upstreamStats,
            });
            
            // 更新缓存
            this.updateWeightCache(group.id, upstreamStats);
            updatedCount++;
            
            // 记录权重变化详情
            const weightChanges = upstreamStats.filter(us => us.weight !== 1).length;
            if (weightChanges > 0) {
              console.log(`📊 分组 ${group.name}: ${weightChanges}/${upstreamStats.length} 个上游权重被调整`);
            }
            
            // 添加延迟避免瞬时高负载
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (groupError) {
          console.error(`优化分组 ${group.name} 权重失败: ${groupError.message}`);
          errorCount++;
        }
      }
      
      console.log(`✅ 权重优化完成: 更新了 ${updatedCount} 个分组，跳过了 ${skippedCount} 个分组（权重未变化），${errorCount} 个分组出错`);
      
      // 如果有大量错误，记录警告
      if (errorCount > aggregateGroups.length * 0.3) {
        console.warn(`⚠️ 权重优化中有 ${errorCount} 个分组出错，可能需要检查系统状态`);
      }
      
    } catch (error) {
      console.error("权重优化失败:", error.message);
    }
  }

  /**
   * 获取分组的统计信息
   */
  async getGroupStats(groupId) {
    try {
      const allGroups = await gptloadService.getAllGroups();
      const group = allGroups.find((g) => g.id === groupId);

      if (!group) {
        return null;
      }

      // 使用 gptload 内置的统计接口
      const instance = gptloadService.manager.getInstance(group._instance.id);
      if (!instance) {
        return null;
      }

      const response = await instance.apiClient.get(`/groups/${groupId}/stats`);

      if (response.data && typeof response.data.code === "number") {
        return response.data.data;
      }
      return response.data;
    } catch (error) {
      console.error(`获取分组 ${groupId} 统计信息失败:`, error.message);
      return null;
    }
  }

  // 工具方法
  generateModelChannelGroupName(model, channelName) {
    return `${this.sanitizeModelName(model)}-via-${channelName}`.toLowerCase();
  }

  generateIdentityKey(model, channel) {
    return `key-${model}-${channel}-${Date.now()}`.replace(
      /[^a-zA-Z0-9-]/g,
      "-"
    );
  }

  generateAggregateKey(model) {
    return `key-aggregate-${model}`.replace(/[^a-zA-Z0-9-]/g, "-");
  }

  sanitizeModelName(modelName) {
    return modelName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");
  }

  groupModelChannelsByModel(modelChannelGroups) {
    const grouped = new Map();

    for (const group of modelChannelGroups) {
      const model = group.test_model;
      if (!grouped.has(model)) {
        grouped.set(model, []);
      }
      grouped.get(model).push(group);
    }

    return grouped;
  }

  extractGroupNameFromUrl(url) {
    const match = url.match(/\/proxy\/([^\/]+)/);
    return match ? match[1] : null;
  }

  extractModelChannelFromGroupName(groupName) {
    // 从 "model-via-channel" 格式中提取
    const match = groupName.match(/^(.+)-via-(.+)$/);
    return match ? `${match[1]}:${match[2]}` : null;
  }

  recordIncompatibleCombination(model, channel) {
    // 记录不兼容的组合，避免重复尝试
    const combination = `${model}:${channel}`;
    console.log(`📝 记录不兼容组合: ${combination}`);
  }

  async updateAggregateUpstreams(existingGroup, channelGroups) {
    const newUpstreams = channelGroups.map((cg) => ({
      url: `${
        cg._instance?.url || process.env.GPTLOAD_URL || "http://localhost:3001"
      }/proxy/${cg.name}`,
      weight: 1,
    }));

    await gptloadService.updateGroup(
      existingGroup.id,
      existingGroup._instance.id,
      { upstreams: newUpstreams }
    );

    console.log(`🔄 更新聚合分组 ${existingGroup.name} 的上游`);
  }

  /**
   * 创建单个模型的聚合分组
   */
  async createAggregateGroupForModel(model, supportingChannels) {
    const config = this.layerConfigs.aggregateGroup;
    const groupName = this.sanitizeModelName(model);

    try {
      console.log(`🔧 为模型 ${model} 创建聚合分组: ${groupName}...`);

      // 检查是否已存在
      const allGroups = await gptloadService.getAllGroups();
      const existing = allGroups.find((g) => g.name === groupName);
      if (existing) {
        console.log(`ℹ️ 聚合分组 ${groupName} 已存在，更新配置...`);
        await this.updateAggregateUpstreams(existing, supportingChannels);
        return existing;
      }

      // 🔧 添加渠道分组验证
      if (!supportingChannels || !Array.isArray(supportingChannels) || supportingChannels.length === 0) {
        console.log(`⚠️ 模型 ${model} 没有有效的支持渠道分组`);
        return null;
      }

      // 创建上游列表
      const upstreams = supportingChannels
        .filter((cg) => cg && cg.name) // 🔧 过滤无效的渠道分组
        .map((cg) => ({
          url: `${
            cg._instance?.url ||
            process.env.GPTLOAD_URL ||
            "http://localhost:3001"
          }/proxy/${cg.name}`,
          weight: 1,
        }));

      if (upstreams.length === 0) {
        console.log(`⚠️ 模型 ${model} 没有可用的渠道分组`);
        return null;
      }

      // 创建聚合分组数据
      const groupData = {
        name: groupName,
        display_name: `${model} (聚合)`,
        description: `${model} 模型的聚合入口，包含 ${upstreams.length} 个渠道`,
        upstreams: upstreams,
        test_model: model,
        channel_type: supportingChannels[0]?.channel_type || "openai",
        validation_endpoint: supportingChannels[0]?.validation_endpoint,
        sort: config.sort,
        param_overrides: {},
        config: {
          blacklist_threshold: config.blacklist_threshold,
          key_validation_interval_minutes:
            config.key_validation_interval_minutes,
        },
        tags: ["layer-3", "model-aggregate", model],
      };

      // 创建分组
      const created = await gptloadService.createSiteGroup(
        groupName,
        upstreams[0].url,
        [],
        groupData.channel_type,
        {},
        [model]
      );

      if (created) {
        // 更新为聚合配置
        await gptloadService.updateGroup(created.id, created._instance.id, {
          upstreams: upstreams,
          config: groupData.config,
          sort: config.sort,
        });

        // 获取实例并添加认证密钥
        const instance = gptloadService.manager.getInstance(
          created._instance.id
        );
        if (instance && instance.token) {
          await gptloadService.manager.addApiKeysToGroup(
            instance,
            created.id,
            [instance.token]
          );
          console.log(`🔑 已为聚合分组添加实例认证token`);
        }

        console.log(
          `✅ 创建聚合分组: ${groupName} (${upstreams.length}个上游)`
        );
        return created;
      }

      return null;
    } catch (error) {
      console.error(`❌ 创建模型 ${model} 的聚合分组失败:`, error.message);
      return null;
    }
  }

  /**
   * 获取架构状态
   */
  async getArchitectureStatus() {
    try {
      const allGroups = await gptloadService.getAllGroups();

      const siteGroups = allGroups.filter((g) => g.sort === 20);
      const modelChannelGroups = allGroups.filter((g) =>
        g.tags?.includes("layer-2")
      );
      const aggregateGroups = allGroups.filter((g) =>
        g.tags?.includes("layer-3")
      );

      return {
        layers: {
          layer1: {
            name: "站点分组",
            count: siteGroups.length,
            groups: siteGroups.map((g) => g.name),
          },
          layer2: {
            name: "模型-渠道分组",
            count: modelChannelGroups.length,
            groups: modelChannelGroups.map((g) => g.name),
          },
          layer3: {
            name: "模型聚合分组",
            count: aggregateGroups.length,
            groups: aggregateGroups.map((g) => g.name),
          },
        },
        recovery: {
          scheduled: this.recoverySchedule.size,
          failed: this.failureHistory.size,
        },
      };
    } catch (error) {
      console.error("获取架构状态失败:", error);
      return null;
    }
  }

  /**
   * 手动触发恢复
   */
  async manualRecovery(model, channel) {
    const combination = `${model}:${channel}`;
    console.log(`🔧 手动触发恢复: ${combination}`);

    await this.attemptRecovery(combination);
    return this.getRecoveryStatus(combination);
  }

  getRecoveryStatus(combination) {
    return {
      scheduled: this.recoverySchedule.has(combination),
      nextRetry: this.recoverySchedule.get(combination)?.nextRetry,
      failures: this.failureHistory.get(combination)?.failures || 0,
    };
  }

  /**
   * 获取缓存的权重
   */
  getCachedWeights(groupId) {
    return this.weightCache.get(groupId);
  }

  /**
   * 更新权重缓存
   */
  updateWeightCache(groupId, weights) {
    this.weightCache.set(groupId, JSON.parse(JSON.stringify(weights)));
  }

  /**
   * 比较两个权重配置是否相同
   */
  compareWeights(newWeights, cachedWeights) {
    if (!newWeights || !cachedWeights) return false;
    if (newWeights.length !== cachedWeights.length) return false;
    
    // 按URL排序后比较
    const sortedNew = [...newWeights].sort((a, b) => a.url.localeCompare(b.url));
    const sortedCached = [...cachedWeights].sort((a, b) => a.url.localeCompare(b.url));
    
    for (let i = 0; i < sortedNew.length; i++) {
      if (sortedNew[i].url !== sortedCached[i].url || 
          sortedNew[i].weight !== sortedCached[i].weight) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 停止服务
   */
  stop() {
    // 清理定时器等资源
    if (this.weightCache) {
      this.weightCache.clear();
    }
    console.log("🛑 三层架构管理器已停止");
  }

  /**
   * 从分组名称中提取模型名
   */
  extractModelFromGroupName(groupName) {
    // 处理 "model-via-channel" 格式
    const viaMatch = groupName.match(/^(.+)-via-(.+)$/);
    if (viaMatch) {
      return viaMatch[1];
    }

    // 处理其他格式
    const parts = groupName.split("-");
    if (parts.length >= 2) {
      // 假设模型名是前几个部分
      return parts.slice(0, -1).join("-");
    }

    return groupName;
  }

  /**
   * 从第2层分组中提取渠道名
   */
  extractChannelFromLayer2Group(group) {
    // 方法1: 从分组名称提取
    const viaMatch = group.name.match(/^(.+)-via-(.+)$/);
    if (viaMatch) {
      return viaMatch[2];
    }

    // 方法2: 从上游URL提取
    if (group.upstreams && group.upstreams.length > 0) {
      const upstream = group.upstreams[0];
      const proxyMatch = upstream.url.match(/\/proxy\/([^\/\?]+)/);
      if (proxyMatch) {
        return proxyMatch[1];
      }
    }

    // 方法3: 从标签提取
    if (group.tags) {
      // 寻找可能是渠道名的标签
      const possibleChannels = group.tags.filter(
        (tag) => !["layer-2", "model-channel"].includes(tag) && tag.length > 2
      );

      if (possibleChannels.length > 0) {
        return possibleChannels[possibleChannels.length - 1]; // 取最后一个，通常是渠道名
      }
    }

    return "unknown";
  }
}

// 导出单例
const threeLayerArchitecture = new ThreeLayerArchitecture();

// 优雅关闭
process.on("SIGINT", () => {
  threeLayerArchitecture.stop();
});

process.on("SIGTERM", () => {
  threeLayerArchitecture.stop();
});

module.exports = threeLayerArchitecture;
