#!/bin/bash

# 开启作业控制
set -m

echo "🚀 启动所有服务..."

# 定义优雅关闭函数
graceful_shutdown() {
    echo "🚨 接收到关闭信号，正在停止所有服务..."
    if [ ! -z "$PID_UNI_LOAD" ]; then
        kill -TERM $PID_UNI_LOAD
    fi
    if [ ! -z "$PID_UNI_API" ]; then
        kill -TERM $PID_UNI_API  
    fi
    if [ ! -z "$PID_GPT_LOAD" ]; then
        kill -TERM $PID_GPT_LOAD
    fi
    
    # 等待所有进程停止
    if [ ! -z "$PID_UNI_LOAD" ]; then
        wait $PID_UNI_LOAD
    fi
    if [ ! -z "$PID_UNI_API" ]; then
        wait $PID_UNI_API
    fi
    if [ ! -z "$PID_GPT_LOAD" ]; then
        wait $PID_GPT_LOAD
    fi
    
    echo "✅ 所有服务已停止"
    exit 0
}

# 捕获退出信号
trap graceful_shutdown SIGINT SIGTERM

# 1. 启动 gpt-load
echo "📡 启动 gpt-load..."

# 检查 gpt-load 的 .env 文件是否存在，如果不存在则从示例创建并生成密钥
if [ ! -f "/gpt-load/.env" ]; then
    echo "📄 检测到 /gpt-load/.env 不存在，正在从 .env.example 创建并生成新密钥..."
    # 复制示例文件
    cp /gpt-load/.env.example /gpt-load/.env
    # 生成新密钥
    GPTLOAD_NEW_AUTH_KEY=sk-$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 48 | head -n 1)
    # 替换 .env 文件中的默认密钥
    sed -i "s|AUTH_KEY=sk-123456|AUTH_KEY=${GPTLOAD_NEW_AUTH_KEY}|g" /gpt-load/.env
    echo "  - gpt-load 新增 AUTH_KEY: ${GPTLOAD_NEW_AUTH_KEY}"
    
    # 为 uni-load 生成对应的 gpt-load-instances.json 配置文件
    echo "📄 正在为 uni-load 生成 gpt-load-instances.json 配置文件..."
    cat <<EOF > /uni-load/gpt-load-instances.json
[
  {
    "id": "local",
    "name": "本地 gpt-load",
    "url": "http://localhost:3001",
    "token": "${GPTLOAD_NEW_AUTH_KEY}",
    "priority": 1,
    "description": "本地服务，优先使用"
  }
]
EOF
    echo "  - 已生成 uni-load 配置文件，使用相同的密钥"
fi

cd /gpt-load
./gpt-load &
PID_GPT_LOAD=$!
echo "gpt-load PID: $PID_GPT_LOAD"

# 等待 gpt-load 启动
echo "⏳ 等待 gpt-load 启动..."
sleep 5
for i in {1..12}; do
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ gpt-load 启动成功"
        break
    fi
    if [ $i -eq 12 ]; then
        echo "❌ gpt-load 启动超时"
        exit 1
    fi
    echo "等待 gpt-load 响应... ($i/12)"
    sleep 5
done

# 2. 启动 uni-api  
echo "🌐 启动 uni-api..."
cd /uni-api

# 检查 api.yaml 是否存在，如果不存在则创建
if [ ! -f "/uni-api/api.yaml" ]; then
    echo "📄 检测到 api.yaml 不存在，正在生成新的配置和密钥..."
    # 为 uni-api 生成一个随机的64位密钥
    UNI_API_AUTH_KEY=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 48 | head -n 1)
    echo "  - uni-api 新增 AUTH_KEY: sk-${UNI_API_AUTH_KEY}"
    # 将生成的密钥写入 uni-api 的 api.yaml 配置文件
    cat <<EOF > /uni-api/api.yaml
api_keys:
  - api: sk-${UNI_API_AUTH_KEY}
    model:
      - all
    preferences:
      SCHEDULING_ALGORITHM: round_robin
EOF
fi
EXISTING_UNI_API_KEY=$(grep -m 1 'api:' /uni-api/api.yaml | awk '{print $2}')

# 按照uni-api的Dockerfile ENTRYPOINT启动
DISABLE_DATABASE=true python -m uvicorn main:app --host 0.0.0.0 --port 8000 &
PID_UNI_API=$!
echo "uni-api PID: $PID_UNI_API"

# 等待 uni-api 启动
echo "⏳ 等待 uni-api 启动..."
sleep 3
for i in {1..10}; do
    if curl -f http://localhost:8000/api/health > /dev/null 2>&1 || curl -f http://localhost:8000/ > /dev/null 2>&1; then
        echo "✅ uni-api 启动成功"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "❌ uni-api 启动超时"
        exit 1
    fi
    echo "等待 uni-api 响应... ($i/10)"
    sleep 3
done

# 3. 启动 uni-load
echo "🚀 启动 uni-load..."
cd /uni-load
node dist/server.js &
PID_UNI_LOAD=$!
echo "uni-load PID: $PID_UNI_LOAD"

echo "🎉 所有服务启动完成！"
echo "📊 服务端口："
echo "  - gpt-load:  http://localhost:3001"
echo "  - uni-api:   http://localhost:8000"  
echo "  - uni-load:  http://localhost:3002"

# 读取 gpt-load 的密钥用于提示
GPTLOAD_AUTH_KEY=$(grep '^AUTH_KEY=' /gpt-load/.env | cut -d'=' -f2)

# 如果存在从 api.yaml 读取的密钥，则提示用户
if [ -n "$EXISTING_UNI_API_KEY" ]; then
    echo "🔑 uni-api 访问密钥: $EXISTING_UNI_API_KEY"
fi
if [ -n "$GPTLOAD_AUTH_KEY" ]; then
    echo "🔑 gpt-load 访问密钥: $GPTLOAD_AUTH_KEY"
fi

# 监控所有进程，如果任何一个退出，则关闭所有服务
while true; do
    if ! kill -0 $PID_GPT_LOAD 2>/dev/null; then
        echo "❌ gpt-load 进程退出"
        graceful_shutdown
    fi
    if ! kill -0 $PID_UNI_API 2>/dev/null; then
        echo "❌ uni-api 进程退出"
        graceful_shutdown
    fi
    if ! kill -0 $PID_UNI_LOAD 2>/dev/null; then
        echo "❌ uni-load 进程退出"
        graceful_shutdown
    fi
    sleep 10
done
