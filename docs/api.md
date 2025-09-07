# API 接口文档

## 概述

uni-load v2.1 提供了一套完整的 RESTful API 接口，基于重构后的服务化架构，用于管理 AI 站点配置、监控服务状态、控制自动化任务等。所有接口都通过依赖注入的业务逻辑服务层处理，确保了更好的可维护性和测试能力。

## 基础信息

- **基础 URL**: `http://localhost:3002`
- **Content-Type**: `application/json`
- **认证**: 目前无需认证（内部服务）

## API 接口分类

### 1. 核心配置接口

#### 1.1 预览站点名称

预览基于 URL 自动生成的站点名称。

```http
POST /api/preview-site-name
Content-Type: application/json

{
  "baseUrl": "https://api.deepseek.com/v1"
}
```

**响应示例**:
```json
{
  "siteName": "deepseek"
}
```

#### 1.2 处理 AI 站点配置

核心接口，由 `SiteConfigurationService` 统一处理，用于自动配置 AI 站点。**此接口智能地处理创建和更新两种场景**：

* **如果站点不存在**：它会执行完整的创建流程，包括选择最佳实例、获取模型、创建多层分组等。
* **如果站点已存在**：它会执行更新流程，例如添加新的 API 密钥，并通过已存在的渠道代理高效地刷新模型列表，而不会创建临时分组。

```http
POST /api/process-ai-site
Content-Type: application/json

{
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKeys": ["sk-xxx", "sk-yyy"],
  "channelTypes": ["openai"],
  "customValidationEndpoints": {
    "health": "/health"
  },
  "models": ["deepseek-chat", "deepseek-coder"],
  "targetChannelName": "deepseek-openai",
  "operationType": "update"
}
```

**请求参数**:
- `baseUrl` (必需): AI 站点的基础 URL
- `apiKeys` (可选): API 密钥数组，用于负载均衡
- `channelTypes` (可选): 支持的 API 格式类型，默认 `["openai"]`
- `customValidationEndpoints` (可选): 自定义验证端点
- `models` (可选): 手动指定模型列表
- `targetChannelName` (可选): 指定要更新的目标渠道名称
- `operationType` (可选): 操作类型，可选值：
  - `create` (默认): 创建新渠道
  - `update`: 更新现有渠道

#### 更新操作说明

当 `operationType` 设置为 `update` 并提供 `targetChannelName` 时，系统执行以下流程：

1. **添加新密钥**: 首先将新提供的 API 密钥添加到指定的现有渠道分组中
2. **刷新模型列表**: 通过该渠道的代理高效地获取最新的模型列表
3. **更新配置**: 同步更新相关的分组配置和模型映射

**执行特点**：
- 通过 `targetChannelName` 精确定位要更新的渠道分组
- 使用 gpt-load 实例的 token 进行认证，无需上游站点的 API 密钥
- 不会创建临时分组，直接通过现有渠道代理操作，提高更新效率
- 确保密钥先添加后使用，保证认证成功率

**支持的 channelTypes**:
- `openai`: OpenAI 兼容格式
- `anthropic`: Anthropic Claude 格式
- `gemini`: Google Gemini 格式

**响应示例**:
```json
{
  "success": true,
  "message": "成功配置AI站点 deepseek",
  "data": {
    "siteName": "deepseek",
    "baseUrl": "https://api.deepseek.com/v1",
    "channelTypes": ["openai"],
    "groupsCreated": 1,
    "modelsCount": 5,
    "models": ["deepseek-chat", "deepseek-coder"],
    "siteGroups": [
      {
        "name": "deepseek-openai",
        "id": "123",
        "upstreams": [{"url": "https://api.deepseek.com/v1", "weight": 1}],
        "_instance": {
          "id": "local",
          "name": "本地 gpt-load",
          "url": "http://localhost:3001",
          "priority": 1
        }
      }
    ],
    "modelGroups": 5,
    "usingManualModels": false,
    "selectedInstance": {
      "id": "local",
      "name": "本地 gpt-load",
      "url": "http://localhost:3001",
      "priority": 1,
      "healthStatus": "healthy"
    }
  }
}
```

#### 1.3 API 探测

测试 API 的可用性和兼容性。

```http
POST /api/probe-api
Content-Type: application/json

{
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "sk-xxx"
}
```

