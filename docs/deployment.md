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

详细的环境变量说明请参考 [README.md](../README.md#环境配置)

```bash
# 创建生产环境配置
cp .env.example .env.local

# 关键生产配置
NODE_ENV=production
PORT=3002
GPTLOAD_URL=http://localhost:3001
```

### gpt-load 实例配置

详细的实例配置说明请参考 [多实例配置文档](multi-gptload-config.md)

```bash
# 复制配置模板
cp gptload-instances.json.example gptload-instances.json
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
# 编译 TypeScript 到 JavaScript
bun run build

# 验证构建结果
ls -la dist/
```

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
  apps: [{
    name: 'uni-load',
    script: 'dist/server.js',
    cwd: '/path/to/uni-load',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    log_file: 'logs/combined.log',
    out_file: 'logs/out.log',
    error_file: 'logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    merge_logs: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 5,
    min_uptime: '10s'
  }]
};
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

```dockerfile
# Dockerfile
FROM oven/bun:1-alpine

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package.json bun.lock* ./

# 安装依赖
RUN bun install --frozen-lockfile

# 复制源代码
COPY . .

# 编译 TypeScript
RUN bun run build

# 暴露端口
EXPOSE 3002

# 启动命令
CMD ["bun", "start"]
```

#### 3.2 创建 docker-compose.yml

```yaml
# docker-compose.yml
version: '3.8'

services:
  uni-load:
    build: .
    container_name: uni-load
    ports:
      - "3002:3002"
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
      test: ["CMD", "curl", "-f", "http://localhost:3002/api/health"]
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

**诊断命令**:
```bash
# 检查端口占用
lsof -i :3002

# 检查配置文件
bun run type-check

# 查看详细启动日志
bun dev
```

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
```

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

**解决方案**:
1. 验证 API 密钥有效性
2. 尝试手动指定模型列表
3. 检查网络连接
4. 切换到其他 gpt-load 实例

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