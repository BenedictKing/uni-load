# uni-load

🚀 **AI 站点自动配置工具** - 连接 uni-api 与 gpt-load 的中间桥梁

## 📋 项目简介

uni-load 是一个自动化配置工具，帮助用户快速将第三方 AI 站点集成到 uni-api 和 gpt-load 系统中。通过简单的 Web 界面，用户只需输入 AI 站点的 `baseurl` 和 `apikey`，系统就会自动完成以下工作：

1. 🔍 **获取模型列表** - 调用 AI 站点的 `/v1/models` 接口
2. 🏗️ **创建两层分组** - 在 gpt-load 中创建站点分组和模型分组
3. ⚖️ **配置负载均衡** - 模型分组指向多个站点分组，实现自动负载均衡
4. 📝 **更新配置文件** - 自动修改 uni-api 的 `api.yaml` 配置
5. 🎯 **统一入口访问** - 用户通过 uni-api 统一入口访问所有 AI 模型

## 🌐 gpt-load 多实例支持

支持连接多个 gpt-load 实例，自动为不同站点选择最佳实例：

### 必需配置

> **重要**：启动服务前必须配置 gpt-load 实例，否则服务无法启动！

1. **复制配置文件**

   ```bash
   cp gptload-instances.json.example gptload-instances.json
   ```

2. **编辑配置文件**
   ```json
   [
     {
       "id": "local",
       "name": "本地 gpt-load",
       "url": "http://localhost:3001",
       "priority": 1,
       "description": "本地服务，优先使用",
       "upstream_addresses": [
         "https://us.gpt-load.example.com",
         "https://eu.gpt-load.example.com"
       ]
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

### 智能路由

- **优先级排序**: 数字越小优先级越高
- **健康检查**: 自动检测实例状态
- **连通性测试**: 测试实例是否能访问目标站点
- **故障转移**: 自动切换到可用实例

## 🏗️ 架构设计

```
用户请求 → uni-api → gpt-load模型分组 → gpt-load站点分组 → 第三方AI站点
```

### 分组结构

- **第一层（站点分组）**：如 `deepseek`、`openai`、`anthropic`
- **第二层（模型分组）**：如 `gpt-4`、`claude-3`、`deepseek-chat`
- **上游配置**：模型分组的上游指向多个站点分组，实现负载均衡

## 🚀 快速开始

### 前置条件

确保以下服务正在运行：

- 🔧 **gpt-load** 服务 (默认端口 3001)
- 🌐 **uni-api** 项目位于 `../uni-api` 目录
- 🚀 **bun** 运行时环境 (推荐版本 >= 1.0.0)

### 安装步骤

0. **安装 bun**（如果还没有安装）

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows (使用 PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# 或使用 npm
npm install -g bun
```

1. **克隆项目**

```bash
git clone <项目地址>
cd uni-load
```

2. **安装依赖**

```bash
bun install
```

3. **配置 gpt-load 实例**（必需步骤）

```bash
# 复制配置模板
cp gptload-instances.json.example gptload-instances.json

# 编辑配置文件，至少配置本地实例
# 示例：修改 url、token 等参数
```

4. **配置环境变量**

```bash
# 推荐：直接创建本地配置文件
cp .env.example .env.local

# 编辑本地配置文件，根据你的环境调整参数
# .env.local 优先级更高且不会被提交到版本控制
```

5. **启动服务**

```bash
bun start
# 或开发模式（自动重载）
bun dev
```

6. **访问页面**

```
http://localhost:3002
```

## 🛠️ 使用方法

### Web 界面操作

1. 打开 `http://localhost:3002`
2. 填写表单：
   - **API 基础地址**：如 `https://api.deepseek.com/v1`
   - **API 密钥**：支持多个密钥，用于负载均衡
3. 系统会根据域名自动生成站点名称（如 `deepseek`）
4. 点击"🔧 开始配置"
5. 等待自动配置完成

### API 接口

#### 处理 AI 站点配置

```http
POST /api/process-ai-site
Content-Type: application/json

{
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKeys": ["sk-xxx", "sk-yyy"]
}
```

