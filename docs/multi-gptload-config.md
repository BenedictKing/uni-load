# gptload 多实例配置说明

uni-load 支持连接多个 gptload 实例，包括本地和远程实例，自动为不同的站点选择最佳实例进行访问。

## 配置方法

### 创建 gptload-instances.json 配置文件

1. 复制示例配置文件：
   ```bash
   cp gptload-instances.json.example gptload-instances.json
   ```

2. 编辑配置文件，包含本地和远程实例：
   ```json
   [
     {
       "id": "local",
       "name": "本地 gptload",
       "url": "http://localhost:3001",
       "token": "",
       "priority": 1,
       "description": "本地 gptload 服务，优先使用"
     },
     {
       "id": "us-proxy",
       "name": "美国代理 gptload",
       "url": "https://us.gptload.example.com",
       "token": "your-token-here",
       "priority": 2,
       "description": "美国服务器，用于访问被墙的站点"
     }
   ]
   ```

3. **配置文件优先级**：
   - `gptload-instances.local.json` (本地配置，优先级最高)
   - `gptload-instances.json` (生产配置)
   - 通过环境变量 `GPTLOAD_INSTANCES_FILE` 指定的自定义路径

> **重要**：必须创建配置文件才能启动服务，不再提供默认后备配置。

## 配置参数说明

- `id`: 实例唯一标识符
- `name`: 实例显示名称  
- `url`: gptload 实例地址
- `token`: 认证令牌（可选）
- `priority`: 优先级（数字越小优先级越高，推荐：本地=1，远程=2,3,4...）
- `description`: 实例描述（说明用途和地理位置）

## 实际使用场景

### 典型配置示例

```json
[
  {
    "id": "local",
    "name": "本地 gptload", 
    "url": "http://localhost:3001",
    "priority": 1,
    "description": "本地服务，优先使用，处理可直接访问的站点"
  },
  {
    "id": "us-proxy",
    "name": "美国代理 gptload",
    "url": "https://us.gptload.example.com", 
    "priority": 2,
    "description": "美国服务器，用于访问被墙的 OpenAI、Anthropic 等站点"
  },
  {
    "id": "backup",
    "name": "备用 gptload",
    "url": "https://backup.gptload.example.com",
    "priority": 5, 
    "description": "备用服务器，当主要服务不可用时使用"
  }
]
```

## 自动分配策略

uni-load 会根据以下策略自动为站点选择最佳 gptload 实例：

1. **健康检查**：只考虑健康的实例
2. **优先级排序**：按 priority 值排序（数字越小优先级越高）
3. **连通性测试**：测试实例是否能访问目标站点
4. **智能分配**：为站点分配第一个可用的实例
5. **故障转移**：如果分配的实例失效，自动重新分配

## API 接口

- `GET /api/multi-instances` - 查看所有实例状态
- `POST /api/reassign-site` - 手动重新分配站点到实例