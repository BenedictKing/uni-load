# gpt-load 多实例配置说明

uni-load 支持连接多个 gpt-load 实例，包括本地和远程实例，自动为不同的站点选择最佳实例进行访问。

## 配置方法

### 创建 gpt-load-instances.json 配置文件

1. 复制示例配置文件：

   ```bash
   cp gptload-instances.json.example gptload-instances.json
   ```

2. 编辑配置文件，包含本地和远程实例：

   ```json
   [
     {
       "id": "local",
       "name": "本地 gpt-load",
       "url": "http://localhost:3001",
       "token": "",
       "priority": 1,
       "description": "本地 gpt-load 服务，优先使用"
     },
     {
       "id": "us-proxy",
       "name": "美国代理 gpt-load",
       "url": "https://us.gpt-load.example.com",
       "token": "your-token-here",
       "priority": 2,
       "description": "用于本地不易访问的站点"
     }
   ]
   ```

3. **配置文件优先级**：
   - `gptload-instances.local.json` (本地配置，优先级最高)
   - `gptload-instances.json` (生产配置)
   - 通过环境变量 `GPTLOAD_INSTANCES_FILE` 指定的自定义路径

> **重要**：必须创建配置文件才能启动服务，不再提供默认后备配置。

## 配置参数说明

### 基础参数
- `id`: 实例唯一标识符
- `name`: 实例显示名称
- `url`: gpt-load 实例地址
- `token`: 认证令牌（可选，用于远程实例认证）
- `priority`: 优先级（数字越小优先级越高，推荐：本地=1，远程=2,3,4...）
- `description`: 实例描述（说明用途和地理位置）

### 高级参数
- `upstream_addresses`: 上游地址数组（可选），指定该实例的备用上游服务

### upstream_addresses 配置规则

**功能说明**：当某个实例无法直接访问目标站点时，可以通过上游实例进行代理访问。

**配置示例**：
```json
[
  {
    "id": "local",
    "name": "本地 gpt-load", 
    "url": "http://localhost:3001",
    "priority": 1,
    "description": "本地服务，优先使用"
  },
  {
    "id": "us-proxy",
    "name": "美国代理 gpt-load",
    "url": "https://us.gpt-load.example.com",
    "token": "your-token-here",
    "priority": 2,
    "description": "用于本地不易访问的站点",
    "upstream_addresses": [
      "https://eu.gpt-load.example.com"
    ]
  },
  {
    "id": "eu-proxy", 
    "name": "欧洲代理 gpt-load",
    "url": "https://eu.gpt-load.example.com",
    "token": "your-token-here",
    "priority": 3,
    "description": "欧洲服务器，最后备选",
    "upstream_addresses": []
  }
]
```

**验证规则**：
1. **序号依赖规则**：实例只能使用在配置数组中序号更大的实例作为上游地址
   - ✅ 正确：实例0可以使用实例1、2作为上游
   - ❌ 错误：实例1使用实例0作为上游（会导致循环依赖）

2. **循环依赖检查**：系统会自动检测并阻止以下情况：
   - 自引用：实例指向自己作为上游
   - 相互引用：实例A → 实例B，实例B → 实例A
   - 链式循环：实例A → 实例B → 实例C → 实例A

3. **URL 标准化**：比较时会忽略协议差异和端口号
   - `http://example.com:3001` 和 `https://example.com` 被视为同一实例

**配置验证错误示例**：
```bash
# 启动时会显示验证错误
实例 '美国代理 gpt-load' (序号 1) 不能使用序号更小或相等的实例 '本地 gpt-load' (序号 0, http://localhost:3001) 作为上游地址

规则：实例只能使用序号更大的实例作为上游地址，以避免循环依赖和访问失败
```

**最佳实践**：
1. **从低到高排序**：将最优先的实例放在配置数组前面
2. **单向依赖**：确保依赖关系是单向的，避免循环
3. **测试连通性**：确保上游实例之间网络可达
4. **Token配置**：远程实例需要正确配置认证令牌

## 实际使用场景

### 典型配置示例

```json
[
  {
    "id": "local",
    "name": "本地 gpt-load",
    "url": "http://localhost:3001",
    "priority": 1,
    "description": "本地服务，优先使用，处理可直接访问的站点"
  },
  {
    "id": "us-proxy",
    "name": "美国代理 gpt-load",
    "url": "https://us.gpt-load.example.com",
    "priority": 2,
    "description": "用于本地不易访问的站点"
  }
]
```

## 自动分配策略

uni-load 会根据以下策略为**第一层（站点分组）**自动选择最佳的 gpt-load 实例：

1. **健康检查**：只考虑健康的实例
2. **优先级排序**：按 priority 值排序（数字越小优先级越高）
3. **连通性测试**：测试实例是否能访问目标站点
4. **智能分配**：为站点分配第一个可用的实例
5. **故障转移**：如果分配的实例失效，自动重新分配

> **注意**：为了保证内部路由的一致性，**第二层（模型-渠道分组）**和**第三层（模型聚合分组）**会被统一创建在首选的、健康的 gpt-load 实例上。

## API 接口

- `GET /api/multi-instances` - 查看所有实例状态
- `POST /api/reassign-site` - 手动重新分配站点到实例
