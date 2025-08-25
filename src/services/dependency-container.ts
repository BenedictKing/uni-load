/**
 * 依赖注入容器实现
 * 
 * 提供服务注册、解析和生命周期管理
 * 支持单例模式和工厂模式
 */

import { IDependencyContainer } from '../interfaces'

export class DependencyContainer implements IDependencyContainer {
  private services = new Map<string, any>()
  private singletons = new Map<string, () => any>()
  private singletonInstances = new Map<string, any>()

  /**
   * 注册服务实例
   */
  register<T>(name: string, implementation: T): void {
    this.services.set(name, implementation)
    console.log(`📦 注册服务: ${name}`)
  }

  /**
   * 注册单例服务工厂
   */
  registerSingleton<T>(name: string, factory: () => T): void {
    this.singletons.set(name, factory)
    console.log(`📦 注册单例服务: ${name}`)
  }

  /**
   * 解析服务实例
   */
  resolve<T>(name: string): T {
    // 优先检查单例实例缓存
    if (this.singletonInstances.has(name)) {
      return this.singletonInstances.get(name) as T
    }

    // 检查单例工厂
    if (this.singletons.has(name)) {
      const factory = this.singletons.get(name)!
      const instance = factory()
      this.singletonInstances.set(name, instance)
      console.log(`🔧 创建单例实例: ${name}`)
      return instance as T
    }

    // 检查直接注册的服务
    if (this.services.has(name)) {
      return this.services.get(name) as T
    }

    throw new Error(`服务未注册: ${name}`)
  }

  /**
   * 检查服务是否已注册
   */
  isRegistered(name: string): boolean {
    return this.services.has(name) || this.singletons.has(name)
  }

  /**
   * 获取所有已注册的服务名称
   */
  getRegisteredServices(): string[] {
    const serviceNames = Array.from(this.services.keys())
    const singletonNames = Array.from(this.singletons.keys())
    return [...serviceNames, ...singletonNames]
  }

  /**
   * 清理所有注册的服务
   */
  clear(): void {
    this.services.clear()
    this.singletons.clear()
    this.singletonInstances.clear()
    console.log('🧹 依赖注入容器已清理')
  }
}

// 创建全局容器实例
export const container = new DependencyContainer()