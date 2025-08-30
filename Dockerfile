# --- 阶段 1: 构建 gpt-load ---
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/oven/bun:1.2.15 AS gpt-load-builder

# 复制Go运行时
COPY --from=swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/golang:1.24.2-alpine /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/go"
ENV PATH="${GOPATH}/bin:${PATH}"
ENV GOROOT="/usr/local/go"

# 设置Go代理为中国镜像
ENV GOPROXY=https://goproxy.io,direct
ENV GOSUMDB=sum.golang.google.cn
# 禁用Go自动下载更新
ENV GOTOOLCHAIN=local

# 中国网络优化：使用阿里云镜像源
RUN if [ -f /etc/apt/sources.list ]; then \
        sed -i 's#deb.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list && \
        sed -i 's#security.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list; \
    elif [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's#deb.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list.d/debian.sources && \
        sed -i 's#security.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list.d/debian.sources; \
    else \
        echo "deb https://mirrors.aliyun.com/debian/ bookworm main" > /etc/apt/sources.list && \
        echo "deb https://mirrors.aliyun.com/debian-security/ bookworm-security main" >> /etc/apt/sources.list && \
        echo "deb https://mirrors.aliyun.com/debian/ bookworm-updates main" >> /etc/apt/sources.list; \
    fi

# 快速安装git（只安装必要的包，不更新索引）
RUN apt-get update -qq && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# 使用ghfast.top GitHub加速镜像
RUN git clone https://ghfast.top/https://github.com/tbphp/gpt-load.git . || \
    git clone https://gitee.com/tbphp/gpt-load.git . || \
    git clone https://github.com/tbphp/gpt-load.git .

# 修改 gpt-load 的 group_handler.go 文件：将 3(.*)30 替换为 3($1)100
RUN sed -i 's/3\(.*\)30/3\1100/g' internal/handler/group_handler.go

# 使用bun构建前端（如果存在web目录）
RUN if [ -d "web" ]; then \
        cd web && \
        rm -f package-lock.json yarn.lock pnpm-lock.yaml bun.lock && \
        echo '[install]\nregistry = "https://registry.npmmirror.com/"' > ~/.bunfig.toml && \
        bun install && \
        bun vite build; \
    else \
        mkdir -p web/dist && echo '{}' > web/dist/index.html; \
    fi

# 先下载go模块依赖
RUN go mod download && go mod verify

# 然后编译
RUN CGO_ENABLED=0 go build -o gpt-load .

# --- 阶段 2: 构建 uni-api (使用其自己的Dockerfile) ---
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/python:3.11-slim AS uni-api-builder

# 复制uni-api的Dockerfile构建逻辑
COPY --from=swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/astral-sh/uv /uv /uvx /bin/

# 中国网络优化：使用阿里云镜像源
RUN if [ -f /etc/apt/sources.list ]; then \
        sed -i 's#deb.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list && \
        sed -i 's#security.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list; \
    elif [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's#deb.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list.d/debian.sources && \
        sed -i 's#security.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list.d/debian.sources; \
    else \
        echo "deb https://mirrors.aliyun.com/debian/ bookworm main" > /etc/apt/sources.list && \
        echo "deb https://mirrors.aliyun.com/debian-security/ bookworm-security main" >> /etc/apt/sources.list && \
        echo "deb https://mirrors.aliyun.com/debian/ bookworm-updates main" >> /etc/apt/sources.list; \
    fi

# 快速安装git（只安装必要的包，不更新索引）
RUN apt-get update -qq && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# 克隆uni-api项目
RUN git clone https://ghfast.top/https://github.com/yym68686/uni-api.git . || \
    git clone https://gitee.com/yym68686/uni-api.git . || \
    git clone https://github.com/yym68686/uni-api.git .

# 按照uni-api的Dockerfile构建（使用项目自己的pyproject.toml和uv.lock）
RUN uv add pyproject.toml -i https://mirrors.aliyun.com/pypi/simple/

# --- 阶段 3: 构建 uni-load (本项目) ---
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/oven/bun:1.2.15 AS uni-load-builder

# bun:1.2.15 是基于Ubuntu的，不需要修改apk源
# 如果需要加速，可以设置npm镜像源

WORKDIR /app
COPY package.json tsconfig.json ./

# 使用淘宝npm镜像
RUN echo '[install]\nregistry = "https://registry.npmmirror.com/"' > ~/.bunfig.toml
# 安装所有依赖（包括开发依赖）以进行构建
RUN bun install

# 复制源代码和其他配置文件
COPY . .
RUN bun run build

# --- 最终阶段: 组合所有服务 ---
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/node:18-slim

# 复制Python和uv
COPY --from=swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/python:3.11-slim /usr/local/bin/python* /usr/local/bin/
COPY --from=swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/python:3.11-slim /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/python:3.11-slim /usr/local/lib/libpython* /usr/local/lib/

# 中国网络优化：使用阿里云镜像源
RUN if [ -f /etc/apt/sources.list ]; then \
        sed -i 's#deb.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list && \
        sed -i 's#security.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list; \
    elif [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's#deb.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list.d/debian.sources && \
        sed -i 's#security.debian.org#mirrors.aliyun.com#g' /etc/apt/sources.list.d/debian.sources; \
    else \
        echo "deb https://mirrors.aliyun.com/debian/ bookworm main" > /etc/apt/sources.list && \
        echo "deb https://mirrors.aliyun.com/debian-security/ bookworm-security main" >> /etc/apt/sources.list && \
        echo "deb https://mirrors.aliyun.com/debian/ bookworm-updates main" >> /etc/apt/sources.list; \
    fi

# 安装必要的运行时依赖（已有node，只需要bash和curl）
RUN apt-get update && apt-get install -y bash curl && rm -rf /var/lib/apt/lists/*

# 设置Python符号链接
RUN ln -sf /usr/local/bin/python3.11 /usr/local/bin/python3 && \
    ln -sf /usr/local/bin/python3 /usr/local/bin/python

# 创建根目录下的三个服务目录
RUN mkdir -p /gpt-load /uni-api /uni-load

# 从各构建阶段复制编译好的产物
COPY --from=gpt-load-builder /src/gpt-load /gpt-load/gpt-load
COPY --from=gpt-load-builder /src/config.ini.example /gpt-load/config.ini.example
COPY --from=uni-api-builder /src /uni-api/
COPY --from=uni-api-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=uni-load-builder /app/dist /uni-load/dist
COPY --from=uni-load-builder /app/node_modules /uni-load/node_modules
COPY --from=uni-load-builder /app/package.json /uni-load/package.json
COPY --from=uni-load-builder /app/public /uni-load/public

# 复制启动脚本和配置文件
COPY start.sh /start.sh
COPY gptload-instances.json /uni-load/gptload-instances.json
COPY .env.local /uni-load/.env.local

# 赋予启动脚本执行权限
RUN chmod +x /start.sh

# 暴露端口
EXPOSE 3001 8000 3002

# 设置环境变量
ENV UNI_API_PATH=/uni-api
ENV UNI_API_YAML_PATH=/uni-api/api.yaml
ENV GPTLOAD_INSTANCES_FILE=/uni-load/gptload-instances.json

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3002/api/health || exit 1

# 设置启动命令
CMD ["/start.sh"]