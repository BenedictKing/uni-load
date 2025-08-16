# uni-load

🚀 **AI站点自动配置工具** - 连接 uni-api 与 gptload 的中间桥梁

## 📋 项目简介

uni-load 是一个自动化配置工具，帮助用户快速将第三方AI站点集成到 uni-api 和 gptload 系统中。通过简单的Web界面，用户只需输入AI站点的 `baseurl` 和 `apikey`，系统就会自动完成以下工作：

1. 🔍 **获取模型列表** - 调用AI站点的 `/v1/models` 接口
2. 🏗️ **创建两层分组** - 在 gptload 中创建站点分组和模型分组
3. ⚖️ **配置负载均衡** - 模型分组指向多个站点分组，实现自动负载均衡
4. 📝 **更新配置文件** - 自动修改 uni-api 的 `api.yaml` 配置
5. 🎯 **统一入口访问** - 用户通过 uni-api 统一入口访问所有AI模型

## 🌐 gptload 多实例支持

支持连接多个 gptload 实例，自动为不同站点选择最佳实例：

### 必需配置

> **重要**：启动服务前必须配置 gptload 实例，否则服务无法启动！

1. **复制配置文件**
   ```bash
   cp gptload-instances.json.example gptload-instances.json
   ```

2. **编辑配置文件**
   ```json
   [
     {
       "id": "local",
       "name": "本地 gptload",
       "url": "http://localhost:3001",
       "priority": 1,
       "description": "本地服务，优先使用"
     },
     {
       "id": "us-proxy",
       "name": "美国代理 gptload",
       "url": "https://us.gptload.example.com",
       "token": "your-token-here",
       "priority": 2,
       "description": "用于访问被墙的站点"
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
用户请求 → uni-api → gptload模型分组 → gptload站点分组 → 第三方AI站点
```

### 分组结构

- **第一层（站点分组）**：如 `deepseek`、`openai`、`anthropic`
- **第二层（模型分组）**：如 `gpt-4`、`claude-3`、`deepseek-chat`
- **上游配置**：模型分组的上游指向多个站点分组，实现负载均衡

## 🚀 快速开始

### 前置条件

确保以下服务正在运行：
- 🔧 **gptload** 服务 (默认端口 3001)
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

3. **配置 gptload 实例**（必需步骤）
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

### Web界面操作

1. 打开 `http://localhost:3002`
2. 填写表单：
   - **API基础地址**：如 `https://api.deepseek.com/v1`
   - **API密钥**：支持多个密钥，用于负载均衡
3. 系统会根据域名自动生成站点名称（如 `deepseek`）
4. 点击"🔧 开始配置"
5. 等待自动配置完成

### API接口

#### 处理AI站点配置
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
├── src/                    # 源代码目录
│   ├── gptload.js         # gptload 服务交互
│   ├── models.js          # 模型获取服务
│   └── yaml-manager.js    # uni-api 配置管理
├── public/                # 静态文件
│   └── index.html         # Web界面
├── server.js              # 主服务器
├── package.json           # 项目配置
├── bunfig.toml            # Bun 配置
├── .env                   # 默认环境变量
├── .env.local.example     # 本地环境变量模板
└── README.md              # 说明文档
```

## ⚙️ 环境变量配置

### 配置文件优先级

环境变量按以下优先级加载：
1. **`.env.local`** - 本地配置（优先级最高，不提交到版本控制）
2. **`.env`** - 默认配置（可提交到版本控制）

### 配置参数

```bash
# gptload 服务地址
GPTLOAD_URL=http://localhost:3001

# uni-api 项目路径
UNI_API_PATH=../uni-api

# 服务端口
PORT=3002

# gptload 认证令牌（如果需要）
GPTLOAD_TOKEN=sk-Lp15cEHb2D0GjbuvsvdHqd6NP1c1yURJ3C2lAjCbUjK5yApc

# uni-api 配置文件路径
UNI_API_YAML_PATH=../uni-api/api.yaml
```

### 使用建议

- **推荐做法**：直接使用 `cp .env.example .env.local` 创建本地配置
- **团队开发**：每个开发者使用自己的 `.env.local`，不影响他人
- **生产部署**：使用 `.env.local` 或系统环境变量
- **调试测试**：临时修改 `.env.local` 进行测试

## 🔄 工作流程

### 1. 模型发现
- 调用第三方AI站点的 `/v1/models` 接口
- 解析响应并过滤有效模型
- 支持多种响应格式自动适配

### 2. 分组创建
```
站点分组 (deepseek)
├── 上游: https://api.deepseek.com/v1
└── API密钥: sk-xxx, sk-yyy

模型分组 (deepseek-chat)
├── 上游: http://localhost:3001/proxy/deepseek
└── 支持多站点负载均衡
```

### 3. 配置更新
自动更新 `uni-api/api.yaml`：
```yaml
providers:
  - provider: gptload-deepseek-chat
    base_url: http://localhost:3001/proxy/deepseek-chat/v1/chat/completions
    api: sk-uni-load-auto-generated
    model:
      - deepseek-chat
    tools: true
```

## 🔍 特性说明

### ✅ 已实现功能

- 🌐 **Web界面**：直观的表单配置
- 🔍 **模型自动发现**：支持标准OpenAI格式API
- 🏗️ **两层分组架构**：站点级 + 模型级
- ⚖️ **负载均衡**：多站点、多密钥自动均衡
- 📝 **配置管理**：自动备份和更新
- 🔄 **容错机制**：重试和错误处理
- 📊 **状态监控**：服务状态检查

### 🔧 技术特点

- **模块化设计**：清晰的服务层分离
- **错误处理**：完善的异常捕获和恢复
- **配置备份**：自动创建配置文件备份
- **日志输出**：详细的操作日志
- **类型安全**：参数验证和类型检查

## 🐛 故障排除

### 常见问题

1. **gptload 连接失败**
   - 检查 gptload 服务是否运行在正确端口
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

**⚡ 让AI模型管理变得简单高效！**