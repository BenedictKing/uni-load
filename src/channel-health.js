/**
 * 渠道健康监控服务
 *
 * 主要功能：
 * 1. 通过 gptload 的日志 API 分析渠道健康状况
 * 2. 直接测试 API 连接作为补充检测手段
 * 3. 自动移除持续失败的渠道
 * 4. 生成详细的健康报告
 *
 * 使用的 gptload API：
 * - GET /logs - 获取请求日志进行健康分析
 * - GET /keys - 获取API密钥进行直接测试
 */

const gptloadService = require("./gptload");
const fs = require("fs").promises;
const path = require("path");

// 高消耗模型模式 - 这些模型不能在分组中自动验证
const HIGH_COST_MODEL_PATTERNS = [
  "o3-", // OpenAI O3 系列
  "gpt-5-", // GPT-5 系列
  "grok-4-", // Grok 4 系列
  "opus-", // Claude Opus 系列
];

/**
 * 检查模型是否为高消耗模型
 */
function isHighCostModel(modelName) {
  if (!modelName) return false;

  const modelNameLower = modelName.toLowerCase();

  // 检查是否包含任何高消耗模型模式
  return HIGH_COST_MODEL_PATTERNS.some((pattern) => {
    return modelNameLower.includes(pattern.toLowerCase());
  });
}

class ChannelHealthMonitor {
  constructor() {
    this.monitorInterval = null;
    this.checkIntervalMinutes = process.env.CHANNEL_CHECK_INTERVAL || 30; // 默认30分钟
    this.failureThreshold = process.env.CHANNEL_FAILURE_THRESHOLD || 3; // 连续失败3次后移除
    this.isRunning = false;
    this.channelFailures = new Map(); // 记录渠道失败次数
  }

  /**
   * 启动渠道健康监控
   */
  start() {
    if (this.monitorInterval) {
      console.log("⚠️ 渠道健康监控已在运行");
      return;
    }

    console.log(
      `🩺 启动渠道健康监控，检查间隔：${this.checkIntervalMinutes}分钟`
    );

    // 立即执行一次
    this.checkChannelHealth();

    // 设置定时任务
    this.monitorInterval = setInterval(() => {
      this.checkChannelHealth();
    }, this.checkIntervalMinutes * 60 * 1000);
  }

