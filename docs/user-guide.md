# uni-load 用户操作手册

## 概述

uni-load v2.1 是一个基于服务化架构的 AI 站点管理工具，用于自动配置 AI 站点到 gpt-load 和 uni-api 系统。v2.1 版本经过全面重构，采用依赖注入模式，提供更高的可维护性和稳定性。本手册详细介绍如何使用 Web 界面和 API 接口完成各种操作。

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
   - 等待系统通过 `SiteConfigurationService` 自动完成配置流程

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

### 监控与维护面板

主界面下方包含多个用于系统监控和维护的管理面板。

#### 1. 模型同步服务

- **功能**: 管理模型的自动同步任务，确保 gpt-load 和 uni-api 中的模型列表保持最新。
- **操作**:
    - **手动同步**: 立即触发一次所有站点的模型同步。
    - **控制服务**: 启动或停止定期的自动同步服务。
    - **刷新状态**: 获取模型同步服务的最新状态。
    - **清理并重置**: (高危操作) 删除所有由本工具自动生成的模型分组（第二、三层分组），并清理 uni-api 中对应的配置。此功能用于彻底重置系统。
    - **模型同步**: "清理并重置"功能现在可以**成功删除** `gpt-load` 中的模型分组，确保系统状态的一致性。

#### 2. 临时分组清理

- **功能**: 清理 gpt-load 中由本工具在获取模型时创建的临时测试分组 (`temp-test-*` 和 `debug-models-*`)。
- **操作**:
    - **刷新统计**: 获取当前所有 gpt-load 实例中的临时分组数量和列表。
    - **清理所有临时分组**: 立即删除所有临时分组。
    - **清理24小时前的分组**: 删除创建时间超过24小时的旧临时分组。

#### 3. 渠道健康监控

- **功能**: 监控已配置的站点渠道（第一层分组）的健康状况，并管理其生命周期。
- **已配置的渠道分组列表**:
    - 此区域会列出所有已成功配置的站点渠道。
    - **更新**: 允许为现有渠道添加新的 API 密钥，并刷新其模型列表。此过程不会创建临时分组，非常高效。
    - **删除**: (高危操作) 彻底删除一个渠道，包括其站点分组以及所有模型分组中对此渠道的引用。
- **操作**:
    - **健康检查**: 立即触发一次所有渠道的健康检查。
    - **控制服务**: 启动或停止定期的自动健康监控服务。
    - **查看失败渠道**: 显示当前记录的失败渠道列表，并提供重置失败计数的选项。
    - **刷新状态**: 获取健康监控服务的最新状态和渠道列表。

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

1. **🔍 获取模型列表** - `ModelsService` 从 AI 站点获取支持的模型
2. **🏗️ 创建站点分组** - `GptloadService` 通过 `MultiGptloadManager` 在最优实例上创建站点分组
3. **⚖️ 配置负载均衡** - `GptloadService` 创建第二层模型分组
4. **📝 更新 uni-api** - `YamlManager` 自动更新配置文件
5. **✅ 配置完成** - `SiteConfigurationService` 显示配置结果和统计信息

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
        "id": "123",
        "upstreams": [{"url": "https://api.deepseek.com/v1", "weight": 1}],
        "_instance": {
          "id": "local",
          "name": "本地 gpt-load"
        }
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

**目标**: 为已配置的站点添加新的 API 密钥或刷新其模型列表。

**步骤**:
1. 在 Web 界面中找到对应的渠道分组，点击"更新"按钮，或直接通过 API 使用相同的 `baseUrl` 提交请求。
2. 提供新的 API 密钥（如果需要添加）。如果只想刷新模型列表，可以不提供密钥。
3. 系统现在通过前端的"更新"按钮可以精确地更新指定渠道，系统会通过 `gpt-load` 实例的 **token** 高效地刷新模型列表，而不是使用站点自身的 API 密钥。
4. 系统会自动识别为更新操作，**直接通过该渠道的代理刷新模型列表**，并合并新的 API 密钥。此过程非常高效，不会创建临时分组。

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

**模型兼容性说明**: 系统会根据模型名称智能地将其分配给兼容的渠道分组：

- **OpenAI 格式 (`openai`)**: 作为通用格式，所有模型（包括 `claude-` 和 `gemini-`）都可以通过此格式的渠道分组进行访问。
- **Anthropic 格式 (`anthropic`)**: 仅限 `claude-` 系列模型使用。
- **Gemini 格式 (`gemini`)**: 仅限 `gemini-` 系列模型使用。

例如，`claude-3-opus` 模型会被同时分配到 `example-anthropic` 和 `example-openai` 两个上游，而 `gpt-4` 模型只会被分配到 `example-openai`。

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

### 场景 6: 多实例环境操作 (v2.1 架构)

