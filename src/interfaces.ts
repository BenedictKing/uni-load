/**
 * 核心服务接口定义
 *
 * 定义所有核心服务的接口，实现依赖倒置原则
 * 高层模块依赖抽象接口，而不是具体实现
 */

import { GptloadInstance } from './types'

// ============= 配置管理接口 =============

export interface IInstanceConfigManager {
  /**
   * 加载实例配置
   */
  loadInstancesConfig(): Promise<GptloadInstance[]>

  /**
   * 验证实例连接配置
   */
  validateInstanceConnection(instance: GptloadInstance): boolean

  /**
   * 验证上游地址
   */
  validateUpstreamAddresses(instances: GptloadInstance[]): Promise<{
    valid: boolean
    issues: string[]
  }>

  /**
   * 按优先级排序实例
   */
  sortInstancesByPriority(instances: GptloadInstance[]): GptloadInstance[]

  /**
   * 获取实例显示信息
   */
  getInstanceDisplayInfo(instance: GptloadInstance): string
}

// ============= 健康管理接口 =============

export interface IInstanceHealthManager {
  /**
   * 创建API客户端
   */
  createApiClient(instance: GptloadInstance): any

  /**
   * 检查单实例健康状态
   */
  checkInstanceHealth(instance: any): Promise<any>

  /**
   * 批量检查实例健康状态
   */
  checkAllInstancesHealth(instances: any[]): Promise<Map<string, any>>

  /**
   * 测试站点可达性
   */
  testSiteAccessibility(instance: any, siteUrl: string): Promise<any>

  /**
   * 获取健康实例列表
   */
  getHealthyInstances(instances: any[]): any[]

  /**
   * 获取健康统计信息
   */
  getHealthStatistics(instances: any[]): any

  /**
   * 启动定期健康检查
   */
  startPeriodicHealthCheck(instances: any[], intervalMs: number): NodeJS.Timeout
}

// ============= gpt-load 服务接口 =============

export interface IGptloadService {
  /**
   * 多实例管理器
   */
  manager: IMultiGptloadManager

  /**
   * 获取所有分组
   */
  getAllGroups(): Promise<any[]>

  /**
   * 创建站点分组
   */
  createSiteGroup(
    siteName: string,
    baseUrl: string,
    apiKeys?: string[],
    channelType?: string,
    customValidationEndpoints?: any,
    models?: string[]
  ): Promise<any>

  /**
   * 创建或更新模型分组
   */
  createOrUpdateModelGroups(models: string[], siteGroups: any[]): Promise<any[]>

  /**
   * 删除所有模型分组
   */
  deleteAllModelGroups(): Promise<any>

  /**
   * 获取分组API密钥
   */
  getGroupApiKeys(groupId: string, instanceId: string): Promise<string[]>

  /**
   * 处理空模型列表
   */
  handleEmptyModelList(channelName: string): Promise<any>

  /**
   * 完全删除渠道
   */
  deleteChannelCompletely(channelName: string): Promise<any>

  /**
   * 获取状态
   */
  getStatus(): Promise<{
    connected: boolean
    instances: Record<string, {
      id: string
      name: string
      url: string
      priority: number
      healthy: boolean
      responseTime: number
      lastCheck: Date
      error?: string
    }>
    healthyCount: number
    totalCount: number
    siteAssignments: Record<string, {
      instanceId: string
      instanceName?: string
    }>
    error?: string
  }>

  /**
   * 获取多实例状态
   */
  getMultiInstanceStatus(): {
    instances: Record<string, {
      id: string
      name: string
      url: string
      priority: number
      healthy: boolean
      responseTime: number
      lastCheck: Date
      error?: string
    }>
    siteAssignments: Record<string, {
      instanceId: string
      instanceName?: string
    }>
  }

  /**
   * 重新分配站点
   */
  reassignSite(siteUrl: string, instanceId?: string): Promise<void>
}

// ============= 模型服务接口 =============

export interface IModelsService {
  /**
   * 获取模型列表
   */
  getModels(baseUrl: string, apiKey: string, retryCount?: number): Promise<any[]>

  /**
   * 过滤模型
   */
  filterModels(models: any[]): any[]

  /**
   * API探测
   */
  probeApiStructure(baseUrl: string, apiKey?: string): Promise<any>
}

// ============= YAML管理接口 =============

export interface IYamlManager {
  /**
   * 更新uni-api配置
   */
  updateUniApiConfig(modelGroups: any[]): Promise<void>

  /**
   * 获取状态
   */
  getStatus(): Promise<any>

  /**
   * 标准化模型名称
   */
  normalizeModelName(originalModel: string): any
}

// ============= 站点配置服务接口 =============

export interface ISiteConfigurationService {
  /**
   * 生成站点名称
   */
  generateSiteNameFromUrl(baseUrl: string): string

  /**
   * 验证请求
   */
  validateRequest(request: any): void

  /**
   * 预处理请求
   */
  preprocessRequest(request: any): any

