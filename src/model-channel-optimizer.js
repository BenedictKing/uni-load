/**
 * 模型渠道优化器
 * 
 * 充分利用 gptload 和 uni-api 的原生能力，实现模型级别的智能路由和管理
 * 
 * 核心理念：
 * 1. 利用 gptload 的分组管理实现自动负载均衡
 * 2. 利用 gptload 的黑名单机制实现自动故障隔离
 * 3. 利用 gptload 的统计 API 进行智能决策
 * 4. 利用 uni-api 的多渠道配置实现冗余
 */

const gptloadService = require('./gptload');
const modelConfig = require('./model-config');

class ModelChannelOptimizer {
  constructor() {
    // 模型到分组的映射
    this.modelGroupMapping = new Map();
    
    // 分组性能指标缓存
    this.groupMetricsCache = new Map();
    
    // 优化间隔
    this.optimizationInterval = 5 * 60 * 1000; // 5分钟
  }

  /**
   * 初始化优化器
   */
  async initialize() {
    console.log('🚀 初始化模型渠道优化器...');
    
    // 加载现有的分组映射
    await this.loadGroupMappings();
    
    // 启动定期优化
    this.startOptimization();
    
    console.log('✅ 模型渠道优化器初始化完成');
  }

  /**
   * 加载分组映射关系
   */
  async loadGroupMappings() {
    try {
      const allGroups = await gptloadService.getAllGroups();
      
      // 分析每个分组支持的模型
      for (const group of allGroups) {
        // 跳过站点分组（sort=20）
        if (group.sort === 20) continue;
        
        // 从分组名称推断支持的模型
        const models = this.extractModelsFromGroup(group);
        
        for (const model of models) {
          if (!this.modelGroupMapping.has(model)) {
            this.modelGroupMapping.set(model, []);
          }
          
          this.modelGroupMapping.get(model).push({
            groupId: group.id,
            groupName: group.name,
            instanceId: group._instance?.id,
            upstreams: group.upstreams,
            priority: group.sort || 10,
            status: group.status || 'enabled'
          });
        }
      }
      
      console.log(`📊 加载了 ${this.modelGroupMapping.size} 个模型的分组映射`);
    } catch (error) {
      console.error('加载分组映射失败:', error.message);
    }
  }

  /**
   * 从分组信息中提取支持的模型
   */
  extractModelsFromGroup(group) {
    const models = [];
    
    // 方法1：从分组名称提取（如 "gpt-4-turbo-group"）
    const nameMatch = group.name.match(/^(gpt-[\w-]+|claude-[\w-]+|gemini-[\w-]+|deepseek-[\w-]+)/i);
    if (nameMatch) {
      models.push(nameMatch[1].toLowerCase());
    }
    
    // 方法2：从分组的模型列表提取
    if (group.models && Array.isArray(group.models)) {
      models.push(...group.models);
    }
    
    // 方法3：从测试模型推断
    if (group.test_model) {
      models.push(group.test_model);
    }
    
    return [...new Set(models)]; // 去重
  }

  /**
   * 为模型创建优化的分组配置
   * 
   * 策略：
   * 1. 为每个模型创建多个分组，每个分组对应不同的渠道
   * 2. 设置合理的黑名单阈值（模型分组设为1-3，快速响应）
   * 3. 利用 gptload 的优先级机制实现智能切换
   */
  async createOptimizedModelGroups(model, channels) {
    console.log(`🔧 为模型 ${model} 创建优化的分组配置...`);
    
    const groups = [];
    
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      const groupData = {
        name: `${model}-${channel.name}`.toLowerCase(),
        upstreams: [{
          url: channel.url,
          weight: 100 - (i * 10), // 递减权重
        }],
        models: [model],
        test_model: model,
        sort: 10 + i, // 递增优先级
        param_overrides: {},
        config: {
          // 模型分组使用更低的黑名单阈值，快速响应问题
          blacklist_threshold: modelConfig.getModelGroupConfig().blacklist_threshold || 1,
          // 启用自动验证
          auto_validate: true,
          // 验证间隔（秒）
          validation_interval: 300,
          // 失败后的冷却时间（秒）
          failure_cooldown: 60,
        }
      };
      
      try {
        const instance = gptloadService.manager.getPreferredInstance();
        const response = await instance.apiClient.post('/groups', groupData);
        
        groups.push(response.data);
        console.log(`✅ 创建分组 ${groupData.name} 成功`);
      } catch (error) {
        console.error(`创建分组 ${groupData.name} 失败:`, error.message);
      }
    }
    
