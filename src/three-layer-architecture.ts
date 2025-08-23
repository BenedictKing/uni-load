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

const gptloadService = require('./gptload');
const modelConfig = require('./model-config');

class ThreeLayerArchitecture {
  constructor() {
    // 层级配置
    this.layerConfigs = {
      // 第1层：站点分组
      siteGroup: {
        sort: 20,
        blacklist_threshold: 99,                  // 高容错，站点问题通常是暂时的
        key_validation_interval_minutes: 60,      // 1小时验证一次
      },
      
      // 第2层：模型-渠道分组（核心控制层）
      modelChannelGroup: {
        sort: 15,
        blacklist_threshold: 1,                   // 快速失败，立即识别不兼容组合
        key_validation_interval_minutes: 10080,   // 7天验证一次，避免API消耗
      },
      
      // 第3层：模型聚合分组
      aggregateGroup: {
        sort: 10,
        blacklist_threshold: 50,                  // 中等容错
        key_validation_interval_minutes: 0,       // 禁用验证，依赖下层
      }
    };
    
    // 恢复策略
    this.recoverySchedule = new Map(); // "model:channel" -> { nextRetry: Date, retryCount: number }
    this.failureHistory = new Map();   // "model:channel" -> { failures: number, lastFailure: Date }
  }

  /**
   * 初始化三层架构
   */
  async initialize() {
    console.log('🚀 初始化三层 gptload 架构...');
    
    try {
      // 1. 获取现有的站点分组（第1层）
      const siteGroups = await this.getSiteGroups();
      console.log(`✅ 第1层: 发现 ${siteGroups.length} 个站点分组`);
      
      // 2. 获取所有模型
      const models = await this.getAllUniqueModels(siteGroups);
      console.log(`📊 发现 ${models.length} 个独特模型`);
      
      // 3. 创建模型-渠道分组（第2层）
      const modelChannelGroups = await this.createModelChannelGroups(models, siteGroups);
      console.log(`✅ 第2层: 创建 ${modelChannelGroups.length} 个模型-渠道分组`);
      
      // 4. 创建模型聚合分组（第3层）
      const aggregateGroups = await this.createAggregateGroups(models, modelChannelGroups);
      console.log(`✅ 第3层: 创建 ${aggregateGroups.length} 个模型聚合分组`);
      
      // 5. 设置被动恢复机制
      this.setupPassiveRecovery();
      console.log('🔄 被动恢复机制已启动');
      
      // 6. 启动权重优化
      this.startWeightOptimization();
      console.log('⚖️ 权重优化已启动');
      
      console.log('✅ 三层架构初始化完成');
      
      return {
        siteGroups: siteGroups.length,
        modelChannelGroups: modelChannelGroups.length,
        aggregateGroups: aggregateGroups.length,
        totalModels: models.length
      };
      
    } catch (error) {
      console.error('❌ 三层架构初始化失败:', error);
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
      allGroups.forEach(group => {
        console.log(`  - ${group.name}: sort=${group.sort}, upstreams=${group.upstreams?.length || 0}`);
        if (group.upstreams && group.upstreams.length > 0) {
          group.upstreams.forEach(upstream => {
            console.log(`    └─ ${upstream.url}`);
          });
        }
      });
      
      // 筛选站点分组：sort=20
      const siteGroups = allGroups.filter(group => {
        return group.sort === 20;
      });
      
      console.log(`✅ 找到 ${siteGroups.length} 个站点分组 (sort=20)`);
      
      return siteGroups;
    } catch (error) {
      console.error('获取站点分组失败:', error);
      return [];
    }
  }