  /**
   * 获取模型
   */
  getModels(request: any): Promise<{
    models: string[]
    successfulInstance?: string
    instanceName?: string
  }>

  /**
   * 处理站点配置
   */
  processSiteConfiguration(request: any): Promise<any>

  /**
   * 处理空模型列表
   */
  handleEmptyModelList(siteName: string, channelTypes: string[]): Promise<any>
}

// ============= 三层架构接口 =============

export interface IThreeLayerArchitecture {
  /**
   * 初始化架构
   */
  initialize(): Promise<any>

  /**
   * 获取架构状态
   */
  getArchitectureStatus(): Promise<any>

  /**
   * 手动恢复
   */
  manualRecovery(model: string, channel: string): Promise<any>

  /**
   * 获取详细架构统计
   */
  getDetailedArchitectureStats(): Promise<any>
}

// ============= 多实例管理接口 =============

export interface IMultiGptloadManager {
  /**
   * 实例集合
   */
  instances: Map<string, any>

  /**
   * 健康状态映射
   */
  healthStatus: Map<string, any>

  /**
   * 选择最佳实例
   */
  selectBestInstance(siteUrl?: string): Promise<any>

  /**
   * 重新分配站点
   */
  reassignSite(siteUrl: string, instanceId?: string): Promise<void>

  /**
   * 通过多实例获取模型
   */
  getModelsViaMultiInstance(
    baseUrl: string,
    apiKey: string
  ): Promise<{
    models: any[]
    instanceId: string
    instanceName: string
  }>

  /**
   * 获取所有实例状态信息（返回对象格式，便于按ID访问）
   */
  getAllInstancesStatus(): Record<string, {
    id: string
    name: string
    url: string
    priority: number
    healthy: boolean
    responseTime: number
    lastCheck: Date
    error?: string
  }>

  /**
   * 获取站点分配信息
   */
  getSiteAssignments(): Record<string, {
    instanceId: string
    instanceName?: string
  }>

  /**
   * 获取所有实例
   */
  getAllInstances(): any[]

  /**
   * 获取指定实例
   */
  getInstance(instanceId: string): any

  /**
   * 启动定期健康检查
   */
  startPeriodicHealthCheck(intervalMs?: number): NodeJS.Timeout
}

// ============= 健康检查服务接口 =============

export interface IHealthChecker {
  /**
   * 检查健康状态
   */
  checkHealth(url: string, options?: any): Promise<any>

  /**
   * 测试连接性
   */
  testConnectivity(url: string, options?: any): Promise<any>

  /**
   * 批量健康检查
   */
  checkMultipleHealth(urls: string[], options?: any): Promise<Map<string, any>>

  /**
   * 批量连接性测试
   */
  testMultipleConnectivity(urls: string[], options?: any): Promise<Map<string, any>>

  /**
   * 检查API端点
   */
  checkApiEndpoint(baseUrl: string, endpoint?: string, token?: string): Promise<any>

  /**
   * 检查gpt-load实例健康状态
   */
  checkGptloadInstanceHealth(instanceUrl: string, token?: string): Promise<any>

  /**
   * 测试站点可访问性
   */
  testSiteAccessibility(siteUrl: string, timeout?: number): Promise<any>

  /**
   * 获取健康检查统计信息
   */
  getHealthStatistics(results: any[]): any
}

// ============= HTTP客户端工厂接口 =============

export interface IHttpClientFactory {
  /**
   * 创建默认客户端
   */
  createDefaultClient(options?: any): any

  /**
   * 创建模型客户端
   */
  createModelClient(options?: any): any

  /**
   * 创建健康检查客户端
   */
  createHealthClient(options?: any): any

  /**
   * 创建gpt-load客户端
   */
  createGptloadClient(baseUrl: string, token?: string, options?: any): any

  /**
   * 创建实例客户端
   */
  createInstanceClient(instanceUrl: string, token?: string, options?: any): any

  /**
   * 创建连接性测试客户端
   */
  createConnectivityClient(options?: any): any
}

// ============= 服务依赖映射 =============

export interface ServiceDependencies {
  instanceConfigManager: IInstanceConfigManager
  instanceHealthManager: IInstanceHealthManager
  gptloadService: IGptloadService
  modelsService: IModelsService
  yamlManager: IYamlManager
  siteConfigurationService: ISiteConfigurationService
  threeLayerArchitecture: IThreeLayerArchitecture
  multiGptloadManager: IMultiGptloadManager
  healthChecker: IHealthChecker
  httpClientFactory: IHttpClientFactory
}

// ============= 依赖注入容器接口 =============

export interface IDependencyContainer {
  /**
   * 注册服务
   */
  register<T>(name: string, implementation: T): void

  /**
   * 注册单例服务
   */
  registerSingleton<T>(name: string, factory: () => T): void

  /**
   * 解析服务
   */
  resolve<T>(name: string): T

  /**
   * 检查服务是否已注册
   */
  isRegistered(name: string): boolean

  /**
   * 获取所有注册的服务名称
   */
  getRegisteredServices(): string[]
}