### 2. 状态监控接口

#### 2.1 健康检查

简单的健康检查端点。

```http
GET /api/health
```

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": "2024-12-20T10:30:00.000Z"
}
```

#### 2.2 服务状态

获取详细的服务状态信息。

```http
GET /api/status
```

**响应示例**:
```json
{
  "gptload": {
    "status": "connected",
    "instancesCount": 3,
    "healthyInstances": 2,
    "activeInstances": ["local", "us-proxy"]
  },
  "uniApi": {
    "status": "available",
    "configPath": "../uni-api/api.yaml"
  },
  "services": {
    "siteConfigurationService": "active",
    "instanceHealthManager": "monitoring",
    "instanceConfigManager": "loaded",
    "gptloadService": "connected"
  },
  "modelSync": {
    "status": "running",
    "lastSync": "2024-12-20T10:25:00.000Z",
    "nextSync": "2024-12-20T11:25:00.000Z"
  },
  "channelHealth": {
    "status": "monitoring",
    "totalChannels": 15,
    "healthyChannels": 12,
    "failedChannels": 3
  }
}
```

#### 2.3 多实例状态

查看所有 gpt-load 实例的状态。

```http
GET /api/multi-instances
```

**响应示例**:
```json
{
  "instances": [
    {
      "id": "local",
      "name": "本地 gpt-load",
      "url": "http://localhost:3001",
      "status": "healthy",
      "priority": 1,
      "supportedFormats": ["openai"],
      "lastHealthCheck": "2024-12-20T10:30:00.000Z",
      "siteGroups": ["deepseek", "openai"]
    },
    {
      "id": "us-proxy",
      "name": "美国代理 gpt-load",
      "url": "https://us.gpt-load.example.com",
      "status": "healthy",
      "priority": 2,
      "supportedFormats": ["anthropic"],
      "lastHealthCheck": "2024-12-20T10:29:45.000Z",
      "siteGroups": ["anthropic"]
    }
  ],
  "healthSummary": {
    "totalInstances": 2,
    "healthyInstances": 2,
    "failedInstances": 0
  }
}
```

### 3. 模型同步接口

#### 3.1 手动触发模型同步

```http
POST /api/sync-models
```

**响应示例**:
```json
{
  "success": true,
  "message": "模型同步任务已启动"
}
```

#### 3.2 模型同步控制

控制自动模型同步服务。

```http
POST /api/sync-models/control
Content-Type: application/json

{
  "action": "start" | "stop"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "模型同步服务已启动",
  "status": "running"
}
```

### 4. 渠道管理接口

#### 4.1 获取站点分组

获取所有已配置的站点分组（第一层分组，`sort=20`）。

```http
GET /api/channels/site-groups
```

**响应示例**:
```json
{
  "siteGroups": [
    {
      "id": 123,
      "name": "deepseek-openai",
      "sort": 20,
      "upstreams": [{"url": "https://api.deepseek.com/v1", "weight": 1}],
      "_instance": {
        "id": "local",
        "name": "本地 gpt-load"
      }
    }
  ]
}
```

#### 4.2 手动渠道健康检查

```http
POST /api/check-channels
```

#### 4.3 渠道健康检查控制

```http
POST /api/check-channels/control
Content-Type: application/json

{
  "action": "start" | "stop"
}
```

#### 4.4 获取失败的渠道

```http
GET /api/failed-channels
```

**响应示例**:
```json
{
  "failedChannels": [
    {
      "name": "deepseek-chat",
      "failures": 3,
      "lastFailure": "2024-12-20T10:25:00.000Z",
      "error": "Connection timeout"
    }
  ]
}
```

#### 4.5 重置渠道失败次数

```http
POST /api/reset-channel-failures
Content-Type: application/json

{
  "channelName": "deepseek-chat"
}
```

#### 4.6 删除渠道

彻底删除一个渠道及其所有相关配置。

```http
DELETE /api/channels/{channelName}
```

### 5. 渠道清理接口

#### 5.1 预览清理结果

```http
POST /api/cleanup-channels/preview
Content-Type: application/json

{
  "dryRun": true,
  "maxFailures": 5,
  "olderThanDays": 7
}
```

#### 5.2 执行渠道清理

```http
POST /api/cleanup-channels
Content-Type: application/json

