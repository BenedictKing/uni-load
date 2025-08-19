const gptloadService = require('./gptload');
const modelsService = require('./models');
const yamlManager = require('./yaml-manager');

class ModelSyncService {
  constructor() {
    this.syncInterval = null;
    this.syncIntervalMinutes = process.env.MODEL_SYNC_INTERVAL || 60; // 默认60分钟
    this.isRunning = false;
  }

  /**
   * 启动定时同步
   */
  start() {
    if (this.syncInterval) {
      console.log('⚠️ 模型同步服务已在运行');
      return;
    }

    console.log(`🕐 启动模型同步服务，检查间隔：${this.syncIntervalMinutes}分钟`);
    
    // 立即执行一次
    this.syncAllModels();
    
    // 设置定时任务
    this.syncInterval = setInterval(() => {
      this.syncAllModels();
    }, this.syncIntervalMinutes * 60 * 1000);
  }

  /**
   * 停止定时同步
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('🛑 模型同步服务已停止');
    }
  }

  /**
   * 清理并重置所有模型配置
   */
  async cleanupAndResetModels() {
    console.log('🚨 开始执行模型清理与重置任务...');
    const results = {
      deletedGroups: 0,
      failedGroups: 0,
      cleanedProviders: 0
    };

    // 步骤1: 删除所有 gptload 模型分组
    const deleteResults = await gptloadService.deleteAllModelGroups();
    results.deletedGroups = deleteResults.deleted.length;
    results.failedGroups = deleteResults.failed.length;

    // 步骤2: 清理 uni-api 配置文件
    // 注意: yamlManager.cleanupProviders 函数已存在，可以直接使用
    try {
      const cleanedCount = await yamlManager.cleanupProviders();
      results.cleanedProviders = cleanedCount;
      console.log(`✅ uni-api 配置清理完成，移除了 ${cleanedCount} 个 provider`);
    } catch (error) {
      console.error('❌ uni-api 配置清理失败:', error.message);
      throw error; // 抛出错误以便上层捕获
    }

    console.log('🏁 模型清理与重置任务完成');
    return results;
  }

