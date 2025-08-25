# 开发指南

## 概述

本指南面向 uni-load 项目的开发者，提供代码结构、开发流程、最佳实践等详细信息。

## 技术栈

### 核心技术

- **运行时**: Bun 1.0+
- **语言**: TypeScript 5.9+
- **框架**: Express.js 4.18+
- **构建工具**: TypeScript Compiler

### 依赖库

**生产依赖**:
- `express`: HTTP 服务器框架
- `axios`: HTTP 客户端
- `yaml`: YAML 文件处理
- `cors`: 跨域支持
- `dotenv`: 环境变量管理

**开发依赖**:
- `typescript`: TypeScript 编译器
- `@types/*`: TypeScript 类型定义
- `ts-node`: TypeScript 直接执行

## 开发环境设置

### 1. 环境要求

基本环境安装请参考 [README.md](../README.md#前置条件)

```bash
# 检查开发环境
node --version  # >= 18.0.0
bun --version   # >= 1.0.0
npx tsc --version  # >= 5.0.0
```

### 2. 开发工具配置

#### VS Code 推荐插件

创建 `.vscode/extensions.json`：

```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml"
  ]
}
```

#### VS Code 设置

创建 `.vscode/settings.json`：

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  },
  "files.associations": {
    "*.env*": "dotenv"
  }
}
```

## 代码架构

详细的架构设计请参考 [系统架构文档](system-architecture-v2.md) 和 [模块设计文档](module-design.md)

### 核心设计原则

- **SOLID 原则**: 单一职责、开闭原则、里氏替换、接口隔离、依赖倒置
- **DRY 原则**: 消除重复代码和逻辑
- **KISS 原则**: 保持简单直观
- **模块化**: 清晰的模块边界和职责分离

### 2. 核心模块设计

#### 2.1 类型定义 (types.ts)

```typescript
// 请求响应接口
export interface ProcessAiSiteRequest {
  baseUrl: string;
  apiKeys?: string[];
  channelTypes?: string[];
  customValidationEndpoints?: Record<string, string>;
  models?: string[];
}

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
}

// 实例配置接口
export interface GptLoadInstance {
  id: string;
  name: string;
  url: string;
  token?: string;
  priority: number;
  description?: string;
  upstream_addresses?: string[];
}
```

#### 2.2 服务基类设计

```typescript
// 抽象服务基类
abstract class BaseService {
  protected logger: Logger;
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  protected async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    // 重试逻辑实现
  }
  
  protected handleError(error: Error, context: string): never {
    // 统一错误处理
  }
}
```

### 3. 设计模式应用

#### 3.1 单例模式 - 实例管理器

```typescript
class MultiGPTLoadManager {
  private static instance: MultiGPTLoadManager;
  private instances: Map<string, GptLoadInstance> = new Map();
  
  static getInstance(): MultiGPTLoadManager {
    if (!MultiGPTLoadManager.instance) {
      MultiGPTLoadManager.instance = new MultiGPTLoadManager();
    }
    return MultiGPTLoadManager.instance;
  }
}
```

#### 3.2 策略模式 - 渠道类型处理

```typescript
interface ChannelStrategy {
  validateEndpoint(baseUrl: string, apiKey: string): Promise<boolean>;
  formatConfig(config: any): any;
}

class OpenAIChannelStrategy implements ChannelStrategy {
  async validateEndpoint(baseUrl: string, apiKey: string): Promise<boolean> {
    // OpenAI 特定验证逻辑
  }
}

class AnthropicChannelStrategy implements ChannelStrategy {
  async validateEndpoint(baseUrl: string, apiKey: string): Promise<boolean> {
    // Anthropic 特定验证逻辑
  }
}
```

#### 3.3 观察者模式 - 事件通知

```typescript
interface EventObserver {
  onInstanceStatusChange(instanceId: string, status: string): void;
  onChannelHealthChange(channelName: string, isHealthy: boolean): void;
}

class HealthMonitor {
  private observers: EventObserver[] = [];
  
  subscribe(observer: EventObserver): void {
    this.observers.push(observer);
  }
  
  private notify(event: string, data: any): void {
    this.observers.forEach(observer => {
      // 通知观察者
    });
  }
}
```

## 开发流程

### 1. 功能开发流程

```bash
# 1. 创建功能分支
git checkout -b feature/new-feature

# 2. 开发调试
bun dev  # 启动开发服务器

# 3. 类型检查
bun run type-check

# 4. 构建测试
bun run build

# 5. 提交代码
git add .
git commit -m "feat: 添加新功能"

# 6. 推送并创建 PR
git push origin feature/new-feature
```

### 2. 调试技巧

#### 启用详细日志

```typescript
// 在开发环境中启用调试日志
if (process.env.NODE_ENV === 'development') {
  console.log = (...args) => {
    const timestamp = new Date().toISOString();
    originalConsoleLog(`[${timestamp}]`, ...args);
  };
}
```

#### 使用调试工具

```bash
# 使用 Node.js 调试器
bun --inspect server.ts

# 使用 VS Code 调试
# 创建 .vscode/launch.json 配置
```

VS Code 调试配置：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug uni-load",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server.ts",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["--inspect"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "sourceMaps": true
    }
  ]
}
```

### 3. 测试策略

#### 单元测试框架

```bash
# 安装测试依赖
bun add -d jest @types/jest ts-jest

# 创建 jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
};
```

#### 测试示例

```typescript
// tests/gptload.test.ts
import { GptLoadService } from '../src/gptload';

describe('GptLoadService', () => {
  let service: GptLoadService;
  
  beforeEach(() => {
    service = new GptLoadService();
  });
  
  test('should create site group successfully', async () => {
    const result = await service.createSiteGroup(
      'test-site',
      'https://api.test.com',
      ['sk-test'],
      'openai'
    );
    
    expect(result).toHaveProperty('name', 'test-site');
  });
});
```

