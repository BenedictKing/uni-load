/**
 * 实例配置管理器
 *
 * 职责：专门负责gpt-load实例配置的加载、验证和管理
 * 从 multi-gptload.ts 中分离的配置管理逻辑
 */

import fs from 'fs'
import path from 'path'
import config from '../config'

export interface GptloadInstance {
  id: string
  name: string
  url: string
  token?: string
  priority: number
  description?: string
  upstream_addresses?: string[]
}

export class InstanceConfigManager {
  /**
   * 加载gpt-load实例配置
   */
  async loadInstancesConfig(): Promise<GptloadInstance[]> {
    const configFiles = [
      'gpt-load-instances.local.json', // 本地配置（优先级最高）
      'gpt-load-instances.json', // 生产配置
    ]
    const customPath = config.gptload.instancesFile
    let configPath: string | null = null

    if (customPath) {
      // 如果提供了自定义路径，则只检查该路径
      if (fs.existsSync(customPath)) {
        configPath = customPath
        console.log(`📁 使用自定义配置文件: ${customPath}`)
      } else {
        // 如果自定义文件不存在，则抛出特定错误，不再回退
        throw new Error(
          `指定的 gpt-load 实例配置文件未找到。\n` +
            `  - 环境变量 GPTLOAD_INSTANCES_FILE 指向: ${customPath}\n` +
            `  - 请确认此文件是否存在，或清除该环境变量以使用默认配置文件。`
        )
      }
    } else {
      // 如果没有自定义路径，则按优先级查找默认文件
      for (const fileName of configFiles) {
        if (fs.existsSync(fileName)) {
          configPath = fileName
          console.log(`📁 使用默认配置文件: ${fileName}`)
          break
        }
      }
    }

    if (!configPath) {
      // 仅当未提供自定义路径且未找到任何默认文件时，才会触发此错误
      throw new Error(
        `未找到 gpt-load 实例配置文件。请创建以下文件之一：\n` +
          configFiles.map((f) => `  - ${f}`).join('\n') +
          `\n\n示例：cp gpt-load-instances.json.example gpt-load-instances.json`
      )
    }

    const rawConfig = fs.readFileSync(configPath, 'utf8')
    const instances = JSON.parse(rawConfig) as GptloadInstance[]

    await this.validateConfig(instances) // 改动：添加 await

    console.log(`✅ 成功加载 ${instances.length} 个 gpt-load 实例配置`)
    return instances
  }

  /**
   * 验证配置格式
   */
  private async validateConfig(instances: GptloadInstance[]): Promise<void> {
    // 改动：添加 async 和 Promise<void>
    if (!Array.isArray(instances)) {
      throw new Error('配置文件格式错误：应该是实例数组')
    }

    if (instances.length === 0) {
      throw new Error('配置文件为空：至少需要配置一个 gpt-load 实例')
    }

    // 验证必需字段
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i]
      const prefix = `实例 ${i + 1}`

      if (!instance.id) {
        throw new Error(`${prefix}: 缺少必需字段 'id'`)
      }

      if (!instance.name) {
        throw new Error(`${prefix}: 缺少必需字段 'name'`)
      }

      if (!instance.url) {
        throw new Error(`${prefix}: 缺少必需字段 'url'`)
      }

      if (typeof instance.priority !== 'number') {
        throw new Error(`${prefix}: 'priority' 必须是数字`)
      }

