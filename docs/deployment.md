# 部署指南

## 概述

本指南详细介绍了 uni-load 在不同环境下的部署方案，包括开发环境、测试环境和生产环境的部署配置。

## 系统要求

### 硬件要求

**最低配置**:

- CPU: 1 核心
- 内存: 512MB
- 存储: 1GB 可用空间
- 网络: 稳定的互联网连接

**推荐配置**:

- CPU: 2+ 核心
- 内存: 2GB+
- 存储: 5GB+ 可用空间
- 网络: 高速互联网连接

### 软件要求

**必需软件**:

- **Node.js**: >= 18.0.0
- **Bun**: >= 1.0.0 (推荐运行时)
- **Git**: >= 2.30.0

**依赖服务**:

- **gpt-load**: 必须运行在可访问的地址
- **uni-api**: 项目目录必须存在且可写

**可选软件**:

- **Docker**: >= 20.10.0 (容器化部署)
- **PM2**: >= 5.0.0 (进程管理)
- **Nginx**: >= 1.20.0 (反向代理)

## 环境准备

### 1. 安装运行时环境

确保已安装必要的运行时环境，基本安装步骤请参考 [README.md](../README.md#快速开始)。

### 2. 验证环境

```bash
# 检查版本
node --version  # >= 18.0.0
bun --version   # >= 1.0.0
git --version   # >= 2.30.0
```

## 配置文件设置

### 环境变量配置

**完整环境变量配置示例** (`.env.local`):

```bash
# 基础配置
PORT=3002

# gpt-load 多实例配置文件路径（v2.1版本使用实例配置文件）
GPTLOAD_INSTANCES_FILE=gptload-instances.json

# uni-api 配置
UNI_API_PATH=../uni-api
UNI_API_YAML_PATH=../uni-api/api.yaml

# 服务功能开关
ENABLE_MODEL_SYNC=true                # 启用模型同步服务
ENABLE_CHANNEL_HEALTH=true            # 启用渠道健康监控
ENABLE_MODEL_OPTIMIZER=true           # 启用三层架构管理器

# 监控间隔配置（分钟）
MODEL_SYNC_INTERVAL=360               # 模型同步间隔（6小时）
CHANNEL_CHECK_INTERVAL=10             # 渠道健康检查间隔（10分钟）
CHANNEL_FAILURE_THRESHOLD=3           # 渠道失败阈值
```

**配置参数详细说明**:

| 参数                        | 默认值                 | 说明                         |
| --------------------------- | ---------------------- | ---------------------------- |
| `PORT`                      | 3002                   | 服务监听端口                 |
| `GPTLOAD_INSTANCES_FILE`    | gptload-instances.json | gpt-load 实例配置文件路径    |
| `UNI_API_PATH`              | ../uni-api             | uni-api 项目目录相对路径     |
| `UNI_API_YAML_PATH`         | ../uni-api/api.yaml    | uni-api 配置文件路径         |
| `ENABLE_MODEL_SYNC`         | true                   | 是否启用模型同步服务         |
| `ENABLE_CHANNEL_HEALTH`     | true                   | 是否启用渠道健康监控         |
| `ENABLE_MODEL_OPTIMIZER`    | true                   | 是否启用三层架构管理器       |
| `MODEL_SYNC_INTERVAL`       | 360                    | 模型同步间隔（分钟）         |
| `CHANNEL_CHECK_INTERVAL`    | 10                     | 渠道健康检查间隔（分钟）     |
| `CHANNEL_FAILURE_THRESHOLD` | 3                      | 连续失败多少次后被认为不可用 |

# 调试和日志配置

LOG_LEVEL=info # 日志级别：debug, info, warn, error
ENABLE_DEBUG_LOGS=false # 启用调试日志
ENABLE_METRICS=false # 启用性能监控

# 安全配置

ALLOWED_ORIGINS=http://localhost:3002 # CORS 允许的源
MAX_REQUEST_SIZE=10mb # 最大请求体大小

````

**生产环境推荐配置**:
```bash
# 生产环境优化配置
MODEL_SYNC_INTERVAL=720               # 降低同步频率为12小时
CHANNEL_CHECK_INTERVAL=30             # 适中的检查频率
CHANNEL_FAILURE_THRESHOLD=5           # 增加容错次数
````

### gpt-load 实例配置

详细的实例配置说明请参考 [多实例配置文档](multi-gptload-config.md)

```bash
# 复制配置模板
cp gptload-instances.json.example gptload-instances.json
```

### 高级配置选项

#### 模型过滤配置

系统内置了智能的模型过滤机制，通过白名单和黑名单来确保只使用合适的模型。

**白名单配置** (src/model-config.ts):

- 只有匹配白名单前缀的模型才会被添加到系统中
- 支持的模型前缀包括：

  ```javascript
  // 主流AI模型
  'gpt-', 'chatgpt-',           // OpenAI
  'claude-3-5', 'claude-4',     // Anthropic
  'gemini-2.5-',               // Google
  'deepseek-',                 // DeepSeek
  'kimi-k2',                   // Moonshot
  'doubao-1-6-',               // ByteDance
  'glm-4.5',                   // 智谱AI
  'grok-3', 'grok-4',          // xAI
  'v0-',                       // Vercel

  // 注释掉的模型（默认不启用）
  // 'qwen-', 'llama-', 'mixtral-'
  ```

**黑名单配置**:

- 包含黑名单关键词的模型会被自动过滤
- 黑名单关键词包括：
  ```javascript
  ;[
    'gpt-3.5', // 过时模型
    'test', // 测试模型
    'vision', // 多模态模型
    'image',
    'audio', // 非文本模型
    'embedding', // 向量模型
    'whisper', // 语音模型
    'dall-e', // 图像生成
    'sora', // 视频生成
  ]
  ```

**高消耗模型配置**:

- 对于成本较高的模型，系统会跳过自动验证
- 高消耗模型模式：`['o3-', 'o4-']`

**非标准模型名称支持**:
系统支持多种模型名称格式，包括带有组织前缀的名称（如 `deepseek-ai/DeepSeek-V3`）以及非标准的 `OpenAI-GPT-` 前缀。这些名称在处理时会被自动标准化，以确保兼容性：

- **组织前缀**: `deepseek-ai/DeepSeek-V3` → `deepseek-v3`
- **OpenAI-GPT 前缀**: `OpenAI-GPT-4o` → `gpt-4o`
- **标准化处理**: 自动移除特殊字符，转换为小写，统一命名规范

这确保了不同来源的模型名称都能被正确识别和处理。

**自定义模型过滤**:

```bash
# 修改模型配置文件
vim src/model-config.ts

# 添加新的白名单前缀
allowedPrefixes: [
  // 现有配置...
  'your-custom-model-',
]

# 添加新的黑名单关键词
blacklistedKeywords: [
  // 现有配置...
  'unwanted-keyword',
]
```

#### 三层架构分层配置

系统使用三层架构管理模型分组，每层都有独立的配置参数。

**配置文件**: `src/layer-configs.ts`

**第一层 - 站点分组配置**:

```javascript
siteGroup: {
  sort: 20,                              // 分组排序值
  blacklist_threshold: 99,               // 高容错，站点问题通常是暂时的
  key_validation_interval_minutes: 60,   // API密钥验证间隔（分钟）
}
```

**第二层 - 模型-渠道分组配置**:

```javascript
modelChannelGroup: {
  sort: 30,                              // 分组排序值
  blacklist_threshold: 2,                // 快速失败，立即识别不兼容组合
  key_validation_interval_minutes: 10080, // 7天验证一次，避免API消耗
}
```

**第三层 - 模型聚合分组配置**:

```javascript
aggregateGroup: {
  sort: 40,                              // 分组排序值
  blacklist_threshold: 50,               // 中等容错
  key_validation_interval_minutes: 30,   // 30分钟验证一次
  max_retries: 9,                        // 增加尝试次数，适合多上游
}
```

**配置参数说明**:

- `sort`: 分组排序值，数字越小优先级越高
- `blacklist_threshold`: 失败阈值，超过此值将被加入黑名单
- `key_validation_interval_minutes`: 密钥验证间隔时间
- `max_retries`: 最大重试次数

**自定义分层配置**:

```bash
# 修改分层配置文件
vim src/layer-configs.ts

# 调整验证间隔（例如：减少第三层验证频率）
aggregateGroup: {
  // ...其他配置
  key_validation_interval_minutes: 120,  // 改为2小时验证一次
}

# 调整失败容错（例如：提高第二层容错性）
modelChannelGroup: {
  // ...其他配置
  blacklist_threshold: 5,               // 提高到5次失败才加入黑名单
}
```

**最佳实践**:

1. **站点分组**：高容错配置，因为站点问题通常是网络或临时性的
2. **模型-渠道分组**：低容错配置，快速识别模型兼容性问题
3. **聚合分组**：中等容错配置，平衡性能和稳定性
4. **验证间隔**：根据 API 成本和系统负载调整验证频率
5. **生产环境**：建议保持默认配置，除非有特殊需求

#### 环境变量高级配置

除了基础环境变量，系统还支持以下高级配置：

```bash
# 模型过滤控制
ENABLE_MODEL_WHITELIST=true           # 启用白名单过滤
ENABLE_MODEL_BLACKLIST=true           # 启用黑名单过滤

# 性能调优
MAX_CONCURRENT_REQUESTS=10            # 最大并发请求数
REQUEST_TIMEOUT_MS=30000              # 请求超时时间（毫秒）
RETRY_ATTEMPTS=3                      # 失败重试次数

# 调试和监控
LOG_LEVEL=info                        # 日志级别：debug, info, warn, error
ENABLE_METRICS=true                   # 启用性能监控
METRICS_PORT=9090                     # 监控端口

# 功能开关
ENABLE_MODEL_SYNC=true                # 启用模型同步服务
ENABLE_CHANNEL_HEALTH=true            # 启用渠道健康监控
ENABLE_MODEL_OPTIMIZER=true           # 启用三层架构管理器
```

## 部署方案

### 方案一: 开发环境部署

适用于本地开发和调试。

```bash
# 启动开发模式（支持热重载）
bun dev

# 或者使用 TypeScript 模式
bun run dev:build
```

特点：

- ✅ 自动重载代码变更
- ✅ 详细的调试日志
- ✅ 直接运行 TypeScript
- ❌ 不适合生产环境

### 方案二: 生产环境部署

适用于生产环境运行。

#### 2.1 编译构建

```bash
# 使用 bun 内置的打包器进行构建
bun run build

# 验证构建结果
ls -la dist/
```

此命令会调用 `bun build ./server.ts --outdir ./dist --target=node`，它将整个应用（包括所有依赖）打包成一个优化的 JavaScript 文件，有效避免了 TypeScript 路径别名和 ES Modules 导入的常见问题。

#### 2.2 直接运行

```bash
# 启动生产服务
bun start

# 或者使用 Node.js
node dist/server.js
```

#### 2.3 使用 PM2 管理进程

安装 PM2：

```bash
npm install -g pm2
```

创建 PM2 配置文件 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [
    {
      name: 'uni-load',
      script: 'dist/server.js',
      cwd: '/path/to/uni-load',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      log_file: 'logs/combined.log',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      merge_logs: true,
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 5,
      min_uptime: '10s',
    },
  ],
}
```

启动服务：

```bash
# 启动服务
pm2 start ecosystem.config.js --env production

# 查看状态
pm2 status

# 查看日志
pm2 logs uni-load

# 重启服务
pm2 restart uni-load

# 停止服务
pm2 stop uni-load
```

### 方案三: Docker 容器化部署

#### 3.1 创建 Dockerfile

项目根目录下已包含完整的 `Dockerfile`，支持多阶段构建，可用于构建包含 gpt-load、uni-api 和 uni-load 的完整容器镜像。

#### 3.2 创建 docker-compose.yml

```yaml
# docker-compose.yml
version: '3.8'

services:
  uni-load:
    build: .
    container_name: uni-load
    ports:
      - '3002:3002'
    environment:
      - NODE_ENV=production
      - PORT=3002
      - GPTLOAD_URL=http://gpt-load:3001
      - UNI_API_PATH=/app/uni-api
    volumes:
      - ./gptload-instances.json:/app/gptload-instances.json
      - ./.env.local:/app/.env.local
      - ../uni-api:/app/uni-api
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3002/api/health']
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - uni-network

networks:
  uni-network:
    driver: bridge
```

#### 3.3 构建和运行

```bash
# 构建镜像
docker build -t uni-load:latest .

# 使用 docker-compose 启动
docker-compose up -d

# 查看日志
docker-compose logs -f uni-load

# 停止服务
docker-compose down
```

### 方案四: Nginx 反向代理部署

适用于需要域名访问或 HTTPS 的场景。

#### 4.1 Nginx 配置

创建 `/etc/nginx/sites-available/uni-load`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书配置
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;

    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # 代理到 uni-load
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://127.0.0.1:3002;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

启用配置：

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/uni-load /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

## 安全配置

### 1. 防火墙设置

```bash
# Ubuntu/Debian
sudo ufw allow 3002/tcp
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3002/tcp
sudo firewall-cmd --reload
```

### 2. 访问控制

#### IP 白名单（Nginx）

```nginx
# 在 Nginx server 块中添加
location / {
    allow 192.168.1.0/24;  # 允许内网
    allow 10.0.0.0/8;      # 允许专网
    deny all;              # 拒绝其他

    proxy_pass http://127.0.0.1:3002;
}
```

#### 基础认证（Nginx）

```bash
# 创建密码文件
sudo htpasswd -c /etc/nginx/.htpasswd admin

# Nginx 配置
location / {
    auth_basic "uni-load Admin";
    auth_basic_user_file /etc/nginx/.htpasswd;

    proxy_pass http://127.0.0.1:3002;
}
```

### 3. 文件权限

```bash
# 设置适当的文件权限
chmod 644 .env.local
chmod 644 gptload-instances.json
chmod -R 755 dist/

# 确保日志目录权限
mkdir -p logs
chmod 755 logs
```

## 监控和日志

### 1. 健康检查

设置定期健康检查：

```bash
# 创建健康检查脚本
cat > /usr/local/bin/uni-load-health.sh << 'EOF'
#!/bin/bash
HEALTH_URL="http://localhost:3002/api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ "$RESPONSE" != "200" ]; then
    echo "$(date): uni-load health check failed (HTTP $RESPONSE)" >> /var/log/uni-load-health.log
    # 可以添加重启逻辑或告警
fi
EOF

chmod +x /usr/local/bin/uni-load-health.sh

# 添加到 crontab
echo "*/5 * * * * /usr/local/bin/uni-load-health.sh" | crontab -
```

### 2. 日志轮转

创建 `/etc/logrotate.d/uni-load`：

```
/path/to/uni-load/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
```

### 3. 系统监控

使用 systemd service（可选）：

```ini
# /etc/systemd/system/uni-load.service
[Unit]
Description=uni-load AI Site Configuration Tool
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/path/to/uni-load
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/bun start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=uni-load

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable uni-load
sudo systemctl start uni-load
sudo systemctl status uni-load
```

## 故障排除

### 常见问题

#### 1. 服务无法启动

**检查列表**:

- ✅ gptload-instances.json 是否存在和配置正确
- ✅ uni-api 目录是否存在和可访问
- ✅ 端口 3002 是否被占用
- ✅ 环境变量是否正确配置
- ✅ 依赖包是否安装完成

**诊断命令**:

```bash
# 检查端口占用
lsof -i :3002

# 检查配置文件语法
bun run type-check

# 查看详细启动日志
bun dev

# 检查 gptload-instances.json 格式
jq . gptload-instances.json

# 检查 uni-api 目录权限
ls -la ../uni-api
```

**常见错误信息**:

- `EADDRINUSE`: 端口 3002 被占用
- `ENOENT: no such file or directory 'gptload-instances.json'`: 实例配置文件不存在
- `Cannot resolve module`: TypeScript 编译错误
  bun dev

````

#### 2. gpt-load 连接失败

**检查列表**:
- ✅ gpt-load 服务是否正在运行
- ✅ URL 和端口是否正确
- ✅ 网络连接是否正常
- ✅ 认证 token 是否有效

**诊断命令**:
```bash
# 测试 gpt-load 连接
curl http://localhost:3001/api/health

# 检查网络连通性
ping gpt-load-host

# 查看错误日志
tail -f logs/error.log
````

#### 3. 站点配置失败

**症状**: API 返回错误，无法创建站点分组

**排查步骤**:

1. **验证 API 密钥**

   ```bash
   curl -X POST http://localhost:3002/api/probe-api \
     -H "Content-Type: application/json" \
     -d '{"baseUrl": "https://api.example.com/v1", "apiKey": "sk-xxx"}'
   ```

2. **检查网络连接** - 确认能够访问目标 API 站点

3. **查看系统状态**
   ```bash
   curl http://localhost:3002/api/status
   ```

#### 4. 模型获取失败

**可能原因**:

- API 密钥无效或过期
- API 站点不支持 `/v1/models` 接口
- 网络连接问题
- gpt-load 实例不可达
- 模型被白名单/黑名单过滤

**解决方案**:

```bash
# 1. 验证 API 密钥有效性
curl -X POST http://localhost:3002/api/probe-api \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "https://api.example.com/v1", "apiKey": "sk-xxx"}'

# 2. 直接测试 API 站点
curl -H "Authorization: Bearer sk-xxx" \
     https://api.example.com/v1/models

# 3. 检查模型过滤配置
grep -n "allowedPrefixes\|blacklistedKeywords" src/model-config.ts

# 4. 使用手动模型列表
curl -X POST http://localhost:3002/api/process-ai-site \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://api.example.com/v1",
    "apiKeys": ["sk-xxx"],
    "models": ["model1", "model2"]
  }'
