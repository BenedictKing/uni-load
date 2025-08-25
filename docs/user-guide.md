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

```bash
# 获取临时分组统计
curl http://localhost:3002/api/temp-groups/stats

# 清理所有临时分组
curl -X POST http://localhost:3002/api/temp-groups/cleanup

# 清理24小时前创建的临时分组
curl -X POST http://localhost:3002/api/temp-groups/cleanup-old \
  -H "Content-Type: application/json" \
  -d '{"hoursOld": 24}'
```

#### 3. 维护操作

**功能**: 重置系统状态

```bash
# 删除所有二三层分组（保留站点分组）
curl -X POST http://localhost:3002/api/maintenance/delete-model-groups
```

⚠️ **警告**: 此操作会删除所有模型分组配置，请谨慎使用。

## 故障排查

### 常见问题及解决方案

#### 1. 站点配置失败

**症状**: API 返回错误，无法创建站点分组

**排查步骤**:

1. **验证 API 密钥**
   ```bash
   curl -X POST http://localhost:3002/api/probe-api \
     -H "Content-Type: application/json" \
     -d '{"baseUrl": "https://api.example.com/v1", "apiKey": "sk-xxx"}'
   ```

2. **检查网络连接**
   - 确认能够访问目标 API 站点
   - 检查防火墙和代理设置

3. **查看系统状态**
   ```bash
   curl http://localhost:3002/api/status
   ```

4. **检查 gpt-load 实例**
   ```bash
   curl http://localhost:3002/api/multi-instances
   ```

#### 2. 模型获取失败

**症状**: 系统提示"无法获取模型列表"

**可能原因**:
- API 密钥无效或过期
- API 站点不支持 `/v1/models` 接口
- 网络连接问题
- gpt-load 实例不可达

**解决方案**:
1. 验证 API 密钥有效性
2. 尝试手动指定模型列表
3. 检查网络连接
4. 切换到其他 gpt-load 实例

#### 3. 配置更新失败

**症状**: gpt-load 分组创建成功，但 uni-api 配置未更新

**排查步骤**:
1. 检查 uni-api 目录权限
2. 验证 YAML 文件格式
3. 查看错误日志

**解决方案**:
```bash
# 检查 uni-api 路径配置
echo $UNI_API_PATH

# 手动验证配置文件
ls -la ../uni-api/api.yaml

# 查看服务状态
curl http://localhost:3002/api/status
```

#### 4. 渠道健康检查异常

**症状**: 大量渠道被标记为失败

**排查步骤**:
1. 检查网络连接稳定性
2. 验证 API 密钥状态
3. 查看失败渠道列表
4. 分析错误模式

**操作**:
```bash
# 查看失败渠道
curl http://localhost:3002/api/failed-channels

# 手动触发健康检查
curl -X POST http://localhost:3002/api/check-channels

# 重置特定渠道的失败计数
curl -X POST http://localhost:3002/api/reset-channel-failures \
  -H "Content-Type: application/json" \
  -d '{"channelName": "problematic-channel"}'
```

### 日志分析

系统日志位于 `logs/` 目录下：

- **combined.log**: 综合日志，包含所有操作记录
- **error.log**: 错误日志，专门记录异常和错误
- **channel-operations.log**: 渠道操作日志

**查看实时日志**:
```bash
# 查看综合日志
tail -f logs/combined.log

# 查看错误日志
tail -f logs/error.log

# 搜索特定错误
grep "ERROR" logs/combined.log

# 查看渠道操作
tail -100 logs/channel-operations.log
```

### 系统重置

如果系统出现严重问题，可以执行完全重置：

1. **停止服务**
2. **清理所有分组**
   ```bash
   curl -X POST http://localhost:3002/api/maintenance/delete-model-groups
   ```
3. **清理临时分组**
   ```bash
   curl -X POST http://localhost:3002/api/temp-groups/cleanup
   ```
4. **重新初始化架构**
   ```bash
   curl -X POST http://localhost:3002/api/initialize-architecture
   ```
5. **重新配置所需站点**

## 高级技巧

### 1. 批量站点配置

通过脚本批量配置多个站点：

```bash
#!/bin/bash
sites=(
  "https://api.deepseek.com/v1|sk-deepseek-key"
  "https://api.openai.com/v1|sk-openai-key"
  "https://api.anthropic.com/v1|sk-claude-key"
)

for site in "${sites[@]}"; do
  IFS='|' read -r baseUrl apiKey <<< "$site"
  
  curl -X POST http://localhost:3002/api/process-ai-site \
    -H "Content-Type: application/json" \
    -d "{
      \"baseUrl\": \"$baseUrl\",
      \"apiKeys\": [\"$apiKey\"],
      \"channelTypes\": [\"openai\"]
    }"
  
  echo "配置站点: $baseUrl"
  sleep 2
done
```

### 2. 监控脚本

创建监控脚本定期检查系统状态：

```bash
#!/bin/bash
# monitor.sh

API_BASE="http://localhost:3002"

echo "=== uni-load 系统状态监控 ==="
echo "时间: $(date)"
echo

# 健康检查
echo "1. 系统健康状态:"
curl -s "$API_BASE/api/health" | jq .
echo

# 系统状态
echo "2. 详细系统状态:"
curl -s "$API_BASE/api/status" | jq .
echo

# 失败渠道
echo "3. 失败渠道列表:"
curl -s "$API_BASE/api/failed-channels" | jq .
echo

# 实例状态
echo "4. gpt-load 实例状态:"
curl -s "$API_BASE/api/multi-instances" | jq .
```

### 3. 自动恢复脚本

创建自动恢复脚本处理常见问题：

```bash
#!/bin/bash
# auto-recovery.sh

API_BASE="http://localhost:3002"

# 获取失败渠道数量
failed_count=$(curl -s "$API_BASE/api/failed-channels" | jq '.failedChannels | length')

if [ "$failed_count" -gt 5 ]; then
  echo "检测到大量失败渠道($failed_count)，执行自动恢复..."
  
  # 重置所有渠道失败计数
  curl -X POST "$API_BASE/api/reset-channel-failures" \
    -H "Content-Type: application/json" \
    -d '{}'
  
  # 手动触发健康检查
  curl -X POST "$API_BASE/api/check-channels"
  
  echo "自动恢复完成"
fi
```

## 总结

uni-load 提供了完整的 Web 界面和 API 接口，支持 AI 站点的自动配置、监控和维护。通过本手册，用户可以：

1. 使用 Web 界面快速配置 AI 站点
2. 利用 API 接口进行自动化操作
3. 监控系统状态和渠道健康
4. 执行维护和故障排查操作
5. 实现批量操作和自动化脚本

在使用过程中，建议定期检查系统状态，及时处理失败渠道，保持配置的一致性和系统的稳定性。