> **注意**：`siteName` 参数已移除，系统会根据 `baseUrl` 自动生成站点名称。  
> 例如：`https://api.deepseek.com/v1` → `deepseek`

#### 获取服务状态

```http
GET /api/status
```

#### 健康检查

```http
GET /api/health
```

## 📁 项目结构

```
uni-load/
├── src/                          # 源代码目录
│   ├── types.ts                  # TypeScript 类型定义
│   ├── gptload.ts               # gpt-load 服务交互
│   ├── multi-gptload.ts         # 多实例管理
│   ├── models.ts                # 模型获取服务
│   ├── yaml-manager.ts          # uni-api 配置管理
│   ├── model-sync.ts            # 模型同步服务
│   ├── channel-health.ts        # 渠道健康监控
│   ├── channel-cleanup.ts       # 渠道清理服务
│   ├── model-config.ts          # 模型配置管理
│   ├── model-channel-optimizer.ts # 模型渠道优化
│   ├── three-layer-architecture.ts # 三层架构管理
│   └── temp-group-cleaner.ts    # 临时分组清理
├── public/                      # 静态资源
│   └── index.html              # Web界面
├── docs/                       # 项目文档
│   ├── architecture.md         # 系统架构设计
│   ├── api.md                  # API 接口文档
│   ├── deployment.md           # 部署指南
│   ├── development.md          # 开发指南
│   └── multi-gptload-config.md # 多实例配置说明
├── logs/                       # 日志目录
├── dist/                       # 编译输出目录
├── server.ts                   # 主服务器文件
├── tsconfig.json              # TypeScript 配置
├── package.json               # 项目配置
├── bunfig.toml                # Bun 配置
├── .env.example               # 环境变量示例
├── .env.local                 # 本地环境变量
├── gptload-instances.json     # gpt-load 实例配置
└── README.md                  # 说明文档
```

## ⚙️ 环境变量配置

### 配置文件优先级

环境变量按以下优先级加载：

1. **`.env.local`** - 本地配置（优先级最高，不提交到版本控制）
2. **`.env`** - 默认配置（可提交到版本控制）

### 配置参数

```bash
# gpt-load 服务地址
GPTLOAD_URL=http://localhost:3001

# uni-api 项目路径
UNI_API_PATH=../uni-api

# 服务端口
PORT=3002

# gpt-load 认证令牌（如果需要）
GPTLOAD_TOKEN=sk-Lp15cEHb2D0GjbuvsvdHqd6NP1c1yURJ3C2lAjCbUjK5yApc

# uni-api 配置文件路径
UNI_API_YAML_PATH=../uni-api/api.yaml

# 服务开关
ENABLE_MODEL_SYNC=true
ENABLE_CHANNEL_HEALTH=true
ENABLE_MODEL_OPTIMIZER=true

# 同步间隔配置
MODEL_SYNC_INTERVAL=60
CHANNEL_CHECK_INTERVAL=30
CHANNEL_FAILURE_THRESHOLD=3
```

### 使用建议

- **推荐做法**：直接使用 `cp .env.example .env.local` 创建本地配置
- **团队开发**：每个开发者使用自己的 `.env.local`，不影响他人
- **生产部署**：使用 `.env.local` 或系统环境变量
- **调试测试**：临时修改 `.env.local` 进行测试

## 📚 文档目录

### 基础文档
- 📖 [系统架构设计](docs/architecture.md) - 详细的架构设计和组件说明
- 🔌 [API 接口文档](docs/api.md) - 完整的 API 接口规范和示例
- 🚀 [部署指南](docs/deployment.md) - 多种环境的部署方案和配置
- 🛠️ [开发指南](docs/development.md) - 开发环境设置和编码规范
- ⚙️ [多实例配置说明](docs/multi-gptload-config.md) - gpt-load 多实例配置详解

