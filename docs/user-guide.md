# uni-load 用户操作手册

## 概述

uni-load 是一个用于自动配置 AI 站点到 gpt-load 和 uni-api 系统的工具。本手册详细介绍如何使用 Web 界面和 API 接口完成各种操作。

## 目录

1. [Web 界面使用](#web-界面使用)
2. [API 接口使用](#api-接口使用)
3. [常见操作场景](#常见操作场景)
4. [监控和维护](#监控和维护)
5. [故障排查](#故障排查)

## Web 界面使用

### 访问地址

启动服务后，通过浏览器访问：
```
http://localhost:3002
```

### 主界面功能

#### 1. 添加 AI 站点

**操作步骤**:

1. **填写基础信息**
   - **API 基础地址**: 输入 AI 站点的完整 API 地址
     ```
     示例：https://api.deepseek.com/v1
     ```
   - **API 密钥**: 输入一个或多个密钥，用于负载均衡
     ```
     sk-your-api-key-here
     ```

2. **选择API格式**
   - `OpenAI`: 兼容 OpenAI API 格式的服务
   - `Anthropic`: Claude API 格式
   - `Gemini`: Google Gemini API 格式

3. **高级设置** (可选)
   - **自定义验证端点**: 特殊的健康检查端点
   - **手动指定模型**: 跳过自动发现，手动指定支持的模型

4. **提交配置**
   - 点击"🔧 开始配置"按钮
   - 等待系统自动完成配置流程

#### 2. 站点名称预览

在提交前，可以预览系统生成的站点名称：

**生成规则**:
- 从 URL 自动提取主域名
- 移除常见前缀 (www., api., openai., claude.)
- 转换为小写并标准化格式
- 确保唯一性和兼容性

**示例**:
```
https://api.deepseek.com/v1 → deepseek
https://claude.ai/v1 → claude
https://api.openai.com/v1 → openai
```

### Web 界面元素详解

#### 表单字段说明

| 字段 | 必需 | 说明 | 示例 |
|------|------|------|------|
| API 基础地址 | 是 | AI 服务的 API 端点 | `https://api.example.com/v1` |
| API 密钥 | 否* | 认证密钥，支持多个 | `sk-xxx`, `sk-yyy` |
| API 格式类型 | 是 | 选择兼容的 API 格式 | `openai`, `anthropic` |
| 自定义验证端点 | 否 | 特殊的健康检查路径 | `{"health": "/status"}` |
| 手动指定模型 | 否 | 跳过自动发现的模型列表 | `gpt-4`, `claude-3` |

*注：对于已存在的站点，可以不提供新密钥，系统会使用现有密钥。

#### 操作流程指示器

Web 界面会显示配置进度：

1. **🔍 获取模型列表** - 从 AI 站点获取支持的模型
2. **🏗️ 创建站点分组** - 在 gpt-load 中创建第一层分组
3. **⚖️ 配置负载均衡** - 创建第二层模型分组
4. **📝 更新 uni-api** - 自动更新配置文件
5. **✅ 配置完成** - 显示配置结果和统计信息

## API 接口使用

### 基础配置

**Base URL**: `http://localhost:3002`
**Content-Type**: `application/json`

### 核心接口

#### 1. 配置 AI 站点

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
  "models": ["deepseek-chat", "deepseek-coder"]
}
```

**参数说明**:
- `baseUrl` (必需): AI 站点的基础 URL
- `apiKeys` (可选): API 密钥数组，用于负载均衡
- `channelTypes` (可选): 支持的 API 格式类型，默认 `["openai"]`
- `customValidationEndpoints` (可选): 自定义验证端点
- `models` (可选): 手动指定模型列表，跳过自动发现

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
        "type": "openai",
        "upstreams": ["https://api.deepseek.com/v1"]
      }
    ],
    "modelGroups": 5,
    "successfulInstance": {
      "id": "local",
      "name": "本地 gpt-load"
    }
  }
}
```

#### 2. 预览站点名称

```http
POST /api/preview-site-name
Content-Type: application/json

{
  "baseUrl": "https://api.deepseek.com/v1"
}
```

**响应**:
```json
{
  "siteName": "deepseek"
}
```

#### 3. API 探测

测试 API 的可用性和格式兼容性：

```http
POST /api/probe-api
Content-Type: application/json

{
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "sk-xxx"
}
```

### 监控接口

#### 1. 健康检查

```http
GET /api/health
```

**响应**:
```json
{
  "status": "ok",
  "timestamp": "2024-12-20T10:30:00.000Z"
}
```

#### 2. 系统状态

```http
GET /api/status
```

**响应**:
```json
{
  "gptload": {
    "status": "connected",
    "instancesCount": 3,
    "activeInstance": "local"
  },
  "uniApi": {
    "status": "available",
    "configPath": "../uni-api/api.yaml"
  },
  "modelSync": {
    "isRunning": true,
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

#### 3. 多实例状态

```http
GET /api/multi-instances
```

**响应**:
```json
{
  "instances": [
    {
      "id": "local",
      "name": "本地 gpt-load",
      "url": "http://localhost:3001",
      "status": "healthy",
      "priority": 1,
      "sites": ["deepseek", "openai"]
    }
  ]
}
```

## 常见操作场景

### 场景 1: 添加新的 AI 站点

**目标**: 将 DeepSeek API 集成到系统中

**步骤**:
1. 获取 DeepSeek API 密钥
2. 使用 Web 界面或 API 提交配置
3. 验证配置结果
4. 测试模型可用性

**Web 界面操作**:
```
1. 访问 http://localhost:3002
2. 填写表单：
   - API 基础地址: https://api.deepseek.com/v1
   - API 密钥: sk-your-deepseek-key
   - API 格式类型: 选择 "OpenAI"
3. 点击 "🔧 开始配置"
4. 等待配置完成
```

**API 操作**:
```bash
curl -X POST http://localhost:3002/api/process-ai-site \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKeys": ["sk-your-deepseek-key"],
    "channelTypes": ["openai"]
  }'
```

### 场景 2: 更新现有站点的 API 密钥

**目标**: 为已配置的站点添加新的 API 密钥

**步骤**:
1. 使用相同的 baseUrl 和站点配置
2. 提供新的 API 密钥
3. 系统会自动合并到现有配置

**操作**:
```bash
curl -X POST http://localhost:3002/api/process-ai-site \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKeys": ["sk-new-key-1", "sk-new-key-2"],
    "channelTypes": ["openai"]
  }'
```

### 场景 3: 配置多格式支持的站点

**目标**: 为同一站点配置多种 API 格式支持

**操作**:
```bash
curl -X POST http://localhost:3002/api/process-ai-site \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://api.example.com/v1",
    "apiKeys": ["sk-example-key"],
    "channelTypes": ["openai", "anthropic"]
  }'
```

**结果**: 系统会创建两个站点分组：
- `example-openai`: OpenAI 格式接入
- `example-anthropic`: Anthropic 格式接入

### 场景 4: 手动指定模型列表

**目标**: 跳过自动发现，手动指定支持的模型

**使用场景**:
- API 站点不支持 `/v1/models` 接口
- 只想使用特定的模型子集
- API 返回的模型列表不准确

**操作**:
```bash
curl -X POST http://localhost:3002/api/process-ai-site \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://api.example.com/v1",
    "apiKeys": ["sk-example-key"],
    "channelTypes": ["openai"],
    "models": ["custom-model-1", "custom-model-2"]
  }'