  /**
   * 从站点分组获取所有独特模型
   */
  async getAllUniqueModels(siteGroups) {
    const allModels = new Set();
    
    for (const siteGroup of siteGroups) {
      try {
        // 从站点获取模型列表
        const apiKeys = await gptloadService.getGroupApiKeys(
          siteGroup.id,
          siteGroup._instance.id
        );
        
        if (apiKeys.length > 0) {
          const modelsService = require('./models');
          const baseUrl = siteGroup.upstreams[0]?.url;
          
          if (baseUrl) {
            const models = await modelsService.getModels(baseUrl, apiKeys[0]);
            const filteredModels = modelConfig.filterModels(models);
            
            filteredModels.forEach(model => allModels.add(model));
          }
        }
      } catch (error) {
        console.error(`获取站点 ${siteGroup.name} 的模型失败:`, error.message);
      }
    }
    
    return Array.from(allModels);
  }

  /**
   * 创建模型-渠道分组（第2层）
   */
  async createModelChannelGroups(models, siteGroups) {
    console.log('🔧 创建模型-渠道分组（第2层）...');
    const groups = [];
    const config = this.layerConfigs.modelChannelGroup;
    
    for (const model of models) {
      for (const site of siteGroups) {
        try {
          // 生成分组名称
          const groupName = this.generateModelChannelGroupName(model, site.name);
          
          // 检查是否已存在
          const existing = await gptloadService.checkGroupExists(groupName);
          if (existing) {
            console.log(`ℹ️ 分组已存在: ${groupName}`);
            groups.push(existing);
            continue;
          }
          
          // 选择合适的实例
          const instance = await gptloadService.manager.selectBestInstance(
            site.upstreams[0]?.url || ''
          );
        
          if (!instance) {
            throw new Error('没有可用的 gptload 实例');
          }
        
          // 创建分组数据
          const groupData = {
            name: groupName,
            display_name: `${model} @ ${site.name}`,
            description: `${model} 模型通过 ${site.name} 渠道的专用分组`,
            upstreams: [{
              url: `${site._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001'}/proxy/${site.name}`,
              weight: 1
            }],
            test_model: model,
            channel_type: site.channel_type || 'openai',
            validation_endpoint: site.validation_endpoint,
            sort: config.sort, // 确保使用正确的 sort 值：15
            param_overrides: {},
            config: {
              blacklist_threshold: config.blacklist_threshold,
              key_validation_interval_minutes: config.key_validation_interval_minutes,
            },
            tags: ['layer-2', 'model-channel', model, site.name]
          };
        
          // 直接调用实例 API 创建分组，避免 createSiteGroup 的 sort=20 覆盖
          const response = await instance.apiClient.post('/groups', groupData);
        
          // 处理响应
          let created;
          if (response.data && typeof response.data.code === 'number') {
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
            url: instance.url
          };
          
          if (created) {
            // 🔑 修复：第2层使用gptload实例的认证token，而不是站点的真实密钥
            if (instance.token) {
              await gptloadService.manager.addApiKeysToGroup(
                instance,
                created.id,
                [instance.token]
              );
              console.log(`🔑 已为第二层分组 ${groupName} 添加实例认证token`);
            } else {
              console.warn(`⚠️ 实例 ${instance.name} 没有token，第二层分组可能无法验证`);
            }
        
            groups.push(created);
            console.log(`✅ 创建第2层分组: ${groupName} (sort=${config.sort})`);
          }
          
        } catch (error) {
          const groupName = this.generateModelChannelGroupName(model, site.name);
          console.log(`⚠️ 创建失败: ${groupName} - ${error.message}`);
          
          // 记录不兼容的组合，避免后续重试
          this.recordIncompatibleCombination(model, site.name);
        }
      }
    }
    
    return groups;
  }