## 编码规范

### 1. TypeScript 规范

#### 类型定义

```typescript
// ✅ 推荐：使用 interface 定义对象结构
interface UserConfig {
  id: string;
  name: string;
  settings?: UserSettings;
}

// ✅ 推荐：使用 type 定义联合类型
type Status = 'active' | 'inactive' | 'pending';

// ❌ 避免使用 any
function process(data: any): any {  // 不推荐
  return data;
}

// ✅ 推荐：使用泛型
function process<T>(data: T): T {
  return data;
}
```

#### 函数设计

```typescript
// ✅ 推荐：参数对象化
interface CreateSiteOptions {
  siteName: string;
  baseUrl: string;
  apiKeys: string[];
  channelType: string;
}

async function createSiteGroup(options: CreateSiteOptions): Promise<SiteGroup> {
  // 实现
}

// ❌ 避免过多参数
async function createSiteGroup(
  siteName: string,
  baseUrl: string,
  apiKeys: string[],
  channelType: string,
  customEndpoints?: Record<string, string>
): Promise<SiteGroup> {
  // 不推荐
}
```

### 2. 错误处理规范

#### 统一错误类型

```typescript
// 定义应用错误类型
export class AppError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN_ERROR',
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}
```

#### 错误处理中间件

```typescript
// Express 错误处理中间件
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    });
  }
  
  // 记录未知错误
  console.error('Unhandled error:', err);
  
  res.status(500).json({
    error: 'Internal server error'
  });
}
```

### 3. 异步处理规范

```typescript
// ✅ 推荐：使用 async/await
async function processRequest(req: Request): Promise<Response> {
  try {
    const models = await fetchModels(req.body.baseUrl);
    const groups = await createGroups(models);
    return { success: true, data: groups };
  } catch (error) {
    throw new AppError(`Processing failed: ${error.message}`);
  }
}

// ✅ 推荐：并发处理
async function processMultipleChannels(channels: Channel[]): Promise<Result[]> {
  const promises = channels.map(channel => processChannel(channel));
  return Promise.allSettled(promises);
}
```

### 4. 日志规范

```typescript
// 统一日志格式
interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, any>;
}

class Logger {
  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }
  
  private log(level: string, message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level as any,
      message,
      context
    };
    
    console.log(JSON.stringify(entry));
  }
}
```

## 性能优化

### 1. HTTP 请求优化

```typescript
// 使用连接池
import axios from 'axios';

const httpClient = axios.create({
  timeout: 10000,
  maxRedirects: 3,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true })
});
```

### 2. 缓存策略

```typescript
// 简单内存缓存
class MemoryCache<T> {
  private cache = new Map<string, { value: T; expiry: number }>();
  
  set(key: string, value: T, ttlMs: number = 60000): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs
    });
  }
  
  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
}
```

### 3. 并发控制

```typescript
// 限制并发数量
class ConcurrencyLimiter {
  private running = 0;
  private queue: (() => Promise<any>)[] = [];
  
  constructor(private maxConcurrency: number) {}
  
  async run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }
  
  private async processQueue(): Promise<void> {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }
    
    this.running++;
    const task = this.queue.shift()!;
    
    try {
      await task();
    } finally {
      this.running--;
      this.processQueue();
    }
  }
}
```

## 常见问题和解决方案

### 1. TypeScript 编译问题

```bash
# 清理构建缓存
rm -rf dist/
bun run build

# 检查类型错误
bun run type-check --noEmit
```

### 2. 模块导入问题

```typescript
// 确保使用正确的导入方式
import { GptLoadService } from './gptload';  // ✅ 相对路径
import express from 'express';               // ✅ 第三方库
```

### 3. 异步操作超时

```typescript
// 添加超时控制
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
    })
  ]);
}
```

## 扩展开发指南

### 1. 添加新的渠道类型

1. 在 `types.ts` 中定义渠道接口
2. 实现渠道策略类
3. 在路由验证中添加新类型
4. 更新文档

### 2. 添加新的监控指标

1. 在对应服务中添加指标收集
2. 实现指标存储和查询
3. 添加 API 端点暴露指标
4. 更新状态页面显示

### 3. 扩展配置管理

1. 在 `types.ts` 中定义新的配置接口
2. 更新环境变量处理
3. 添加配置验证逻辑
4. 更新示例配置文件

## Git 工作流

### 1. 分支规范

```bash
main              # 主分支，稳定版本
develop          # 开发分支
feature/xxx      # 功能分支
bugfix/xxx       # 修复分支
hotfix/xxx       # 紧急修复分支
release/vx.x.x   # 发布分支
```

### 2. 提交规范

```bash
feat: 添加新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建配置等
```

### 3. 发布流程

```bash
# 1. 从 develop 创建 release 分支
git checkout develop
git pull origin develop
git checkout -b release/v1.2.0

# 2. 更新版本号
npm version 1.2.0

# 3. 构建和测试
bun run build
bun run test

# 4. 合并到 main 并打标签
git checkout main
git merge release/v1.2.0
git tag v1.2.0

# 5. 推送并清理
git push origin main --tags
git push origin develop
git branch -d release/v1.2.0
```

## 总结

开发 uni-load 时请遵循：

1. **类型安全**: 充分利用 TypeScript 类型系统
2. **错误处理**: 实现统一的错误处理机制
3. **代码质量**: 保持代码整洁和可维护性
4. **性能考虑**: 合理使用缓存和并发控制
5. **文档同步**: 及时更新代码和文档
6. **测试覆盖**: 为关键功能编写测试

遇到问题时，优先查看日志文件和控制台输出，善用调试工具进行问题定位。