```

### 场景 5: 删除站点配置

**目标**: 完全移除某个站点的配置

**步骤**:
1. 删除站点分组（第一层）
2. 系统自动清理相关的模型分组
3. 更新 uni-api 配置

**操作**:
```bash
curl -X DELETE http://localhost:3002/api/channels/deepseek-openai
```

## 监控和维护

### 自动化服务监控

系统包含多个自动化后台服务：

#### 1. 模型同步服务

**功能**: 定期同步模型配置，确保一致性
**默认间隔**: 60秒

**控制接口**:
```bash
# 手动触发同步
curl -X POST http://localhost:3002/api/sync-models

# 启动自动同步
curl -X POST http://localhost:3002/api/sync-models/control \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'

# 停止自动同步
curl -X POST http://localhost:3002/api/sync-models/control \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}'
```

#### 2. 渠道健康监控

**功能**: 监控各个渠道的健康状态，自动标记失败渠道
**默认间隔**: 30秒

**控制接口**:
```bash
# 手动触发健康检查
curl -X POST http://localhost:3002/api/check-channels

# 获取失败的渠道
curl http://localhost:3002/api/failed-channels

# 重置渠道失败计数
curl -X POST http://localhost:3002/api/reset-channel-failures \
  -H "Content-Type: application/json" \
  -d '{"channelName": "deepseek-openai"}'