**目标**: 基于 `InstanceHealthManager` 和 `MultiGptloadManager` 服务，在多实例 gpt-load 环境中进行智能分配和健康检查

**查看多实例状态**:
```bash
curl http://localhost:3002/api/multi-instances
```

**检查所有实例健康状态** (由 `InstanceHealthManager` 处理):
```bash
curl -X POST http://localhost:3002/api/check-instances
```

**重新分配站点到指定实例** (由 `MultiGptloadManager` 处理):
```bash
curl -X POST http://localhost:3002/api/reassign-site \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://api.deepseek.com",
    "instanceId": "us-proxy"
  }'
```

注意：系统会通过 `InstanceHealthManager` 验证目标实例的健康状态，确保只将站点分配给健康的实例。

### 场景 7: 架构管理操作

**目标**: 管理和优化三层架构

**初始化架构**:
```bash
curl -X POST http://localhost:3002/api/initialize-architecture
```

**获取架构详细统计**:
```bash
curl http://localhost:3002/api/architecture-stats
```

**手动恢复特定模型-渠道关系**:
```bash
curl -X POST http://localhost:3002/api/manual-recovery/gpt-4/openai-proxy
```

### 场景 8: 渠道管理操作

**目标**: 查看和管理站点分组（第一层）和模型分组。

**查看所有站点分组**:
```bash
curl http://localhost:3002/api/channels/site-groups
```

返回示例:
```json
{
  "siteGroups": [
    {
      "id": 123,
      "name": "deepseek-openai",
      "sort": 20,
      "upstreams": [{"url": "https://api.deepseek.com/v1", "weight": 1}],
      "_instance": {"id": "local", "name": "本地 gpt-load"}
    }
  ]
}
```

**完全删除指定渠道** (高危操作):
```bash
# 删除整个站点配置（包括站点分组和相关模型分组）
curl -X DELETE http://localhost:3002/api/channels/deepseek-openai
```

注意：此操作会删除整个站点的所有配置，包括站点分组和相关的模型分组，请谨慎使用。

### 场景 9: 渠道清理管理

**目标**: 管理无效渠道的清理和维护。

**手动清理指定渠道** (精确控制):
```bash
# 预览清理指定渠道
curl -X POST http://localhost:3002/api/cleanup-channels/manual \
  -H "Content-Type: application/json" \
  -d '{
    "channelNames": ["bad-channel-1", "bad-channel-2"],
    "dryRun": true
  }'

# 实际清理指定渠道
curl -X POST http://localhost:3002/api/cleanup-channels/manual \
  -H "Content-Type: application/json" \
  -d '{
    "channelNames": ["bad-channel-1", "bad-channel-2"],
    "dryRun": false
  }'
```

**查看清理历史**:
```bash
curl http://localhost:3002/api/cleanup-history
```

返回示例:
```json
{
  "history": [
    {
      "timestamp": "2024-12-20T10:30:00.000Z",
      "type": "automatic",
      "cleanedChannels": 3,
      "failedChannels": 0,
      "duration": "2.5s"
    }
  ]
}
```

## 监控和维护 (v2.1 服务化架构)

### 自动化服务监控

v2.1 版本基于新的服务化架构，系统包含多个自动化后台服务，每个服务都有单一的职责：

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

**功能**: 监控各个渠道的健康状态，自动标记并处理持续失败的渠道。
**默认间隔**: 30分钟

**故障处理机制**:
- **健康验证**: 系统会定期调用 `gpt-load` 的验证接口来检查渠道的连通性。如果一个验证任务已经在运行中（例如，由用户手动触发），系统会智能地**跳过本次自动检查**，以避免冲突和不必要的负载，并在下一个检查周期重新评估。
- **失败阈值**: 当一个渠道的连续失败次数达到阈值（默认为3次），系统现在会**真正地执行**清理操作，包括禁用密钥或从模型分组中移除上游。
- **上游移除**: 系统会尝试从所有模型分组中移除该故障渠道作为上游。
- **智能"软禁用"**: 如果某个模型分组只依赖此故障渠道（即它是唯一的上游），直接移除会导致该模型不可用。在这种情况下，系统不会移除上游配置，而是会 **禁用** 该模型分组在 gpt-load 中的所有 API 密钥。这种"软禁用"方式可以在不更改 `uni-api` 配置的情况下使模型失效，避免了服务中断和重启的需要。当渠道恢复健康后，相关密钥也会被自动重新激活。

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

uni-load v2.1 基于重构后的服务化架构，提供了更加稳定、可维护的 Web 界面和 API 接口，支持 AI 站点的自动配置、监控和维护。通过本手册，用户可以：

