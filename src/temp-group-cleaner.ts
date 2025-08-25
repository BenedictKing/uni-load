/**
 * 临时分组清理器
 * 专门用于清理系统中残留的临时测试分组和调试分组
 */

import MultiGptloadManager from './multi-gptload';

export class TempGroupCleaner {
  private manager: MultiGptloadManager;

  constructor(manager: MultiGptloadManager) {
    this.manager = manager;
  }

  /**
   * 清理所有实例中的临时分组
   */
  async cleanupAllTempGroups(): Promise<{
    totalCleaned: number;
    instanceResults: Array<{
      instanceName: string;
      cleaned: number;
      errors: string[];
    }>;
  }> {
    console.log('🧹 开始清理所有实例中的临时分组...');
    
    const instances = await this.manager.getHealthyInstances();
    const results = {
      totalCleaned: 0,
      instanceResults: []
    };

    for (const instance of instances) {
      const instanceResult = await this.cleanupInstanceTempGroups(instance);
      results.instanceResults.push(instanceResult);
      results.totalCleaned += instanceResult.cleaned;
    }

    console.log(`✅ 临时分组清理完成，总共清理了 ${results.totalCleaned} 个分组`);
    return results;
  }

  /**
   * 清理单个实例中的临时分组
   */
  private async cleanupInstanceTempGroups(instance: any): Promise<{
    instanceName: string;
    cleaned: number;
    errors: string[];
  }> {
    const result = {
      instanceName: instance.name,
      cleaned: 0,
      errors: []
    };

    try {
      console.log(`🔍 检查实例 ${instance.name} 中的临时分组...`);
      
      // 获取所有分组
      const groupsResponse = await instance.apiClient.get('/groups');
      let groups;
      
      if (groupsResponse.data && typeof groupsResponse.data.code === 'number') {
        groups = groupsResponse.data.data;
      } else {
        groups = groupsResponse.data;
      }

      if (!groups || !Array.isArray(groups)) {
        result.errors.push('无法获取分组列表');
        return result;
      }

      // 筛选出临时分组
      const tempGroups = groups.filter(group => 
        group.name.startsWith('temp-test-') || 
        group.name.startsWith('debug-models-')
      );

      console.log(`📋 实例 ${instance.name} 中发现 ${tempGroups.length} 个临时分组`);

      // 逐个删除临时分组
      for (const group of tempGroups) {
        try {
          await instance.apiClient.delete(`/groups/${group.id}`);
          result.cleaned++;
          console.log(`🗑️ 已清理临时分组: ${group.name} (ID: ${group.id})`);
        } catch (deleteError) {
          const errorMsg = `删除分组 ${group.name} 失败: ${deleteError.message}`;
          result.errors.push(errorMsg);
          console.warn(`⚠️ ${errorMsg}`);
        }
      }

    } catch (error) {
      const errorMsg = `检查实例 ${instance.name} 失败: ${error.message}`;
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
    }

    return result;
  }

  /**
   * 获取所有实例中临时分组的统计信息
   */
  async getTempGroupsStats(): Promise<{
    totalTempGroups: number;
    instanceStats: Array<{
      instanceName: string;
      tempGroups: Array<{
        id: number;
        name: string;
        created_at: string;
      }>;
    }>;
  }> {
    console.log('📊 统计所有实例中的临时分组...');
    
    const instances = await this.manager.getHealthyInstances();
    const stats = {
      totalTempGroups: 0,
      instanceStats: []
    };

    for (const instance of instances) {
      try {
        const groupsResponse = await instance.apiClient.get('/groups');
        let groups;
        
        if (groupsResponse.data && typeof groupsResponse.data.code === 'number') {
          groups = groupsResponse.data.data;
        } else {
          groups = groupsResponse.data;
        }

        if (groups && Array.isArray(groups)) {
          const tempGroups = groups
            .filter(group => 
              group.name.startsWith('temp-test-') || 
              group.name.startsWith('debug-models-')
            )
            .map(group => ({
              id: group.id,
              name: group.name,
              created_at: group.created_at || 'unknown'
            }));

          stats.instanceStats.push({
            instanceName: instance.name,
            tempGroups
          });

          stats.totalTempGroups += tempGroups.length;
        }
      } catch (error) {
        console.warn(`⚠️ 获取实例 ${instance.name} 分组信息失败: ${error.message}`);
        stats.instanceStats.push({
          instanceName: instance.name,
          tempGroups: []
        });
      }
    }

    console.log(`📈 统计完成，总共发现 ${stats.totalTempGroups} 个临时分组`);
    return stats;
  }

  /**
   * 清理指定时间之前创建的临时分组
   */
  async cleanupOldTempGroups(hoursOld: number = 24): Promise<{
    totalCleaned: number;
    instanceResults: Array<{
      instanceName: string;
      cleaned: number;
      errors: string[];
    }>;
  }> {
    console.log(`🧹 清理 ${hoursOld} 小时前创建的临时分组...`);
    
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    const instances = await this.manager.getHealthyInstances();
    const results = {
      totalCleaned: 0,
      instanceResults: []
    };

    for (const instance of instances) {
      const instanceResult = {
        instanceName: instance.name,
        cleaned: 0,
        errors: []
      };

      try {
        const groupsResponse = await instance.apiClient.get('/groups');
        let groups;
        
        if (groupsResponse.data && typeof groupsResponse.data.code === 'number') {
          groups = groupsResponse.data.data;
        } else {
          groups = groupsResponse.data;
        }

        if (groups && Array.isArray(groups)) {
          const oldTempGroups = groups.filter(group => {
            if (!group.name.startsWith('temp-test-') && !group.name.startsWith('debug-models-')) {
              return false;
            }
            
            // 尝试从创建时间判断，如果没有创建时间则从名称中的时间戳判断
            if (group.created_at) {
              return new Date(group.created_at) < cutoffTime;
            } else {
              // 从分组名称中提取时间戳 (temp-test-{timestamp}-{random})
              const match = group.name.match(/(?:temp-test-|debug-models-)([a-z0-9]+)-/);
              if (match) {
                const timestamp = parseInt(match[1], 36) * 1000; // 转换为毫秒
                return new Date(timestamp) < cutoffTime;
              }
              return true; // 无法判断时间则清理
            }
          });

          for (const group of oldTempGroups) {
            try {
              await instance.apiClient.delete(`/groups/${group.id}`);
              instanceResult.cleaned++;
              console.log(`🗑️ 已清理过期临时分组: ${group.name} (ID: ${group.id})`);
            } catch (deleteError) {
              const errorMsg = `删除过期分组 ${group.name} 失败: ${deleteError.message}`;
              instanceResult.errors.push(errorMsg);
              console.warn(`⚠️ ${errorMsg}`);
            }
          }
        }
      } catch (error) {
        const errorMsg = `处理实例 ${instance.name} 失败: ${error.message}`;
        instanceResult.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }

      results.instanceResults.push(instanceResult);
      results.totalCleaned += instanceResult.cleaned;
    }

    console.log(`✅ 过期临时分组清理完成，总共清理了 ${results.totalCleaned} 个分组`);
    return results;
  }
}