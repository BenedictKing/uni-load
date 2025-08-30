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
cd /gpt-load
if [ ! -f "config.ini" ]; then
    cp config.ini.example config.ini
fi
./gpt-load &
PID_GPT_LOAD=$!
echo "gpt-load PID: $PID_GPT_LOAD"

# 等待 gpt-load 启动
echo "⏳ 等待 gpt-load 启动..."
sleep 5
for i in {1..12}; do
    if curl -f http://localhost:3001/api/healthcheck > /dev/null 2>&1; then
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
# 确保 api.yaml 文件存在且可写
touch api.yaml
# 按照uni-api的Dockerfile ENTRYPOINT启动
python -m uvicorn main:app --host 0.0.0.0 --port 8000 &
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