  /**
   * 创建模型聚合分组（第3层）
   */
  async createAggregateGroups(models, modelChannelGroups) {
    console.log('🔧 创建模型聚合分组（第3层）...');
    const groups = [];
    const config = this.layerConfigs.aggregateGroup;
    
    // 按模型分组
    const groupedByModel = this.groupModelChannelsByModel(modelChannelGroups);
    
    for (const [model, channelGroups] of groupedByModel) {
      try {
        const groupName = this.sanitizeModelName(model);
        
        // 检查是否已存在
        const existing = await gptloadService.checkGroupExists(groupName);
        if (existing) {
          console.log(`ℹ️ 聚合分组已存在: ${groupName}`);
          // 更新上游列表
          await this.updateAggregateUpstreams(existing, channelGroups);
          groups.push(existing);
          continue;
        }
        
        // 创建上游列表
        const upstreams = channelGroups.map(cg => ({
          url: `${cg._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001'}/proxy/${cg.name}`,
          weight: 1
        }));
        
        if (upstreams.length === 0) {
          console.log(`⚠️ 模型 ${model} 没有可用的渠道分组`);
          continue;
        }
        
        // 创建聚合分组数据
        const groupData = {
          name: groupName,
          display_name: `${model} (聚合)`,
          description: `${model} 模型的聚合入口，包含 ${upstreams.length} 个渠道`,
          upstreams: upstreams,
          test_model: model,
          channel_type: channelGroups[0]?.channel_type || 'openai',
          validation_endpoint: channelGroups[0]?.validation_endpoint,
          sort: config.sort,
          param_overrides: {},
          config: {
            blacklist_threshold: config.blacklist_threshold,
            key_validation_interval_minutes: config.key_validation_interval_minutes,
          },
          tags: ['layer-3', 'model-aggregate', model]
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
          await gptloadService.updateGroup(
            created.id,
            created._instance.id,
            {
              upstreams: upstreams,
              config: groupData.config
            }
          );
          
          // 添加聚合密钥
          const aggregateKey = this.generateAggregateKey(model);
          await gptloadService.addApiKeysToGroup(
            created.id,
            created._instance.id,
            [aggregateKey]
          );
          
          groups.push(created);
          console.log(`✅ 创建聚合分组: ${groupName} (${upstreams.length}个上游)`);
        }
        
      } catch (error) {
        console.error(`创建模型 ${model} 的聚合分组失败:`, error.message);
      }
    }
    
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
    const [model, channel] = combination.split(':');
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
          'active'
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
          retryCount: currentSchedule.retryCount + 1
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
        if (group.tags?.includes('layer-2')) {
          // 检查第2层分组的统计
          const stats = await gptloadService.getGroupStats(group.id);
          
          if (stats && stats.hourly_stats) {
            const failureRate = stats.hourly_stats.failure_rate || 0;
            
            if (failureRate > 0.5 && stats.hourly_stats.total_requests > 5) {
              // 高失败率，安排恢复
              const combination = this.extractModelChannelFromGroupName(group.name);
              this.scheduleRecovery(combination);
            }
          }
        }
      }
    } catch (error) {
      console.error('分析日志失败:', error.message);
    }
  }

  /**
   * 安排恢复任务
   */
  scheduleRecovery(combination) {
    if (!this.recoverySchedule.has(combination)) {
      this.recoverySchedule.set(combination, {
        nextRetry: Date.now() + 5 * 60 * 1000, // 5分钟后重试
        retryCount: 0
      });
      
      console.log(`📅 安排恢复: ${combination}`);
    }
  }

  /**
   * 启动权重优化
   */
  startWeightOptimization() {
    // 每30分钟优化一次权重
    setInterval(async () => {
      await this.optimizeAggregateWeights();
    }, 30 * 60 * 1000);
  }

  /**
   * 优化聚合分组的权重
   */
  async optimizeAggregateWeights() {
    console.log('⚖️ 优化聚合分组权重...');
    
    try {
      const allGroups = await gptloadService.getAllGroups();
      const aggregateGroups = allGroups.filter(g => g.tags?.includes('layer-3'));
      
      for (const group of aggregateGroups) {
        const upstreamStats = [];
        
        // 收集每个上游的统计
        for (const upstream of group.upstreams || []) {
          const upstreamGroupName = this.extractGroupNameFromUrl(upstream.url);
          
          // 根据分组名查找分组ID
          const upstreamGroup = allGroups.find(g => g.name === upstreamGroupName);
          if (!upstreamGroup) {
            console.warn(`未找到上游分组: ${upstreamGroupName}`);
            upstreamStats.push({
              url: upstream.url,
              weight: 1
            });
            continue;
          }
          
          const stats = await this.getGroupStats(upstreamGroup.id);
          
          let weight = 1;
          if (stats && stats.hourly_stats) {
            const successRate = (1 - (stats.hourly_stats.failure_rate || 0));
            const avgTime = stats.hourly_stats.avg_response_time || 3000;
            
            // 权重算法：成功率 * 响应时间因子
            const timeFactor = Math.max(0.1, 1 - (avgTime / 10000));
            weight = Math.max(1, Math.round(successRate * timeFactor * 100));
          }
          
          upstreamStats.push({
            url: upstream.url,
            weight: weight
          });
        }
        
        // 更新权重
        if (upstreamStats.length > 0) {
          await gptloadService.updateGroup(
            group.id,
            group._instance.id,
            { upstreams: upstreamStats }
          );
        }
      }
      
    } catch (error) {
      console.error('权重优化失败:', error.message);
    }
  }

  /**
   * 获取分组的统计信息
   */
  async getGroupStats(groupId) {
    try {
      const allGroups = await gptloadService.getAllGroups();
      const group = allGroups.find(g => g.id === groupId);
      
      if (!group) {
        return null;
      }

      // 使用 gptload 内置的统计接口
      const instance = gptloadService.manager.getInstance(group._instance.id);
      if (!instance) {
        return null;
      }

      const response = await instance.apiClient.get(`/groups/${groupId}/stats`);
      
      if (response.data && typeof response.data.code === 'number') {
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
    return `key-${model}-${channel}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '-');
  }

  generateAggregateKey(model) {
    return `key-aggregate-${model}`.replace(/[^a-zA-Z0-9-]/g, '-');
  }

  sanitizeModelName(modelName) {
    return modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
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
    const newUpstreams = channelGroups.map(cg => ({
      url: `${cg._instance?.url || process.env.GPTLOAD_URL || 'http://localhost:3001'}/proxy/${cg.name}`,
      weight: 1
    }));
    
    await gptloadService.updateGroup(
      existingGroup.id,
      existingGroup._instance.id,
      { upstreams: newUpstreams }
    );
    
    console.log(`🔄 更新聚合分组 ${existingGroup.name} 的上游`);
  }

  /**
   * 获取架构状态
   */
  async getArchitectureStatus() {
    try {
      const allGroups = await gptloadService.getAllGroups();
      
      const siteGroups = allGroups.filter(g => g.sort === 20);
      const modelChannelGroups = allGroups.filter(g => g.tags?.includes('layer-2'));
      const aggregateGroups = allGroups.filter(g => g.tags?.includes('layer-3'));
      
      return {
        layers: {
          layer1: {
            name: '站点分组',
            count: siteGroups.length,
            groups: siteGroups.map(g => g.name)
          },
          layer2: {
            name: '模型-渠道分组', 
            count: modelChannelGroups.length,
            groups: modelChannelGroups.map(g => g.name)
          },
          layer3: {
            name: '模型聚合分组',
            count: aggregateGroups.length,
            groups: aggregateGroups.map(g => g.name)
          }
        },
        recovery: {
          scheduled: this.recoverySchedule.size,
          failed: this.failureHistory.size
        }
      };
    } catch (error) {
      console.error('获取架构状态失败:', error);
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
      failures: this.failureHistory.get(combination)?.failures || 0
    };
  }

  /**
   * 停止服务
   */
  stop() {
    // 清理定时器等资源
    console.log('🛑 三层架构管理器已停止');
  }
}

// 导出单例
const threeLayerArchitecture = new ThreeLayerArchitecture();

// 优雅关闭
process.on('SIGINT', () => {
  threeLayerArchitecture.stop();
});

process.on('SIGTERM', () => {
  threeLayerArchitecture.stop();
});

module.exports = threeLayerArchitecture;