      // 验证URL格式
      try {
        new URL(instance.url)
      } catch {
        throw new Error(`${prefix}: 无效的URL格式 '${instance.url}'`)
      }
    }

    // 验证唯一性
    const ids = instances.map((i) => i.id)
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    if (duplicateIds.length > 0) {
      throw new Error(`重复的实例ID: ${duplicateIds.join(', ')}`)
    }

    const urls = instances.map((i) => i.url)
    const duplicateUrls = urls.filter((url, index) => urls.indexOf(url) !== index)
    if (duplicateUrls.length > 0) {
      throw new Error(`重复的实例URL: ${duplicateUrls.join(', ')}`)
    }

    // 验证上游地址
    const validationResult = await this.validateUpstreamAddresses(instances) // 改动：添加 await
    if (!validationResult.valid) {
      // 改动：检查 validationResult.valid
      throw new Error(
        `上游地址配置错误:\n${validationResult.issues.join('\n')}\n\n` + // 改动：使用 validationResult.issues
          `规则：实例只能使用序号更大的实例作为上游地址，以避免循环依赖和访问失败`
      )
    }
  }

  /**
   * 验证上游地址配置
   */
  async validateUpstreamAddresses(instances: GptloadInstance[]): Promise<{ valid: boolean; issues: string[] }> {
    // 改动：方法签名
    const errors: string[] = []

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i]

      if (!instance.upstream_addresses || !Array.isArray(instance.upstream_addresses)) {
        continue
      }

      const currentInstanceName = instance.name

      for (const upstreamAddr of instance.upstream_addresses) {
        // 检查是否引用了序号更小或相等的实例
        for (let j = 0; j <= i; j++) {
          const otherInstance = instances[j]

          // 比较URL（忽略协议和端口差异）
          if (this.normalizeUrl(upstreamAddr) === this.normalizeUrl(otherInstance.url)) {
            errors.push(
              `实例 '${currentInstanceName}' (序号 ${i}) 不能使用序号更小或相等的实例 ` +
                `'${otherInstance.name}' (序号 ${j}, ${otherInstance.url}) 作为上游地址`
            )
          }
        }
      }
    }

    return { valid: errors.length === 0, issues: errors } // 改动：返回对象
  }

  /**
   * 标准化URL用于比较
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      // 只比较主机名和路径，忽略协议和端口
      return `${urlObj.hostname}${urlObj.pathname}`
    } catch (error) {
      // 如果不是完整URL，直接返回原始字符串
      return url.replace(/^https?:\/\//, '').replace(/:\d+$/, '')
    }
  }

  /**
   * 按优先级排序实例
   */
  sortInstancesByPriority(instances: GptloadInstance[]): GptloadInstance[] {
    return [...instances].sort((a, b) => a.priority - b.priority)
  }

  /**
   * 获取实例的显示信息
   */
  getInstanceDisplayInfo(instance: GptloadInstance): string {
    return `${instance.name} (${instance.url})`
  }

  /**
   * 验证实例连接配置
   */
  validateInstanceConnection(instance: GptloadInstance): boolean {
    try {
      // 验证URL可达性（基础检查）
      const url = new URL(instance.url)

      // 检查必要的配置项
      if (!instance.id || !instance.name) {
        return false
      }

      // 检查远程实例是否有token
      if (
        instance.url.includes('://') &&
        !instance.url.startsWith('http://localhost') &&
        !instance.url.startsWith('http://127.0.0.1') &&
        !instance.token
      ) {
        console.warn(`⚠️ 远程实例 ${instance.name} 未配置token，可能导致认证失败`)
      }

      return true
    } catch (error) {
      console.error(`❌ 实例 ${instance.name} 配置验证失败:`, error.message)
      return false
    }
  }

  /**
   * 生成配置文件示例
   */
  generateConfigExample(): GptloadInstance[] {
    return [
      {
        id: 'local',
        name: '本地 gpt-load',
        url: 'http://localhost:3001',
        priority: 1,
        description: '本地服务，优先使用',
      },
      {
        id: 'us-proxy',
        name: '美国代理 gpt-load',
        url: 'https://us.gpt-load.example.com',
        token: 'your-token-here',
        priority: 2,
        description: '用于本地不易访问的站点',
        upstream_addresses: ['https://eu.gpt-load.example.com'],
      },
      {
        id: 'eu-proxy',
        name: '欧洲代理 gpt-load',
        url: 'https://eu.gpt-load.example.com',
        token: 'your-token-here',
        priority: 3,
        description: '欧洲服务器，最后备选',
      },
    ]
  }

  /**
   * 导出当前配置
   */
  async exportConfig(instances: GptloadInstance[], outputPath?: string): Promise<string> {
    const configData = JSON.stringify(instances, null, 2)

    if (outputPath) {
      fs.writeFileSync(outputPath, configData, 'utf8')
      console.log(`📁 配置已导出到: ${outputPath}`)
    }

    return configData
  }
}

export default new InstanceConfigManager()