  /**
   * 停止渠道健康监控
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log("🛑 渠道健康监控已停止");
    }
  }

  /**
   * 检查渠道健康状态
   */
  async checkChannelHealth() {
    if (this.isRunning) {
      console.log("⏳ 渠道健康检查正在进行中，跳过本次执行");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    console.log(`🩺 开始渠道健康检查 - ${new Date().toISOString()}`);

    try {
      // 方法1: 通过API检查渠道状态
      await this.checkChannelsByAPI();

      // 方法2: 通过日志API分析渠道健康状况
      await this.checkChannelsByLogs();

      const duration = (Date.now() - startTime) / 1000;
      console.log(`🏁 渠道健康检查完成，耗时 ${duration.toFixed(2)}s`);
    } catch (error) {
      console.error("💥 渠道健康检查过程中发生错误:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 通过API检查渠道状态
   */
  async checkChannelsByAPI() {
    try {
      const allGroups = await gptloadService.getAllGroups();
      const siteGroups = this.filterSiteGroups(allGroups);

      console.log(`📊 检查 ${siteGroups.length} 个站点分组的健康状态`);

      let skippedCount = 0;
      let checkedCount = 0;

      for (const siteGroup of siteGroups) {
        const result = await this.testSiteGroupHealth(siteGroup);
        if (result && result.skipped) {
          skippedCount++;
        } else {
          checkedCount++;
        }
      }

      if (skippedCount > 0) {
        console.log(
          `📊 健康检查完成：检查了 ${checkedCount} 个分组，跳过了 ${skippedCount} 个高消耗模型分组`
        );
      }
    } catch (error) {
      console.error("API健康检查失败:", error.message);
    }
  }

  /**
   * 过滤出站点分组（只处理程序建立的渠道）
   */
  filterSiteGroups(allGroups) {
    return allGroups.filter((group) => {
      if (!group.upstreams || group.upstreams.length === 0) {
        return false;
      }

      // 只处理排序号为20的渠道（程序建立的渠道）
      if (group.sort !== 20) {
        return false;
      }

      // 站点分组的特征：指向外部URL
      const hasExternalUpstream = group.upstreams.some(
        (upstream) => !upstream.url.includes("/proxy/")
      );
      return hasExternalUpstream;
    });
  }

  /**
   * 测试站点分组健康状态
   */
  async testSiteGroupHealth(siteGroup) {
    const groupName = siteGroup.name;

    // 检查是否使用高消耗模型
    if (siteGroup.test_model && isHighCostModel(siteGroup.test_model)) {
      console.log(
        `⚠️ 分组 ${groupName} 使用高消耗模型 ${siteGroup.test_model}，跳过自动验证`
      );
      console.log(`💡 提示：请手动验证此分组的健康状态，避免产生高额费用`);
      console.log(
        `   可以通过 gptload 管理界面手动触发验证，或使用低消耗模型进行测试`
      );

      // 记录跳过的原因但不增加失败计数
      return {
        skipped: true,
        reason: "high_cost_model",
        model: siteGroup.test_model,
        message: `使用高消耗模型 ${siteGroup.test_model}，需要手动验证`,
      };
    }

    try {
      // 优先使用 gptload 的分组验证接口
      const validationResult = await this.validateGroupHealth(siteGroup);

      if (validationResult.success) {
        // 验证成功，渠道健康
        if (this.channelFailures.has(groupName)) {
          console.log(
            `✅ 渠道 ${groupName} 验证通过，正在重新激活相关模型分组的 API 密钥...`
          );

          try {
            // 获取所有分组，找到依赖该渠道的模型分组
            const allGroups = await gptloadService.getAllGroups();
            const dependentModelGroups = allGroups.filter((group) =>
              group.upstreams?.some((upstream) =>
                upstream.url.includes(`/proxy/${groupName}`)
              )
            );

            let activatedGroupsCount = 0;
            for (const modelGroup of dependentModelGroups) {
              try {
                console.log(
                  `🔄 准备恢复模型分组 ${modelGroup.name} 的无效密钥...`
                );
                const restoredCount =
                  await gptloadService.toggleApiKeysStatusForGroup(
                    modelGroup.id,
                    modelGroup._instance.id,
                    "active"
                  );
                console.log(
                  `✅ 成功恢复模型分组 ${modelGroup.name} 的 ${restoredCount} 个密钥`
                );
                activatedGroupsCount++;
              } catch (error) {
                console.error(
                  `恢复模型分组 ${modelGroup.name} 的密钥失败:`,
                  error.message
                );
              }
            }

            console.log(
              `👍 渠道 ${groupName} 恢复：共激活了 ${activatedGroupsCount} 个模型分组的密钥`
            );
          } catch (error) {
            console.error(`激活渠道 ${groupName} 相关密钥失败:`, error.message);
          }

          // 重置失败计数
          console.log(`✅ ${groupName}: 验证通过，重置失败计数`);
          this.channelFailures.delete(groupName);
        }
      } else {
        // 验证失败，记录失败
        const errorContext = {
          validationResult: validationResult.validationResult,
          errorType: 'validation_failure',
          responseData: validationResult
        };
        await this.recordChannelFailure(groupName, validationResult.error, errorContext);
      }
    } catch (error) {
      const errorContext = {
        errorType: 'api_call_failure',
        httpStatus: error.response?.status,
        responseData: error.response?.data,
        requestData: { group_id: siteGroup.id },
        errorName: error.name,
        errorCode: error.code
      };
      await this.recordChannelFailure(groupName, error.message, errorContext);
    }
  }

  /**
   * 使用 gptload 的 validate-group 接口验证分组健康状况
   */
  async validateGroupHealth(siteGroup) {
    const gptloadService = require("./gptload");
    const instance = gptloadService.manager.getInstance(siteGroup._instance.id);

    if (!instance) {
      throw new Error(`实例 ${siteGroup._instance.id} 不存在`);
    }

    try {
      console.log(
        `🔍 使用 validate-group 接口验证分组 ${siteGroup.name} 的健康状况...`
      );
      console.log(`📝 分组ID: ${siteGroup.id}, 实例ID: ${siteGroup._instance.id}`);
      console.log(`📝 分组配置: ${JSON.stringify({
        name: siteGroup.name,
        sort: siteGroup.sort,
        upstreams: siteGroup.upstreams?.length || 0,
        test_model: siteGroup.test_model
      })}`);

      // 调用 gptload 的分组验证接口
      const response = await instance.apiClient.post("/keys/validate-group", {
        group_id: siteGroup.id,
      });

      console.log(`📝 验证响应状态: ${response.status}`);
      console.log(`📝 验证响应头: ${JSON.stringify(response.headers)}`);
      console.log(`📝 验证响应数据: ${JSON.stringify(response.data)}`);

      // 处理验证结果
      let result = response.data;
      if (response.data && typeof response.data.code === "number") {
        // gptload 特定格式
        console.log(`📝 检测到gptload特定格式，code: ${response.data.code}`);
        result = response.data.data;
        console.log(`📝 解析后的结果数据: ${JSON.stringify(result)}`);
      }

      if (result && result.valid) {
        console.log(`✅ 分组 ${siteGroup.name} 验证通过`);
        console.log(`📝 验证详情: ${JSON.stringify(result)}`);
        return {
          success: true,
          validationResult: result,
        };
      } else {
        const error = result?.error || result?.message || "分组验证失败";
        console.log(`❌ 分组 ${siteGroup.name} 验证失败: ${error}`);
        console.log(`📝 失败详情: ${JSON.stringify(result)}`);
        
        // 如果是对象形式的错误，尝试提取更多信息
        if (typeof result === 'object' && result !== null) {
          if (result.errors && Array.isArray(result.errors)) {
            console.log(`📝 具体错误列表:`);
            result.errors.forEach((err, index) => {
              console.log(`  ${index + 1}. ${JSON.stringify(err)}`);
            });
          }
          if (result.details) {
            console.log(`📝 错误详细信息: ${JSON.stringify(result.details)}`);
          }
        }
        
        return {
          success: false,
          error: error,
          validationResult: result,
        };
      }
    } catch (error) {
      console.log(
        `❌ 分组 ${siteGroup.name} 验证接口调用失败: ${error.message}`
      );
      
      // 添加详细的错误日志
      console.log(`📝 错误详情:`);
      console.log(`  - 错误类型: ${error.name || 'Unknown'}`);
      console.log(`  - 错误代码: ${error.code || 'N/A'}`);
      console.log(`  - 错误堆栈: ${error.stack || 'N/A'}`);
      
      if (error.response) {
        console.log(`  - 响应状态: ${error.response.status}`);
        console.log(`  - 响应头: ${JSON.stringify(error.response.headers)}`);
        console.log(`  - 响应数据: ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        console.log(`  - 请求信息: ${JSON.stringify(error.request)}`);
      } else {
        console.log(`  - 其他错误信息: ${error.message}`);
      }

      // 409 错误特殊处理：任务已在运行
      if (error.response && error.response.status === 409) {
        console.log(
          `⚠️ 分组 ${siteGroup.name} 的验证任务已在运行中，等待完成...`
        );

        // 调用 multi-gptload 中的方法
        const waitResult =
          await gptloadService.manager.waitForExistingValidationTask(
            instance,
            siteGroup.id
          );

        if (waitResult.success) {
          console.log(`✅ 分组 ${siteGroup.name} 现有验证任务完成`);
          return waitResult;
        } else {
          return {
            success: false,
            error: `验证任务超时或失败: ${waitResult.error}`,
          };
        }
      }

      // 如果验证接口不可用，回退到原有的检查方法
      if (
        error.response &&
        (error.response.status === 404 || error.response.status === 405)
      ) {
        console.log(`⚠️ 验证接口不存在或不可用，回退到日志分析和直接健康检查`);
        return await this.performHealthCheckFallback(siteGroup);
      }

      // 其他错误视为验证失败
      return {
        success: false,
        error: `验证接口调用失败: ${error.message}`,
      };
    }
  }

  /**
   * 回退的健康检查方法（原有逻辑）
   */
  async performHealthCheckFallback(siteGroup) {
    try {
      // 使用 gptload 的日志接口进行健康检查
      const healthResult = await gptloadService.analyzeChannelHealth(
        siteGroup.name,
        siteGroup._instance.id,
        1 // 检查最近1小时的数据
      );

      console.log(
        `🔍 日志分析 ${siteGroup.name}: 成功率 ${healthResult.successRate}%, 响应时间 ${healthResult.avgResponseTime}ms`
      );

      // 判断是否健康
      if (healthResult.status === "healthy") {
        return { success: true, healthResult };
      } else if (healthResult.status === "no_data") {
        // 没有数据时，尝试直接测试接口
        return await this.directHealthCheck(siteGroup);
      } else {
        return {
          success: false,
          error: `${healthResult.message} (${healthResult.status})`,
          healthResult,
        };
      }
    } catch (error) {
      console.log(`⚠️ 日志分析失败，尝试直接检测: ${error.message}`);
      // 如果日志分析失败，尝试直接检测
      return await this.directHealthCheck(siteGroup);
    }
  }

  /**
   * 直接健康检查（当日志不可用时）
   */
  async directHealthCheck(siteGroup) {
    try {
      const baseUrl = siteGroup.upstreams[0]?.url;
      if (!baseUrl) {
        throw new Error("没有找到上游URL");
      }

      // 获取API密钥进行测试
      const apiKeys = await gptloadService.getGroupApiKeys(
        siteGroup.id,
        siteGroup._instance.id
      );
      if (apiKeys.length === 0) {
        throw new Error("没有找到有效的API密钥");
      }

      const apiKey = apiKeys[0];
      console.log(`🔗 直接测试 ${siteGroup.name}: ${baseUrl}`);

      // 使用 modelsService 测试连接
      const modelsService = require("./models");
      const models = await modelsService.getModels(baseUrl, apiKey);

      if (models && models.length > 0) {
        console.log(
          `✅ ${siteGroup.name}: 直接测试成功，发现 ${models.length} 个模型`
        );
        return { success: true, models: models.length };
      } else {
        throw new Error("未能获取到模型列表");
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 记录渠道失败
   */
  async recordChannelFailure(groupName, errorMessage, errorContext = null) {
    const currentFailures = this.channelFailures.get(groupName) || 0;
    const newFailures = currentFailures + 1;

    this.channelFailures.set(groupName, newFailures);

    console.log(
      `❌ ${groupName}: 失败 (${newFailures}/${this.failureThreshold}) - ${errorMessage}`
    );

    // 添加详细的错误上下文
    if (errorContext) {
      console.log(`📝 错误上下文:`);
      if (errorContext.validationResult) {
        console.log(`  - 验证结果: ${JSON.stringify(errorContext.validationResult)}`);
      }
      if (errorContext.httpStatus) {
        console.log(`  - HTTP状态码: ${errorContext.httpStatus}`);
      }
      if (errorContext.responseData) {
        console.log(`  - 响应数据: ${JSON.stringify(errorContext.responseData)}`);
      }
      if (errorContext.requestData) {
        console.log(`  - 请求数据: ${JSON.stringify(errorContext.requestData)}`);
      }
      if (errorContext.errorType) {
        console.log(`  - 错误类型: ${errorContext.errorType}`);
      }
    }

    if (newFailures >= this.failureThreshold) {
      console.log(`🚨 ${groupName}: 达到失败阈值，准备移除`);
      await this.removeFailedChannel(groupName);
    }
  }

  /**
   * 移除失败的渠道
   */
  async removeFailedChannel(groupName) {
    try {
      console.log(`🗑️ 开始处理失败的渠道: ${groupName}`);

      const allGroups = await gptloadService.getAllGroups();
      const siteGroupToRemove = allGroups.find(
        (g) => g.name === groupName && g.sort === 20
      );

      if (!siteGroupToRemove) {
        console.error(`未找到要处理的站点分组: ${groupName}`);
        return;
      }

      // 如果分组已经是 disabled 状态，则无需重复操作
      if (siteGroupToRemove.status === "disabled") {
        console.log(`ℹ️ 渠道 ${groupName} 已处于禁用状态，跳过处理`);
        return;
      }

      const modelGroups = allGroups.filter((group) =>
        group.upstreams?.some((upstream) =>
          upstream.url.includes(`/proxy/${groupName}`)
        )
      );

      let wasSoftDisabled = false;
      let updatedGptloadUpstreams = 0;

      for (const modelGroup of modelGroups) {
        const success = await this.removeUpstreamFromModelGroup(
          modelGroup,
          groupName
        );
        if (success) {
          updatedGptloadUpstreams++;
        } else {
          // 如果移除失败是因为它是最后一个上游，则标记需要软禁用
          wasSoftDisabled = true;
        }
      }

      // 核心逻辑：如果任何模型分组因为此渠道是最后一个上游而跳过了移除，
      // 我们就软禁用依赖该渠道的模型分组的密钥，而不是去动 uni-api 配置。
      if (wasSoftDisabled) {
        console.log(
          `🔒 渠道 ${groupName} 是部分模型分组的最后一个上游，将禁用相关模型分组的API密钥来禁用它们，以避免重启uni-api。`
        );

        // 禁用所有依赖该渠道的模型分组的密钥
        let disabledGroupsCount = 0;
        let skippedGroupsCount = 0;

        for (const modelGroup of modelGroups) {
          const hasThisChannelAsUpstream = modelGroup.upstreams?.some(
            (upstream) => upstream.url.includes(`/proxy/${groupName}`)
          );

          if (hasThisChannelAsUpstream) {
            try {
              console.log(
                `🔄 准备验证并禁用模型分组 ${modelGroup.name} 的失效密钥...`
              );
              const result = await gptloadService.toggleApiKeysStatusForGroup(
                modelGroup.id,
                modelGroup._instance.id,
                "disabled"
              );

              if (result && result.success === true) {
                console.log(
                  `✅ 成功禁用模型分组 ${modelGroup.name} 的失效密钥`
                );
                disabledGroupsCount++;
              } else if (
                result &&
                result.success === false &&
                result.reason === "keys_still_valid_after_retries"
              ) {
                console.log(
                  `ℹ️ 模型分组 ${modelGroup.name} 的密钥经过验证后仍然有效，跳过禁用`
                );
                skippedGroupsCount++;
              } else {
                console.log(`✅ 模型分组 ${modelGroup.name} 的密钥验证完成`);
                disabledGroupsCount++;
              }
            } catch (error) {
              console.error(
                `❌ 禁用模型分组 ${modelGroup.name} 的密钥失败: ${error.message}`
              );
            }
          }
        }

        console.log(
          `✅ 渠道处理完成: 禁用了 ${disabledGroupsCount} 个模型分组，跳过了 ${skippedGroupsCount} 个模型分组（密钥仍有效）`
        );
      }

      console.log(`✅ 已完成对渠道 ${groupName} 的清理操作`);

      // 重置失败计数
      this.channelFailures.delete(groupName);

      // 记录移除操作
      await this.logChannelRemoval(
        groupName,
        updatedGptloadUpstreams,
        wasSoftDisabled
      );
    } catch (error) {
      console.error(`处理渠道 ${groupName} 失败:`, error.message);
    }
  }

  /**
   * 从模型分组中移除上游
   */
  async removeUpstreamFromModelGroup(modelGroup, siteGroupName) {
    try {
      // 从所有可能的实例URL中构建上游路径
      const upstreamUrlPart = `/proxy/${siteGroupName}`;

      // 过滤掉要移除的上游
      const updatedUpstreams = modelGroup.upstreams.filter(
        (upstream) => !upstream.url.includes(upstreamUrlPart)
      );

      if (updatedUpstreams.length < modelGroup.upstreams.length) {
        // 有上游被移除，更新分组
        if (updatedUpstreams.length === 0) {
          console.log(
            `⚠️ 模型分组 ${modelGroup.name} 将没有可用上游，跳过移除上游操作`
          );
          return false; // 返回 false 表示跳过
        }

        const updateData = { upstreams: updatedUpstreams };

        // 调用 gptload 服务来更新分组
        await gptloadService.updateGroup(
          modelGroup.id,
          modelGroup._instance.id,
          updateData
        );

        console.log(
          `➖ 从模型分组 ${modelGroup.name} 中移除了上游 ${siteGroupName}`
        );

        return true; // 返回 true 表示成功
      }

      return false; // 没有找到匹配的上游，也算作没有移除成功
    } catch (error) {
      console.error(
        `从模型分组 ${modelGroup.name} 移除上游失败:`,
        error.message
      );
      return false;
    }
  }

  /**
   * 通过 gptload 日志 API 分析渠道健康状况
   */
  async checkChannelsByLogs() {
    try {
      console.log("📊 开始通过日志 API 分析渠道健康状况");

      const allGroups = await gptloadService.getAllGroups();
      const siteGroups = this.filterSiteGroups(allGroups);

      for (const siteGroup of siteGroups) {
        try {
          // 使用日志 API 分析渠道健康状况
          const healthResult = await gptloadService.analyzeChannelHealth(
            siteGroup.name,
            siteGroup._instance.id,
            2 // 检查最近2小时的数据
          );

          if (
            healthResult.status === "critical" ||
            healthResult.status === "warning"
          ) {
            await this.recordChannelFailure(
              siteGroup.name,
              `日志分析: ${healthResult.message}`
            );
          } else if (healthResult.status === "healthy") {
            // 如果健康状态良好，重置失败计数
            if (this.channelFailures.has(siteGroup.name)) {
              console.log(
                `✅ ${siteGroup.name}: 日志分析显示恢复正常，重置失败计数`
              );
              this.channelFailures.delete(siteGroup.name);
            }
          }
        } catch (error) {
          console.error(`分析渠道 ${siteGroup.name} 日志失败:`, error.message);
        }
      }
    } catch (error) {
      console.error("日志API分析失败:", error.message);
    }
  }

  /**
   * 获取详细的健康报告
   */
  async getDetailedHealthReport() {
    try {
      const allGroups = await gptloadService.getAllGroups();
      const siteGroups = this.filterSiteGroups(allGroups);

      const healthReports = [];

      for (const siteGroup of siteGroups) {
        try {
          // 检查是否为高消耗模型
          if (siteGroup.test_model && isHighCostModel(siteGroup.test_model)) {
            healthReports.push({
              groupName: siteGroup.name,
              status: "skipped",
              message: `高消耗模型 ${siteGroup.test_model}，需要手动验证`,
              testModel: siteGroup.test_model,
              isHighCostModel: true,
              currentFailures: 0,
              failureThreshold: this.failureThreshold,
              willBeRemoved: false,
            });
            continue;
          }

          const healthResult = await gptloadService.analyzeChannelHealth(
            siteGroup.name,
            siteGroup._instance.id,
            24 // 检查最近24小时的数据
          );

          const failureCount = this.channelFailures.get(siteGroup.name) || 0;

          healthReports.push({
            ...healthResult,
            currentFailures: failureCount,
            failureThreshold: this.failureThreshold,
            willBeRemoved: failureCount >= this.failureThreshold,
          });
        } catch (error) {
          healthReports.push({
            groupName: siteGroup.name,
            status: "error",
            message: `检测失败: ${error.message}`,
            error: error.message,
            currentFailures: this.channelFailures.get(siteGroup.name) || 0,
            failureThreshold: this.failureThreshold,
          });
        }
      }

      // 按状态排序
      healthReports.sort((a, b) => {
        const statusOrder = {
          critical: 0,
          warning: 1,
          error: 2,
          skipped: 3,
          no_data: 4,
          healthy: 5,
        };
        return statusOrder[a.status] - statusOrder[b.status];
      });

      return {
        timestamp: new Date().toISOString(),
        totalChannels: siteGroups.length,
        summary: {
          healthy: healthReports.filter((r) => r.status === "healthy").length,
          warning: healthReports.filter((r) => r.status === "warning").length,
          critical: healthReports.filter((r) => r.status === "critical").length,
          error: healthReports.filter((r) => r.status === "error").length,
          noData: healthReports.filter((r) => r.status === "no_data").length,
          skipped: healthReports.filter((r) => r.status === "skipped").length,
          highCostModels: healthReports.filter((r) => r.isHighCostModel).length,
        },
        channels: healthReports,
      };
    } catch (error) {
      console.error("获取健康报告失败:", error.message);
      throw error;
    }
  }

  /**
   * 记录渠道移除操作
   */
  async logChannelRemoval(
    channelName,
    affectedGroups,
    wasSoftDisabled = false
  ) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: wasSoftDisabled
        ? "channel_keys_disabled"
        : "channel_upstreams_removed",
      channel: channelName,
      affectedGroups,
      reason: "health_check_failure",
    };

    console.log(`📝 记录渠道移除: ${JSON.stringify(logEntry)}`);

    // 可以选择写入专门的操作日志文件
    try {
      const logFile = path.join(__dirname, "../logs/channel-operations.log");
      await fs.appendFile(logFile, JSON.stringify(logEntry) + "\n");
    } catch (error) {
      console.error("写入操作日志失败:", error.message);
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasInterval: !!this.monitorInterval,
      intervalMinutes: this.checkIntervalMinutes,
      failureThreshold: this.failureThreshold,
      currentFailures: Object.fromEntries(this.channelFailures),
      failureCount: this.channelFailures.size,
      nextCheck: this.monitorInterval
        ? new Date(
            Date.now() + this.checkIntervalMinutes * 60 * 1000
          ).toISOString()
        : null,
    };
  }

  /**
   * 手动重置渠道失败计数
   */
  resetChannelFailures(channelName = null) {
    if (channelName) {
      this.channelFailures.delete(channelName);
      console.log(`🔄 已重置渠道 ${channelName} 的失败计数`);
    } else {
      this.channelFailures.clear();
      console.log(`🔄 已重置所有渠道的失败计数`);
    }
  }

  /**
   * 获取失败渠道列表
   */
  getFailedChannels() {
    return Array.from(this.channelFailures.entries()).map(
      ([name, failures]) => ({
        name,
        failures,
        threshold: this.failureThreshold,
        willBeRemoved: failures >= this.failureThreshold,
      })
    );
  }
}

module.exports = new ChannelHealthMonitor();
