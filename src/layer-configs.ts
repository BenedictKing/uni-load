/**
 * 三层架构配置文件
 * 用于避免模块间的循环依赖
 */

export const layerConfigs = {
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

export default layerConfigs;