    return groups;
  }

  /**
   * 获取模型的最佳分组
   * 
   * 利用 gptload 的统计 API 选择最佳分组
   */
  async getBestGroupForModel(model) {
    const groups = this.modelGroupMapping.get(model);
    if (!groups || groups.length === 0) {
      console.log(`⚠️ 模型 ${model} 没有可用分组`);
      return null;
    }
    
    // 获取每个分组的实时统计
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        try {
          const stats = await this.getGroupStats(group.groupId, group.instanceId);
          return {
            ...group,
            stats,
            score: this.calculateGroupScore(stats)
          };
        } catch (error) {
          console.error(`获取分组 ${group.groupName} 统计失败:`, error.message);
          return {
            ...group,
            stats: null,
            score: -1
          };
        }
      })
    );
    
    // 按分数排序，选择最佳分组
    groupsWithStats.sort((a, b) => b.score - a.score);
    
    const bestGroup = groupsWithStats[0];
    
    if (bestGroup.score > 0) {
      console.log(`🎯 为模型 ${model} 选择最佳分组: ${bestGroup.groupName} (分数: ${bestGroup.score})`);
      return bestGroup;
    }
    
    console.log(`⚠️ 模型 ${model} 没有健康的分组`);
    return null;
  }

  /**
   * 获取分组统计信息
   * 
   * 使用 gptload 的原生统计 API
   */
  async getGroupStats(groupId, instanceId) {
    // 检查缓存
    const cacheKey = `${instanceId}:${groupId}`;
    const cached = this.groupMetricsCache.get(cacheKey);
    
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    
    // 调用 gptload 统计 API
    const instance = gptloadService.manager.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例 ${instanceId} 不存在`);
    }
    
    const response = await instance.apiClient.get(`/groups/${groupId}/stats`);
    
    let stats;
    if (response.data && typeof response.data.code === 'number') {
      stats = response.data.data;
    } else {
      stats = response.data;
    }
    
    // 缓存结果（1分钟）
    this.groupMetricsCache.set(cacheKey, {
      data: stats,
      expiry: Date.now() + 60000
    });
    
    return stats;
  }

  /**
   * 计算分组得分
   * 
   * 基于 gptload 提供的统计信息计算
   */
  calculateGroupScore(stats) {
    if (!stats) return -1;
    
    let score = 100;
    
    // 基于密钥状态评分
    if (stats.key_stats) {
      const activeRatio = stats.key_stats.active_keys / (stats.key_stats.total_keys || 1);
      score *= activeRatio;
      
      // 如果没有活跃密钥，直接返回0
      if (stats.key_stats.active_keys === 0) {
        return 0;
      }
    }
    
    // 基于小时统计评分
    if (stats.hourly_stats) {
      const successRate = 1 - (stats.hourly_stats.failure_rate || 0);
      score *= successRate;
    }
    
    // 基于日统计评分（权重较低）
    if (stats.daily_stats) {
      const dailySuccessRate = 1 - (stats.daily_stats.failure_rate || 0);
      score *= (0.7 + 0.3 * dailySuccessRate); // 30%权重
    }
    
    return Math.round(score);
  }

  /**
   * 启动定期优化
   */
  startOptimization() {
    // 立即执行一次
    this.optimizeAllModels();
    
    // 定期执行
    setInterval(() => {
      this.optimizeAllModels();
    }, this.optimizationInterval);
  }

  /**
   * 优化所有模型的分组配置
   * 
   * 利用 gptload 的能力进行优化：
   * 1. 调整分组优先级
   * 2. 更新黑名单阈值
   * 3. 触发验证任务
   */
  async optimizeAllModels() {
    console.log('🔄 开始优化所有模型的分组配置...');
    
    for (const [model, groups] of this.modelGroupMapping) {
      await this.optimizeModelGroups(model, groups);
    }
    
    console.log('✅ 模型分组优化完成');
  }

  /**
   * 优化单个模型的分组
   */
  async optimizeModelGroups(model, groups) {
    // 获取所有分组的统计
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        try {
          const stats = await this.getGroupStats(group.groupId, group.instanceId);
          return { ...group, stats };
        } catch (error) {
          return { ...group, stats: null };
        }
      })
    );
    
    // 根据统计信息调整优先级
    for (const group of groupsWithStats) {
      if (!group.stats) continue;
      
      const updates = {};
      
      // 如果失败率过高，增加优先级数字（降低优先级）
      if (group.stats.hourly_stats && group.stats.hourly_stats.failure_rate > 0.1) {
        updates.sort = Math.min(group.priority + 5, 99);
        console.log(`📉 降低分组 ${group.groupName} 优先级: ${group.priority} -> ${updates.sort}`);
      }
      
      // 如果表现优秀，减少优先级数字（提高优先级）
      if (group.stats.hourly_stats && group.stats.hourly_stats.failure_rate < 0.01) {
        updates.sort = Math.max(group.priority - 1, 1);
        console.log(`📈 提高分组 ${group.groupName} 优先级: ${group.priority} -> ${updates.sort}`);
      }
      
      // 如果有更新，应用到 gptload
      if (Object.keys(updates).length > 0) {
        try {
          await gptloadService.updateGroup(group.groupId, group.instanceId, updates);
          group.priority = updates.sort || group.priority;
        } catch (error) {
          console.error(`更新分组 ${group.groupName} 失败:`, error.message);
        }
      }
    }
  }

  /**
   * 触发模型的验证任务
   * 
   * 利用 gptload 的验证接口
   */
  async triggerModelValidation(model) {
    const groups = this.modelGroupMapping.get(model);
    if (!groups || groups.length === 0) return;
    
    console.log(`🔍 触发模型 ${model} 的验证任务...`);
    
    for (const group of groups) {
      try {
        const instance = gptloadService.manager.getInstance(group.instanceId);
        if (!instance) continue;
        
        // 调用 gptload 的验证接口
        await instance.apiClient.post('/keys/validate-group', {
          group_id: group.groupId
        });
        
        console.log(`✅ 触发分组 ${group.groupName} 验证成功`);
      } catch (error) {
        // 409 表示验证任务已在运行，这是正常的
        if (error.response?.status !== 409) {
          console.error(`触发分组 ${group.groupName} 验证失败:`, error.message);
        }
      }
    }
  }

  /**
   * 获取模型的健康报告
   */
  async getModelHealthReport(model) {
    const groups = this.modelGroupMapping.get(model);
    if (!groups || groups.length === 0) {
      return {
        model,
        status: 'no_groups',
        message: '没有配置分组'
      };
    }
    
    const report = {
      model,
      groups: [],
      healthyGroups: 0,
      degradedGroups: 0,
      failedGroups: 0,
      recommendation: ''
    };
    
    for (const group of groups) {
      try {
        const stats = await this.getGroupStats(group.groupId, group.instanceId);
        const score = this.calculateGroupScore(stats);
        
        let status = 'healthy';
        if (score < 30) status = 'failed';
        else if (score < 70) status = 'degraded';
        
        report.groups.push({
          name: group.groupName,
          status,
          score,
          stats
        });
        
        if (status === 'healthy') report.healthyGroups++;
        else if (status === 'degraded') report.degradedGroups++;
        else report.failedGroups++;
        
      } catch (error) {
        report.groups.push({
          name: group.groupName,
          status: 'error',
          error: error.message
        });
        report.failedGroups++;
      }
    }
    
    // 生成建议
    if (report.healthyGroups === 0) {
      report.recommendation = '⚠️ 没有健康的分组，建议立即检查所有渠道';
      report.status = 'critical';
    } else if (report.healthyGroups < groups.length / 2) {
      report.recommendation = '📉 超过一半的分组不健康，建议增加备用渠道';
      report.status = 'warning';
    } else {
      report.recommendation = '✅ 模型运行状况良好';
      report.status = 'healthy';
    }
    
    return report;
  }

  /**
   * 监听 gptload 的事件
   * 
   * 利用 gptload 的黑名单事件进行响应
   */
  setupEventListeners() {
    // 当分组被加入黑名单时
    gptloadService.on('group_blacklisted', async (event) => {
      console.log(`⚫ 分组 ${event.groupName} 被加入黑名单`);
      
      // 找出受影响的模型
      for (const [model, groups] of this.modelGroupMapping) {
        const affected = groups.find(g => g.groupId === event.groupId);
        if (affected) {
          console.log(`📢 模型 ${model} 的分组 ${affected.groupName} 已被禁用`);
          
          // 触发其他分组的验证
          await this.triggerModelValidation(model);
          
          // 检查是否需要创建新的备用分组
          const healthyGroups = groups.filter(g => g.status === 'enabled');
          if (healthyGroups.length < 2) {
            console.log(`⚠️ 模型 ${model} 健康分组不足，考虑添加备用渠道`);
          }
        }
      }
    });
    
    // 当分组恢复时
    gptloadService.on('group_recovered', async (event) => {
      console.log(`✅ 分组 ${event.groupName} 已恢复`);
      
      // 重新加载分组映射
      await this.loadGroupMappings();
    });
  }

  /**
   * 生成优化报告
   */
  async generateOptimizationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      models: [],
      summary: {
        totalModels: this.modelGroupMapping.size,
        healthyModels: 0,
        degradedModels: 0,
        criticalModels: 0
      },
      recommendations: []
    };
    
    for (const [model] of this.modelGroupMapping) {
      const modelReport = await this.getModelHealthReport(model);
      report.models.push(modelReport);
      
      if (modelReport.status === 'healthy') report.summary.healthyModels++;
      else if (modelReport.status === 'warning') report.summary.degradedModels++;
      else report.summary.criticalModels++;
    }
    
    // 生成整体建议
    if (report.summary.criticalModels > 0) {
      report.recommendations.push(
        `🚨 有 ${report.summary.criticalModels} 个模型处于危急状态，需要立即处理`
      );
    }
    
    if (report.summary.degradedModels > report.summary.healthyModels) {
      report.recommendations.push(
        `⚠️ 降级模型数量超过健康模型，建议检查整体系统状态`
      );
    }
    
    return report;
  }
}

module.exports = new ModelChannelOptimizer();