```

#### 3. 三层架构管理器

**功能**: 维护三层分组架构，自动恢复和优化
**运行模式**: 被动触发

**控制接口**:
```bash
# 初始化架构
curl -X POST http://localhost:3002/api/initialize-architecture

# 获取架构状态
curl http://localhost:3002/api/architecture-status

# 获取详细统计
curl http://localhost:3002/api/architecture-stats

# 手动恢复特定模型-渠道关系
curl -X POST http://localhost:3002/api/manual-recovery/gpt-4/openai-proxy
```

### 清理和维护操作

#### 1. 渠道清理

**功能**: 清理无效的渠道配置

```bash
# 预览清理结果（不实际执行）
curl -X POST http://localhost:3002/api/cleanup-channels/preview \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# 执行自动清理
curl -X POST http://localhost:3002/api/cleanup-channels \
  -H "Content-Type: application/json" \
  -d '{"maxFailures": 5, "olderThanDays": 7}'

# 手动清理指定渠道
curl -X POST http://localhost:3002/api/cleanup-channels/manual \
  -H "Content-Type: application/json" \
  -d '{"channelNames": ["bad-channel-1", "bad-channel-2"], "dryRun": false}'
```

#### 2. 临时分组清理

**功能**: 清理 gpt-load 中的临时分组

临时分组是系统在调试和测试过程中创建的分组，包括：
- `temp-test-*` 前缀的测试分组
- `debug-models-*` 前缀的调试分组

这些分组会占用系统资源，建议定期清理。

**获取临时分组统计**:
```bash
curl http://localhost:3002/api/temp-groups/stats
```

响应格式：
```json
{
  "success": true,
  "message": "临时分组统计完成",
  "data": {
    "totalTempGroups": 5,
    "instanceStats": [
      {
        "instanceName": "本地 gpt-load",
        "tempGroups": [
          {
            "id": 123,
            "name": "temp-test-deepseek",
            "created_at": "2024-01-15T10:30:00Z"
          }
        ]
      }
    ]
  }
}
```

**清理所有临时分组**:
```bash
curl -X POST http://localhost:3002/api/temp-groups/cleanup
```

**清理指定时间之前的临时分组**:
```bash
# 清理24小时前创建的临时分组（默认）
curl -X POST http://localhost:3002/api/temp-groups/cleanup-old \
  -H "Content-Type: application/json" \
  -d '{"hoursOld": 24}'

# 清理72小时前创建的临时分组
curl -X POST http://localhost:3002/api/temp-groups/cleanup-old \
  -H "Content-Type: application/json" \
  -d '{"hoursOld": 72}'
```

**清理响应格式**:
```json
{
  "success": true,
  "message": "临时分组清理完成，共清理 3 个分组",
  "data": {
    "totalCleaned": 3,
    "instanceResults": [
      {
        "instanceName": "本地 gpt-load",
        "cleaned": 2,
        "errors": []
      },
      {
        "instanceName": "美国代理 gpt-load",
        "cleaned": 1,
        "errors": ["删除分组 debug-models-test 失败: 权限不足"]
      }
    ]
  }
}
```

**使用建议**:
1. **定期统计**: 每周查看一次临时分组统计
2. **按时清理**: 使用 `cleanup-old` 定期清理过期分组
3. **全量清理**: 在系统维护时使用 `cleanup` 清理所有临时分组
4. **监控错误**: 关注清理响应中的 `errors` 字段，及时处理权限或网络问题

#### 3. 维护操作

**功能**: 重置系统状态

```bash
# 删除所有二三层分组（保留站点分组）
curl -X POST http://localhost:3002/api/maintenance/delete-model-groups
```

⚠️ **警告**: 此操作会删除所有模型分组配置，请谨慎使用。

## 总结

uni-load 提供了完整的 Web 界面和 API 接口，支持 AI 站点的自动配置、监控和维护。通过本手册，用户可以：

1. 使用 Web 界面快速配置 AI 站点
2. 利用 API 接口进行自动化操作
3. 监控系统状态和渠道健康
4. 执行维护和清理操作
5. 实现批量操作和自动化脚本

详细的故障排查指南请参考 [部署指南](deployment.md#故障排除)，性能优化请参考 [性能优化指南](performance-optimization.md)。