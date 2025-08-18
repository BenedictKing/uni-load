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

const gptloadService = require('./gptload');
const fs = require('fs').promises;
const path = require('path');

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
      console.log('⚠️ 渠道健康监控已在运行');
      return;
    }

    console.log(`🩺 启动渠道健康监控，检查间隔：${this.checkIntervalMinutes}分钟`);
    
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
      console.log('🛑 渠道健康监控已停止');
    }
  }

  /**
   * 检查渠道健康状态
   */
  async checkChannelHealth() {
    if (this.isRunning) {
      console.log('⏳ 渠道健康检查正在进行中，跳过本次执行');
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
      console.error('💥 渠道健康检查过程中发生错误:', error);
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

      for (const siteGroup of siteGroups) {
        await this.testSiteGroupHealth(siteGroup);
      }

    } catch (error) {
      console.error('API健康检查失败:', error.message);
    }
  }

  /**
   * 过滤出站点分组（只处理程序建立的渠道）
   */
  filterSiteGroups(allGroups) {
    return allGroups.filter(group => {
      if (!group.upstreams || group.upstreams.length === 0) {
        return false;
      }
      
      // 只处理排序号为20的渠道（程序建立的渠道）
      if (group.sort !== 20) {
        return false;
      }
      
      // 站点分组的特征：指向外部URL
      const hasExternalUpstream = group.upstreams.some(upstream => 
        !upstream.url.includes('/proxy/')
      );
      return hasExternalUpstream;
    });
  }

  /**
   * 测试站点分组健康状态
   */
  async testSiteGroupHealth(siteGroup) {
    const groupName = siteGroup.name;
    
    try {
      // 使用gptload的健康检查接口
      const healthCheck = await this.performHealthCheck(siteGroup);
      
      if (healthCheck.success) {
        // 健康状态良好，重置失败计数
        if (this.channelFailures.has(groupName)) {
          console.log(`✅ ${groupName}: 恢复正常，重置失败计数`);
          this.channelFailures.delete(groupName);
        }
      } else {
        // 健康检查失败
        await this.recordChannelFailure(groupName, healthCheck.error);
      }

    } catch (error) {
      await this.recordChannelFailure(groupName, error.message);
    }
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck(siteGroup) {
    try {
      // 使用 gptload 的日志接口进行健康检查
      const healthResult = await gptloadService.analyzeChannelHealth(
        siteGroup.name, 
        siteGroup._instance.id, 
        1 // 检查最近1小时的数据
      );

      console.log(`🔍 检查 ${siteGroup.name}: 成功率 ${healthResult.successRate}%, 响应时间 ${healthResult.avgResponseTime}ms`);
      
      // 判断是否健康
      if (healthResult.status === 'healthy') {
        return { success: true, healthResult };
      } else if (healthResult.status === 'no_data') {
        // 没有数据时，尝试直接测试接口
        return await this.directHealthCheck(siteGroup);
      } else {
        return { 
          success: false, 
          error: `${healthResult.message} (${healthResult.status})`,
          healthResult 
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
        throw new Error('没有找到上游URL');
      }

      // 获取API密钥进行测试
      const apiKeys = await gptloadService.getGroupApiKeys(siteGroup.id, siteGroup._instance.id);
      if (apiKeys.length === 0) {
        throw new Error('没有找到有效的API密钥');
      }

      const apiKey = apiKeys[0];
      console.log(`🔗 直接测试 ${siteGroup.name}: ${baseUrl}`);
      
      // 使用 modelsService 测试连接
      const modelsService = require('./models');
      const models = await modelsService.getModels(baseUrl, apiKey);
      
      if (models && models.length > 0) {
        console.log(`✅ ${siteGroup.name}: 直接测试成功，发现 ${models.length} 个模型`);
        return { success: true, models: models.length };
      } else {
        throw new Error('未能获取到模型列表');
      }
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 记录渠道失败
   */
  async recordChannelFailure(groupName, errorMessage) {
    const currentFailures = this.channelFailures.get(groupName) || 0;
    const newFailures = currentFailures + 1;
    
    this.channelFailures.set(groupName, newFailures);
    
    console.log(`❌ ${groupName}: 失败 (${newFailures}/${this.failureThreshold}) - ${errorMessage}`);
    
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
      console.log(`🗑️ 开始移除失败的渠道: ${groupName}`);
      
      // 1. 从所有模型分组中移除该站点分组的上游
      const allGroups = await gptloadService.getAllGroups();
      const modelGroups = allGroups.filter(group => 
        group.upstreams?.some(upstream => upstream.url.includes(`/proxy/${groupName}`))
      );

      let removedCount = 0;
      for (const modelGroup of modelGroups) {
        const success = await this.removeUpstreamFromModelGroup(modelGroup, groupName);
        if (success) {
          removedCount++;
        }
      }

      // 2. 可选：禁用或删除站点分组本身
      // await this.disableSiteGroup(groupName);

      console.log(`✅ 已从 ${removedCount} 个模型分组中移除渠道 ${groupName}`);
      
      // 3. 重置失败计数
      this.channelFailures.delete(groupName);

      // 4. 记录移除操作
      await this.logChannelRemoval(groupName, removedCount);

    } catch (error) {
      console.error(`移除渠道 ${groupName} 失败:`, error.message);
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
      const updatedUpstreams = modelGroup.upstreams.filter(upstream => 
        !upstream.url.includes(upstreamUrlPart)
      );

      if (updatedUpstreams.length < modelGroup.upstreams.length) {
        // 有上游被移除，更新分组
        if (updatedUpstreams.length === 0) {
          console.log(`⚠️ 模型分组 ${modelGroup.name} 将没有可用上游，跳过移除上游操作`);
          return false; // 返回 false 表示跳过
        }

        const updateData = { upstreams: updatedUpstreams };
        
        // 调用 gptload 服务来更新分组
        await gptloadService.updateGroup(modelGroup.id, modelGroup._instance.id, updateData);
        
        console.log(`➖ 从模型分组 ${modelGroup.name} 中移除了上游 ${siteGroupName}`);
        
        return true; // 返回 true 表示成功
      }

      return false; // 没有找到匹配的上游，也算作没有移除成功
    } catch (error) {
      console.error(`从模型分组 ${modelGroup.name} 移除上游失败:`, error.message);
      return false;
    }
  }

  /**
   * 通过 gptload 日志 API 分析渠道健康状况
   */
  async checkChannelsByLogs() {
    try {
      console.log('📊 开始通过日志 API 分析渠道健康状况');
      
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

          if (healthResult.status === 'critical' || healthResult.status === 'warning') {
            await this.recordChannelFailure(
              siteGroup.name, 
              `日志分析: ${healthResult.message}`
            );
          } else if (healthResult.status === 'healthy') {
            // 如果健康状态良好，重置失败计数
            if (this.channelFailures.has(siteGroup.name)) {
              console.log(`✅ ${siteGroup.name}: 日志分析显示恢复正常，重置失败计数`);
              this.channelFailures.delete(siteGroup.name);
            }
          }
          
        } catch (error) {
          console.error(`分析渠道 ${siteGroup.name} 日志失败:`, error.message);
        }
      }

    } catch (error) {
      console.error('日志API分析失败:', error.message);
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
            willBeRemoved: failureCount >= this.failureThreshold
          });
          
        } catch (error) {
          healthReports.push({
            groupName: siteGroup.name,
            status: 'error',
            message: `检测失败: ${error.message}`,
            error: error.message,
            currentFailures: this.channelFailures.get(siteGroup.name) || 0,
            failureThreshold: this.failureThreshold
          });
        }
      }
      
      // 按状态排序
      healthReports.sort((a, b) => {
        const statusOrder = { 'critical': 0, 'warning': 1, 'error': 2, 'no_data': 3, 'healthy': 4 };
        return statusOrder[a.status] - statusOrder[b.status];
      });
      
      return {
        timestamp: new Date().toISOString(),
        totalChannels: siteGroups.length,
        summary: {
          healthy: healthReports.filter(r => r.status === 'healthy').length,
          warning: healthReports.filter(r => r.status === 'warning').length,
          critical: healthReports.filter(r => r.status === 'critical').length,
          error: healthReports.filter(r => r.status === 'error').length,
          noData: healthReports.filter(r => r.status === 'no_data').length
        },
        channels: healthReports
      };
      
    } catch (error) {
      console.error('获取健康报告失败:', error.message);
      throw error;
    }
  }

  /**
   * 记录渠道移除操作
   */
  async logChannelRemoval(channelName, affectedGroups) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'channel_removed',
      channel: channelName,
      affectedGroups,
      reason: 'health_check_failure'
    };

    console.log(`📝 记录渠道移除: ${JSON.stringify(logEntry)}`);
    
    // 可以选择写入专门的操作日志文件
    try {
      const logFile = path.join(__dirname, '../logs/channel-operations.log');
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('写入操作日志失败:', error.message);
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
      nextCheck: this.monitorInterval ? 
        new Date(Date.now() + this.checkIntervalMinutes * 60 * 1000).toISOString() : 
        null
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
    return Array.from(this.channelFailures.entries()).map(([name, failures]) => ({
      name,
      failures,
      threshold: this.failureThreshold,
      willBeRemoved: failures >= this.failureThreshold
    }));
  }
}

module.exports = new ChannelHealthMonitor();
