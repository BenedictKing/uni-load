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
      // 获取所有站点分组
      const allGroups = await gptloadService.getAllGroups();
      const siteGroups = this.filterSiteGroups(allGroups);
      
      console.log(`📊 发现 ${siteGroups.length} 个站点分组需要检查`);

      let totalSynced = 0;
      let totalErrors = 0;

      for (const siteGroup of siteGroups) {
        try {
          const syncResult = await this.syncSiteModels(siteGroup);
          if (syncResult.hasChanges) {
            totalSynced++;
            console.log(`✅ ${siteGroup.name}: 同步了 ${syncResult.changes.added.length} 个新模型，移除了 ${syncResult.changes.removed.length} 个模型`);
          } else {
            console.log(`ℹ️ ${siteGroup.name}: 无变化`);
          }
        } catch (error) {
          totalErrors++;
          console.error(`❌ ${siteGroup.name}: 同步失败 - ${error.message}`);
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      console.log(`🏁 模型同步检查完成，耗时 ${duration.toFixed(2)}s`);
      console.log(`📈 统计：${totalSynced} 个站点有更新，${totalErrors} 个站点出错`);

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
      // 2. 名称包含格式后缀（如 -openai, -anthropic）
      if (!group.upstreams || group.upstreams.length === 0) {
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
  async syncSiteModels(siteGroup) {
    // 解析站点信息
    const siteInfo = this.parseSiteGroupInfo(siteGroup);
    
    // 获取当前模型列表
    const currentModels = await modelsService.getModels(
      siteInfo.baseUrl, 
      siteInfo.apiKey
    );

    // 获取已配置的模型（从模型分组中获取）
    const configuredModels = await this.getConfiguredModels(siteInfo.siteName);

    // 比较差异
    const changes = this.compareModels(configuredModels, currentModels);

    if (changes.added.length > 0 || changes.removed.length > 0) {
      // 有变化，需要同步
      await this.applyModelChanges(siteInfo, changes);
      return { hasChanges: true, changes };
    }

    return { hasChanges: false, changes };
  }

  /**
   * 解析站点分组信息
   */
  parseSiteGroupInfo(siteGroup) {
    // 从分组名解析站点名和格式
    // 例如：deepseek-openai -> siteName: deepseek, channelType: openai
    const parts = siteGroup.name.split('-');
    const channelType = parts[parts.length - 1];
    const siteName = parts.slice(0, -1).join('-');

    // 获取baseUrl
    const baseUrl = siteGroup.upstreams[0]?.url;

    // 获取API密钥（从分组的keys中获取第一个）
    const apiKey = siteGroup.api_keys?.[0]?.key_value || 'dummy-key';

    return {
      siteName,
      channelType,
      baseUrl,
      apiKey,
      groupName: siteGroup.name
    };
  }

  /**
   * 获取已配置的模型列表
   */
  async getConfiguredModels(siteName) {
    const allGroups = await gptloadService.getAllGroups();
    
    // 查找以该站点名开头的模型分组
    const modelGroups = allGroups.filter(group => {
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
  async applyModelChanges(siteInfo, changes) {
    const { siteName, channelType } = siteInfo;
    
    // 添加新模型
    if (changes.added.length > 0) {
      console.log(`➕ 为 ${siteName} 添加新模型: ${changes.added.join(', ')}`);
      
      // 获取该站点的所有格式分组
      const allGroups = await gptloadService.getAllGroups();
      const siteGroups = allGroups.filter(group => 
        group.name.startsWith(siteName + '-')
      );

      // 为每个新模型创建模型分组
      await gptloadService.createOrUpdateModelGroups(changes.added, siteGroups);
    }

    // 移除旧模型
    if (changes.removed.length > 0) {
      console.log(`➖ 为 ${siteName} 移除旧模型: ${changes.removed.join(', ')}`);
      
      for (const model of changes.removed) {
        await this.removeModelGroup(model);
      }
    }

    // 更新uni-api配置
    if (changes.added.length > 0 || changes.removed.length > 0) {
      const allModels = await this.getAllConfiguredModels();
      const allModelGroups = await this.getAllModelGroups();
      await yamlManager.updateUniApiConfig(allModels, allModelGroups);
      console.log(`🔧 已更新 uni-api 配置`);
    }
  }

  /**
   * 移除模型分组
   */
  async removeModelGroup(modelName) {
    try {
      const groupName = modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const allGroups = await gptloadService.getAllGroups();
      const modelGroup = allGroups.find(group => group.name === groupName);
      
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
   * 获取所有已配置的模型
   */
  async getAllConfiguredModels() {
    const allGroups = await gptloadService.getAllGroups();
    const modelGroups = allGroups.filter(group => 
      group.upstreams?.some(upstream => upstream.url.includes('/proxy/'))
    );
    return modelGroups.map(group => group.test_model).filter(Boolean);
  }

  /**
   * 获取所有模型分组
   */
  async getAllModelGroups() {
    const allGroups = await gptloadService.getAllGroups();
    return allGroups.filter(group => 
      group.upstreams?.some(upstream => upstream.url.includes('/proxy/'))
    );
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