```

#### 5. 三层架构问题

**症状**: 模型分组创建失败或结构异常

**诊断步骤**:

```bash
# 检查架构状态
curl http://localhost:3002/api/architecture-status

# 获取详细统计
curl http://localhost:3002/api/architecture-stats

# 重新初始化架构
curl -X POST http://localhost:3002/api/initialize-architecture
```

#### 6. 多实例连接问题

**症状**: 部分 gpt-load 实例不可用

**排查步骤**:

```bash
# 检查所有实例状态
curl http://localhost:3002/api/multi-instances

# 手动检查实例健康
curl -X POST http://localhost:3002/api/check-instances

# 检查实例配置文件
cat gptload-instances.json | jq '.instances[] | {id, name, url, priority}'

# 手动测试实例连接
for url in $(jq -r '.instances[].url' gptload-instances.json); do
  echo "Testing $url"
  curl -s "$url/api/health" || echo "Failed"
done
```

### 日志分析

主要日志文件位置：

- **应用日志**: `logs/combined.log`
- **错误日志**: `logs/error.log`
- **访问日志**: `logs/access.log`
- **渠道操作日志**: `logs/channel-operations.log`

常用日志命令：

```bash
# 实时查看日志
tail -f logs/combined.log

# 搜索错误信息
grep "ERROR" logs/combined.log

