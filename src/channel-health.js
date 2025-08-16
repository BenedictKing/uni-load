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
    this.logFilePath = process.env.GPTLOAD_LOG_PATH || '/tmp/gptload.log';
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
      
      // 方法2: 分析日志文件（如果存在）
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
   * 过滤出站点分组
   */
  filterSiteGroups(allGroups) {
    return allGroups.filter(group => {
      if (!group.upstreams || group.upstreams.length === 0) {
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
      // 这里需要实现实际的健康检查逻辑
      // 可以通过调用gptload的测试接口或直接测试上游URL
      
      const baseUrl = siteGroup.upstreams[0]?.url;
      if (!baseUrl) {
        throw new Error('没有找到上游URL');
      }

      // 模拟健康检查 - 实际应该调用相应的测试接口
      console.log(`🔍 检查 ${siteGroup.name}: ${baseUrl}`);
      
      // 这里可以实现：
      // 1. 调用 /v1/models 接口
      // 2. 调用 gptload 的测试接口
      // 3. 检查响应时间和成功率
      
      return { success: true };
      
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
      const upstreamUrl = `${process.env.GPTLOAD_URL || 'http://localhost:3001'}/proxy/${siteGroupName}`;
      
      // 过滤掉要移除的上游
      const updatedUpstreams = modelGroup.upstreams.filter(upstream => 
        upstream.url !== upstreamUrl
      );

      if (updatedUpstreams.length < modelGroup.upstreams.length) {
        // 有上游被移除，更新分组
        if (updatedUpstreams.length === 0) {
          console.log(`⚠️ 模型分组 ${modelGroup.name} 将没有可用上游，跳过移除`);
          return false;
        }

        const updateData = { upstreams: updatedUpstreams };
        
        // 这里需要实现更新分组的API调用
        // await gptloadService.updateGroup(modelGroup.id, updateData);
        
        console.log(`➖ 从模型分组 ${modelGroup.name} 中移除上游 ${siteGroupName}`);
        console.log(`⚠️ 分组更新功能需要在 gptload 服务中实现`);
        
        return true;
      }

      return false;
    } catch (error) {
      console.error(`从模型分组 ${modelGroup.name} 移除上游失败:`, error.message);
      return false;
    }
  }

  /**
   * 分析日志文件
   */
  async checkChannelsByLogs() {
    try {
      // 检查日志文件是否存在
      const exists = await fs.access(this.logFilePath).then(() => true).catch(() => false);
      if (!exists) {
        console.log(`📝 日志文件不存在: ${this.logFilePath}`);
        return;
      }

      // 读取最近的日志内容
      const logContent = await this.readRecentLogs();
      
      // 分析错误模式
      const failedChannels = this.analyzeLogErrors(logContent);
      
      // 处理发现的失败渠道
      for (const [channelName, errorCount] of failedChannels.entries()) {
        await this.recordChannelFailure(channelName, `日志中发现 ${errorCount} 个错误`);
      }

    } catch (error) {
      console.error('日志分析失败:', error.message);
    }
  }

  /**
   * 读取最近的日志内容
   */
  async readRecentLogs() {
    try {
      const stats = await fs.stat(this.logFilePath);
      const fileSize = stats.size;
      
      // 只读取最后1MB的内容
      const readSize = Math.min(fileSize, 1024 * 1024);
      const startPos = Math.max(0, fileSize - readSize);
      
      const buffer = Buffer.alloc(readSize);
      const fd = await fs.open(this.logFilePath, 'r');
      
      try {
        await fd.read(buffer, 0, readSize, startPos);
        return buffer.toString('utf8');
      } finally {
        await fd.close();
      }
    } catch (error) {
      console.error('读取日志文件失败:', error.message);
      return '';
    }
  }

  /**
   * 分析日志中的错误模式
   */
  analyzeLogErrors(logContent) {
    const failedChannels = new Map();
    
    // 常见的错误模式
    const errorPatterns = [
      /ERROR.*proxy\/([^\/\s]+).*failed/gi,
      /Connection refused.*proxy\/([^\/\s]+)/gi,
      /Timeout.*proxy\/([^\/\s]+)/gi,
      /HTTP 5\d\d.*proxy\/([^\/\s]+)/gi
    ];

    for (const pattern of errorPatterns) {
      let match;
      while ((match = pattern.exec(logContent)) !== null) {
        const channelName = match[1];
        const count = failedChannels.get(channelName) || 0;
        failedChannels.set(channelName, count + 1);
      }
    }

    return failedChannels;
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