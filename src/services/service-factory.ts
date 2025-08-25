/**
 * 服务工厂 - 负责初始化和注册所有服务到依赖注入容器
 * 
 * 实现依赖倒置原则，通过接口而非具体实现来组装服务
 */

import { container } from './dependency-container'
import { 
  IInstanceConfigManager, 
  IInstanceHealthManager, 
  IGptloadService,
  IModelsService,
  IYamlManager,
  ISiteConfigurationService,
  IThreeLayerArchitecture,
  IMultiGptloadManager,
  IHealthChecker,
  IHttpClientFactory
} from '../interfaces'

// 导入具体实现
import instanceConfigManager from './instance-config-manager'
import instanceHealthManager from './instance-health-manager'
import { HealthChecker } from './health-checker'
import { HttpClientFactory } from './http-client-factory'
import gptloadService from '../gptload'
import modelsService from '../models'
import yamlManager from '../yaml-manager'
import siteConfigurationService from '../site-configuration'
import threeLayerArchitecture from '../three-layer-architecture'
import { MultiGptloadManager } from '../multi-gptload'

/**
 * 初始化所有服务并注册到依赖注入容器
 */
export function initializeServices(): void {
  console.log('🚀 初始化依赖注入服务...')

  try {
    // 注册基础服务（单例）
    container.registerSingleton<IInstanceConfigManager>('instanceConfigManager', () => instanceConfigManager)
    container.registerSingleton<IInstanceHealthManager>('instanceHealthManager', () => instanceHealthManager)
    container.registerSingleton<IHealthChecker>('healthChecker', () => new HealthChecker())
    container.registerSingleton<IHttpClientFactory>('httpClientFactory', () => HttpClientFactory)

    // 注册业务服务（单例）
    container.registerSingleton<IGptloadService>('gptloadService', () => gptloadService)
    container.registerSingleton<IModelsService>('modelsService', () => modelsService)
    container.registerSingleton<IYamlManager>('yamlManager', () => yamlManager)
    container.registerSingleton<ISiteConfigurationService>('siteConfigurationService', () => siteConfigurationService)
    container.registerSingleton<IThreeLayerArchitecture>('threeLayerArchitecture', () => threeLayerArchitecture)
    
    // 注册多实例管理器（需要特殊处理，因为它是一个类）
    container.registerSingleton<IMultiGptloadManager>('multiGptloadManager', () => {
      const manager = new MultiGptloadManager()
      return manager as IMultiGptloadManager
    })

    console.log('✅ 依赖注入服务初始化完成')
    console.log(`📦 已注册 ${container.getRegisteredServices().length} 个服务:`)
    container.getRegisteredServices().forEach(service => {
      console.log(`  - ${service}`)
    })

  } catch (error) {
    console.error('❌ 依赖注入服务初始化失败:', error.message)
    throw error
  }
}

/**
 * 获取服务实例的便捷函数
 */
export function getService<T>(serviceName: string): T {
  try {
    return container.resolve<T>(serviceName)
  } catch (error) {
    console.error(`❌ 解析服务失败: ${serviceName}`, error.message)
    throw error
  }
}

/**
 * 检查所有必需服务是否已注册
 */
export function validateServiceRegistration(): boolean {
  const requiredServices = [
    'instanceConfigManager',
    'instanceHealthManager', 
    'healthChecker',
    'httpClientFactory',
    'gptloadService',
    'modelsService',
    'yamlManager',
    'siteConfigurationService',
    'threeLayerArchitecture',
    'multiGptloadManager'
  ]

  const registeredServices = container.getRegisteredServices()
  const missingServices = requiredServices.filter(service => !registeredServices.includes(service))

  if (missingServices.length > 0) {
    console.error('❌ 缺少必需服务:', missingServices)
    return false
  }

  console.log('✅ 所有必需服务已正确注册')
  return true
}

/**
 * 清理服务容器
 */
export function cleanupServices(): void {
  console.log('🧹 清理依赖注入容器...')
  container.clear()
  console.log('✅ 清理完成')
}