# 查看最近的操作
tail -100 logs/channel-operations.log
```

## 性能优化

### 1. 系统调优

```bash
# 增加文件描述符限制
echo "* soft nofile 65535" >> /etc/security/limits.conf
echo "* hard nofile 65535" >> /etc/security/limits.conf

# 优化网络参数
echo "net.core.somaxconn = 1024" >> /etc/sysctl.conf
sysctl -p
```

### 2. 应用调优

环境变量优化：

```bash
# .env.local 中调整间隔
MODEL_SYNC_INTERVAL=300      # 5分钟同步一次
CHANNEL_CHECK_INTERVAL=60    # 1分钟检查一次
CHANNEL_FAILURE_THRESHOLD=5  # 增加容错次数
```

## 备份和恢复

### 1. 备份脚本

```bash
#!/bin/bash
# backup-uni-load.sh

BACKUP_DIR="/backup/uni-load/$(date +%Y%m%d_%H%M%S)"
PROJECT_DIR="/path/to/uni-load"

mkdir -p "$BACKUP_DIR"

# 备份配置文件
cp "$PROJECT_DIR/.env.local" "$BACKUP_DIR/"
cp "$PROJECT_DIR/gptload-instances.json" "$BACKUP_DIR/"

# 备份日志
cp -r "$PROJECT_DIR/logs" "$BACKUP_DIR/"