### 进阶文档
- 👤 [用户操作手册](docs/user-guide.md) - Web 界面和 API 使用的详细指南
- 🏗️ [模块设计文档](docs/module-design.md) - 详细的模块架构和设计模式
- ⚡ [性能优化指南](docs/performance-optimization.md) - 系统性能调优和监控指南
- 🏛️ [系统架构设计 v2.0](docs/system-architecture-v2.md) - 三层架构的深度解析

## 🔄 工作流程

### 1. 模型发现

- 调用第三方 AI 站点的 `/v1/models` 接口
- 解析响应并过滤有效模型
- 支持多种响应格式自动适配

### 2. 分组创建

```
站点分组 (deepseek)
├── 上游: https://api.deepseek.com/v1
└── API密钥: sk-xxx, sk-yyy

模型分组 (deepseek-chat)
├── 上游: http://localhost:3001/proxy/deepseek-chat
└── 支持多站点负载均衡
```

### 3. 配置更新

自动更新 `uni-api/api.yaml`：

```yaml
providers:
  - provider: gpt-load-deepseek-chat
    base_url: http://localhost:3001/proxy/deepseek-chat/v1/chat/completions
    api: sk-uni-load-auto-generated
    model:
      - deepseek-chat
    tools: true
```

## 🔍 特性说明

### ✅ 核心功能

- 🌐 **Web 界面**: 直观的表单配置界面
- 🔍 **模型自动发现**: 支持标准 OpenAI API 格式
- 🏗️ **三层分组架构**: 站点级 + 模型级 + 渠道级
- ⚖️ **智能负载均衡**: 多站点、多密钥自动均衡
- 🔄 **多实例管理**: 支持多个 gpt-load 实例协调工作
- 📊 **实时监控**: 健康检查和状态监控
- 🔧 **自动化运维**: 模型同步、渠道清理、故障恢复

### 🎯 高级功能

- **智能路由**: 自动选择最佳实例和路径
- **故障转移**: 自动检测和切换失效服务
- **配置备份**: 自动备份和恢复配置文件
- **渠道优化**: 智能清理和优化无效渠道
- **临时分组管理**: 自动清理临时和过期分组
- **日志记录**: 详细的操作和错误日志

### 🔧 技术特点

- **TypeScript 构建**: 类型安全和代码质量保证
- **模块化设计**: 清晰的服务层分离和职责划分
- **容错机制**: 完善的异常捕获和恢复逻辑
- **性能优化**: 连接池、缓存和并发控制
- **扩展友好**: 插件化架构便于功能扩展

## 🛠️ 快速操作

### 常用命令

```bash
# 开发模式（热重载）
bun dev

# 生产构建
bun run build
bun start

# 类型检查
bun run type-check

# 清理构建
bun run clean
```

### 快速配置

```bash
# 1. 复制并配置实例文件（必需）
cp gptload-instances.json.example gptload-instances.json
vim gptload-instances.json

# 2. 复制并配置环境变量
cp .env.example .env.local
vim .env.local

# 3. 启动服务
bun dev
```

### API 快速测试

```bash
# 健康检查
curl http://localhost:3002/api/health

# 预览站点名称
curl -X POST http://localhost:3002/api/preview-site-name \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "https://api.deepseek.com/v1"}'

# 配置 AI 站点
curl -X POST http://localhost:3002/api/process-ai-site \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKeys": ["sk-xxx"],
    "channelTypes": ["openai"]
  }'
```

## 🐛 故障排除

### 常见问题

1. **gpt-load 连接失败**

   - 检查 gpt-load 服务是否运行在正确端口
   - 确认 `GPTLOAD_URL` 环境变量配置

2. **模型获取失败**

   - 验证 API 密钥是否有效
   - 检查第三方站点的网络连接
   - 确认 API 基础地址格式

3. **配置文件更新失败**
   - 检查 uni-api 目录路径
   - 确认文件写入权限
   - 验证 YAML 格式正确性

### 调试模式

使用开发模式启动获取详细日志：

```bash
bun dev
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙋‍♂️ 支持

如有问题或建议，请提交 Issue 或联系开发团队。

---

**⚡ 让 AI 模型管理变得简单高效！**