  /**
   * 同步所有站点的模型
   */
  async syncAllModels() {
    if (this.isRunning) {
      console.log('⏳ 模型同步正在进行中，跳过本次执行');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    console.log(`🔄 开始模型同步检查 - ${new Date().toISOString()}`);

    try {
      // 优化：一次性获取所有分组信息作为缓存
      const allGroupsCache = await gptloadService.getAllGroups();
      
      // 使用缓存数据来筛选站点分组
      const siteGroups = this.filterSiteGroups(allGroupsCache);
      
      console.log(`📊 发现 ${siteGroups.length} 个站点分组需要检查`);

      let totalSynced = 0;
      let totalErrors = 0;
      const errorSites = []; // 用于记录出错的站点名称

      for (const siteGroup of siteGroups) {
        try {
          // 将缓存传递给子函数
          const syncResult = await this.syncSiteModels(siteGroup, allGroupsCache);
          if (syncResult.hasChanges) {
            totalSynced++;
            console.log(`✅ ${siteGroup.name}: 同步了 ${syncResult.changes.added.length} 个新模型，移除了 ${syncResult.changes.removed.length} 个模型`);
          } else {
            console.log(`ℹ️ ${siteGroup.name}: 无变化`);
          }
        } catch (error) {
          totalErrors++;
          errorSites.push(siteGroup.name); // 将出错的站点名称添加到数组中
          console.error(`❌ ${siteGroup.name}: 同步失败 - ${error.message}`);
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      console.log(`🏁 模型同步检查完成，耗时 ${duration.toFixed(2)}s`);
      
      // 更新统计日志
      let summaryLog = `📈 统计：${totalSynced} 个站点有更新，${totalErrors} 个站点出错`;
      if (totalErrors > 0) {
        summaryLog += ` (失败站点: ${errorSites.join(', ')})`;
      }
      
      // 如果定时器在运行，则显示下次同步时间
      if (this.syncInterval) {
        const nextSyncTime = new Date(Date.now() + this.syncIntervalMinutes * 60 * 1000);
        summaryLog += `，下次同步: ${nextSyncTime.toLocaleString()}`;
      }
      console.log(summaryLog);

    } catch (error) {
      console.error('💥 模型同步过程中发生严重错误:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 过滤出站点分组（区别于模型分组）
   */
  filterSiteGroups(allGroups) {
    return allGroups.filter(group => {
      // 站点分组的特征：
      // 1. 有upstreams且指向外部URL
      // 2. 排序号为20（通过程序建立的渠道）
      if (!group.upstreams || group.upstreams.length === 0) {
        return false;
      }

      // 只处理排序号为20的渠道（程序建立的渠道）
      if (group.sort !== 20) {
        return false;
      }

      // 检查是否指向外部URL（不是gptload的proxy）
      const hasExternalUpstream = group.upstreams.some(upstream => 
        !upstream.url.includes('/proxy/')
      );

      return hasExternalUpstream;
    });
  }

  /**
   * 同步单个站点的模型
   */
  async syncSiteModels(siteGroup, allGroupsCache) {
    // 解析站点信息（现在是异步的）
    const siteInfo = await this.parseSiteGroupInfo(siteGroup);
    
    // 获取当前模型列表（增加重试次数）
    const currentModels = await modelsService.getModels(
      siteInfo.baseUrl, 
      siteInfo.apiKey,
      3 // 最多重试3次
    );

    // 获取已配置的模型（从缓存的模型分组中获取）
    const configuredModels = this.getConfiguredModels(siteInfo.siteName, allGroupsCache);

    // 比较差异
    const changes = this.compareModels(configuredModels, currentModels);

    if (changes.added.length > 0 || changes.removed.length > 0) {
      // 有变化，需要同步，传递缓存
      await this.applyModelChanges(siteInfo, changes, allGroupsCache);
      return { hasChanges: true, changes };
    }

    return { hasChanges: false, changes };
  }

  /**
   * 解析站点分组信息
   */
  async parseSiteGroupInfo(siteGroup) {
    // 从分组名解析站点名和格式
    // 例如：deepseek-openai -> siteName: deepseek, channelType: openai
    const parts = siteGroup.name.split('-');
    const channelType = parts[parts.length - 1];
    const siteName = parts.slice(0, -1).join('-');

    // 获取baseUrl
    const baseUrl = siteGroup.upstreams[0]?.url;

    // 使用新的密钥获取接口获取API密钥
    let apiKey = 'dummy-key'; // 默认值
    try {
      const apiKeys = await gptloadService.getGroupApiKeys(siteGroup.id, siteGroup._instance.id);
      if (apiKeys && apiKeys.length > 0) {
        apiKey = apiKeys[0]; // 使用第一个有效密钥
        console.log(`✅ 成功获取分组 ${siteGroup.name} 的API密钥`);
      } else {
        console.warn(`⚠️ 分组 ${siteGroup.name} 没有有效的API密钥，使用默认值`);
      }
    } catch (error) {
      console.error(`❌ 获取分组 ${siteGroup.name} 的API密钥失败: ${error.message}`);
    }

    return {
      siteName,
      channelType,
      baseUrl,
      apiKey,
      groupName: siteGroup.name
    };
  }

  /**
   * 获取已配置的模型列表（只考虑程序建立的模型分组）
   */
  getConfiguredModels(siteName, allGroupsCache) {
    // 优化：直接从缓存中查找
    const modelGroups = allGroupsCache.filter(group => {
      // 只考虑排序号为10的模型分组（程序建立的模型分组）
      if (group.sort !== 10) {
        return false;
      }
      
      // 模型分组的特征：指向gptload proxy的URL
      return group.upstreams?.some(upstream => 
        upstream.url.includes(`/proxy/`) && 
        upstream.url.includes(siteName)
      );
    });

    // 提取模型名称（从test_model字段）
    return modelGroups.map(group => group.test_model).filter(Boolean);
  }

  /**
   * 比较模型差异
   */
  compareModels(configuredModels, currentModels) {
    const configuredSet = new Set(configuredModels);
    const currentSet = new Set(currentModels);

    const added = currentModels.filter(model => !configuredSet.has(model));
    const removed = configuredModels.filter(model => !currentSet.has(model));

    return { added, removed };
  }

  /**
   * 应用模型变更
   */
  async applyModelChanges(siteInfo, changes, allGroupsCache) {
    const { siteName, channelType } = siteInfo;
    
    // 添加新模型
    if (changes.added.length > 0) {
      console.log(`➕ 为 ${siteName} 添加新模型: ${changes.added.join(', ')}`);
      
      // 优化：从缓存中获取该站点的所有格式分组
      const siteGroups = allGroupsCache.filter(group => 
        group.name.startsWith(siteName + '-') && this.filterSiteGroups([group]).length > 0
      );

      // 为每个新模型创建模型分组
      await gptloadService.createOrUpdateModelGroups(changes.added, siteGroups);
    }

    // 移除旧模型
    if (changes.removed.length > 0) {
      console.log(`➖ 为 ${siteName} 移除旧模型: ${changes.removed.join(', ')}`);
      
      for (const model of changes.removed) {
        // 传递缓存
        await this.removeModelGroup(model, allGroupsCache);
      }
    }

    // 更新uni-api配置
    if (changes.added.length > 0 || changes.removed.length > 0) {
      // 传递缓存
      const allModelGroups = this.getAllModelGroups(allGroupsCache);
      await yamlManager.updateUniApiConfig(allModelGroups);
      console.log(`🔧 已更新 uni-api 配置`);
    }
  }

  /**
   * 移除模型分组
   */
  async removeModelGroup(modelName, allGroupsCache) {
    try {
      const groupName = modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      // 优化：从缓存中查找
      const modelGroup = allGroupsCache.find(group => group.name === groupName);
      
      if (modelGroup) {
        // 这里需要实现删除分组的API调用
        // await gptloadService.deleteGroup(modelGroup.id);
        console.log(`🗑️ 需要删除模型分组: ${groupName} (ID: ${modelGroup.id})`);
        console.log(`⚠️ 分组删除功能需要在 gptload 服务中实现`);
      }
    } catch (error) {
      console.error(`删除模型分组 ${modelName} 失败:`, error.message);
    }
  }

  /**
   * 获取所有已配置的模型（只考虑程序建立的模型分组）
   */
  async getAllConfiguredModels() {
    const allGroups = await gptloadService.getAllGroups();
    const modelGroups = allGroups.filter(group => {
      // 只考虑排序号为10的模型分组（程序建立的模型分组）
      if (group.sort !== 10) {
        return false;
      }
      
      return group.upstreams?.some(upstream => upstream.url.includes('/proxy/'));
    });
    return modelGroups.map(group => group.test_model).filter(Boolean);
  }

  /**
   * 获取所有模型分组（只返回程序建立的模型分组）
   */
  getAllModelGroups(allGroupsCache) {
    // 优化：直接从缓存中筛选
    return allGroupsCache.filter(group => {
      // 只返回排序号为10的模型分组（程序建立的模型分组）
      if (group.sort !== 10) {
        return false;
      }
      
      // 模型分组的特征：指向gptload proxy的URL
      return group.upstreams?.some(upstream => upstream.url.includes('/proxy/'));
    });
  }

  /**
   * 获取同步状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasInterval: !!this.syncInterval,
      intervalMinutes: this.syncIntervalMinutes,
      nextSync: this.syncInterval ? 
        new Date(Date.now() + this.syncIntervalMinutes * 60 * 1000).toISOString() : 
        null
    };
  }
}

module.exports = new ModelSyncService();