1. 使用 Web 界面快速配置 AI 站点（基于 `SiteConfigurationService`）
2. 利用 API 接口进行自动化操作（通过依赖注入的服务）
3. 监控系统状态和渠道健康（由 `InstanceHealthManager` 等专业服务处理）
4. 执行维护和清理操作（多个专用服务协作）
5. 实现批量操作和自动化脚本（高可维护性的服务化架构支持）

### v2.1 新特性

- **服务化架构**: 采用单一职责原则，每个服务专注于一个特定的业务领域
- **依赖注入**: 通过 `service-factory.ts` 统一管理服务间的依赖关系
- **更好的测试能力**: 服务可以独立测试，提高代码质量
- **增强的稳定性**: 更好的错误处理和故障隔离

## 故障排查

当系统出现问题时，请按以下步骤进行排查：

### 1. 基础状态检查

**第一步：检查服务健康状态**
```bash
curl http://localhost:3002/api/health
```
预期返回: `{"status": "ok", "timestamp": "..."}`

**第二步：检查系统状态**
```bash
curl http://localhost:3002/api/status
```

关键指标：
- `gptload.status`: 应为 `"connected"`
- `uniApi.status`: 应为 `"available"`
- `modelSync.status`: 应为 `"running"` 或 `"stopped"`
- `channelHealth.status`: 应为 `"monitoring"`

### 2. 实例和连接检查

**检查多实例状态**
```bash
curl http://localhost:3002/api/multi-instances
```

确认所有实例都处于 `healthy` 状态。如果有实例显示 `unhealthy`，进行手动健康检查：

```bash
curl -X POST http://localhost:3002/api/check-instances
```

### 3. 渠道健康检查

**查看失败的渠道**
```bash
curl http://localhost:3002/api/failed-channels
```

如果有失败的渠道，可以：
1. 重置失败计数: `POST /api/reset-channel-failures`
2. 手动触发健康检查: `POST /api/check-channels`

### 4. API探测验证

**验证目标站点的可用性**
```bash
curl -X POST http://localhost:3002/api/probe-api \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://api.example.com/v1",
    "apiKey": "sk-your-key"
  }'
```

这个接口会测试：
- API地址的可访问性
- API密钥的有效性
- API格式兼容性

### 5. 架构状态检查

**检查三层架构状态**
```bash
curl http://localhost:3002/api/architecture-status
```

**获取详细架构统计**
```bash
curl http://localhost:3002/api/architecture-stats
```

如果架构状态异常，可以尝试重新初始化：
```bash
curl -X POST http://localhost:3002/api/initialize-architecture
```

### 6. 常见问题及解决方案

#### 问题 1: “参数不完整：需要 baseUrl”
- **原因**: API请求中缺少 `baseUrl` 参数
- **解决**: 确保请求体包含有效的 `baseUrl` 字段

#### 问题 2: “无法获取模型列表”
- **原因**: API密钥无效或网络连接问题
- **排查**: 
  1. 使用 `POST /api/probe-api` 验证 API 密钥
  2. 检查网络连接和防火墙设置
  3. 考虑使用手动模型列表（`"models": ["model1", "model2"]`）

#### 问题 3: “gpt-load 实例不健康”
- **排查**: 
  1. 检查 gpt-load 服务是否正常运行
  2. 验证 `GPTLOAD_URL` 环境变量设置
  3. 检查网络连通性

#### 问题 4: “uni-api 配置文件不存在”
- **排查**:
  1. 检查 `UNI_API_PATH` 环境变量设置
  2. 确保 uni-api 项目路径正确
  3. 检查文件权限

#### 问题 5: “白名单过滤后没有可用模型”
- **解决**: 
  1. 检查 `MODEL_WHITELIST` 配置
  2. 调整白名单设置或使用手动模型列表

### 7. 日志分析

**查看实时日志**
- 在控制台查看 uni-load 输出
- 关注错误信息和警告
- 关注各服务的启动和运行状态

**常见日志关键词**
- `✅` - 成功操作
- `⚠️` - 警告信息
- `❌` - 错误信息
- `🔄` - 同步操作
- `🌡️` - 健康检查

### 8. 紧急恢复操作

**如果系统出现严重问题**，可以执行以下恢复操作：

1. **重启所有服务**:
```bash
# 停止所有后台服务
curl -X POST http://localhost:3002/api/sync-models/control \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}'

curl -X POST http://localhost:3002/api/check-channels/control \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}'

# 重新启动
curl -X POST http://localhost:3002/api/sync-models/control \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'

curl -X POST http://localhost:3002/api/check-channels/control \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'
```

2. **重新初始化架构**:
```bash
curl -X POST http://localhost:3002/api/initialize-architecture
```

3. **清理无效渠道**:
```bash
# 预览清理
curl -X POST http://localhost:3002/api/cleanup-channels/preview \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# 执行清理
curl -X POST http://localhost:3002/api/cleanup-channels \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
```