# 创建归档
tar -czf "$BACKUP_DIR.tar.gz" -C "$BACKUP_DIR" .
rm -rf "$BACKUP_DIR"

echo "Backup created: $BACKUP_DIR.tar.gz"
```

### 2. 自动备份

```bash
# 添加到 crontab
0 2 * * * /usr/local/bin/backup-uni-load.sh
```

## 升级指南

### 1. 准备升级

```bash
# 备份当前版本
cp -r uni-load uni-load-backup

# 停止服务
pm2 stop uni-load
# 或
sudo systemctl stop uni-load
```

### 2. 升级代码

```bash
cd uni-load

# 拉取最新代码
git pull origin main

# 更新依赖
bun install

# 重新构建
bun run build
```

### 3. 检查配置

```bash
# 比较配置文件变更
diff .env.example .env.local

# 检查实例配置
diff gptload-instances.json.example gptload-instances.json
```

### 4. 启动服务

```bash
# 重启服务
pm2 restart uni-load
# 或
sudo systemctl start uni-load

# 验证服务状态
curl http://localhost:3002/api/health
```

#### 6. Web 界面显示 "Cannot GET /"

- **原因**: Node.js 在 ES Module 模式下运行时，`__dirname` 变量不可用，导致 Express 无法找到静态前端文件的正确路径。
- **解决**: 此问题已在代码中通过使用 `import.meta.url` 和 `path.dirname` 来正确构造 `__dirname` 修复。如果遇到类似问题，请检查静态文件服务的路径是否正确指向 `public` 目录。

## 总结

选择合适的部署方案：

- **开发环境**: 使用 `bun dev`
- **小型生产**: 直接运行 + systemd
- **中型生产**: PM2 + Nginx
- **大型生产**: Docker + 负载均衡

记住关键配置点：

1. 必须配置 gptload-instances.json
2. 确保 uni-api 目录可访问
3. 定期备份配置文件
4. 监控服务健康状态