{
  "maxFailures": 5,
  "olderThanDays": 7
}
```

#### 5.3 手动清理指定渠道

```http
POST /api/cleanup-channels/manual
Content-Type: application/json

{
  "channelNames": ["channel1", "channel2"],
  "dryRun": false
}
```

#### 5.4 获取清理历史

```http
GET /api/cleanup-history
```

### 6. 架构管理接口

#### 6.1 初始化三层架构

```http
POST /api/initialize-architecture
```

#### 6.2 获取架构状态

```http
GET /api/architecture-status
```

#### 6.3 手动恢复模型-渠道关系

```http
POST /api/manual-recovery/{model}/{channel}
```

#### 6.4 获取架构统计信息

```http
GET /api/architecture-stats
```

### 7. 实例管理接口

#### 7.1 检查所有实例健康状态

由 `InstanceHealthManager` 服务处理，并发检查所有配置的 gpt-load 实例。

```http
POST /api/check-instances
```

**响应示例**:
```json
{
  "success": true,
  "healthResults": {
    "local": {
      "status": "healthy",
      "responseTime": 25,
      "lastCheck": "2024-12-20T10:30:00.000Z"
    },
    "us-proxy": {
      "status": "unhealthy",
      "error": "Connection timeout",
      "lastCheck": "2024-12-20T10:30:00.000Z"
    }
  },
  "summary": {
    "total": 2,
    "healthy": 1,
    "unhealthy": 1
  }
}
```

#### 7.2 重新分配站点到实例

通过 `MultiGptloadManager` 重新分配站点分组到特定实例。

```http
POST /api/reassign-site
Content-Type: application/json

{
  "siteUrl": "https://api.deepseek.com",
  "instanceId": "us-proxy"
}
```

### 8. 维护接口

#### 8.1 删除所有模型分组

高危操作，用于维护和重置。

```http
POST /api/maintenance/delete-model-groups
```

### 9. 临时分组管理

#### 9.1 获取临时分组统计

```http
GET /api/temp-groups/stats
```

#### 9.2 清理所有临时分组

```http
POST /api/temp-groups/cleanup
```

#### 9.3 清理过期临时分组

```http
POST /api/temp-groups/cleanup-old
Content-Type: application/json

{
  "hoursOld": 24
}
```

## 错误响应格式

所有 API 在出错时都会返回统一的错误格式：

```json
{
  "error": "错误描述信息",
  "details": "详细错误信息（可选）",
  "code": "错误代码（可选）"
}
```

## HTTP 状态码

- `200`: 操作成功
- `400`: 请求参数错误
- `404`: 资源不存在
- `500`: 服务器内部错误

## 架构说明

### 服务化架构 (v2.1)

本版本的API接口基于重构后的服务化架构实现：

- **表现层** (`server.ts`): 处理HTTP路由，将请求委托给业务服务
- **业务逻辑层**: `SiteConfigurationService` 等服务编排具体的业务流程
- **基础服务层**: `GptloadService`, `ModelsService`, `YamlManager` 等提供原子化功能
- **依赖注入**: 通过 `service-factory.ts` 管理服务间的依赖关系

这种架构确保了API的高可维护性、可测试性和扩展性。

## 认证和授权

当前版本暂未实现认证机制，所有接口都是开放的。建议在生产环境中：

1. 配置反向代理进行访问控制
2. 使用 VPN 或内网隔离
3. 配置防火墙规则

## 使用示例

### 完整配置流程

```bash
# 1. 预览站点名称
curl -X POST http://localhost:3002/api/preview-site-name \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "https://api.deepseek.com/v1"}'

# 2. 配置 AI 站点
curl -X POST http://localhost:3002/api/process-ai-site \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKeys": ["sk-xxx"],
    "channelTypes": ["openai"]
  }'

# 3. 检查状态
curl http://localhost:3002/api/status
```

### 监控和维护

```bash
# 健康检查
curl http://localhost:3002/api/health

# 获取失败的渠道
curl http://localhost:3002/api/failed-channels

# 手动同步模型
curl -X POST http://localhost:3002/api/sync-models

# 预览渠道清理
curl -X POST http://localhost:3002/api/cleanup-channels/preview \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

## WebSocket 接口

目前暂未实现 WebSocket 接口，所有通信都基于 HTTP REST API。未来版本可能会添加实时状态推送功能。
