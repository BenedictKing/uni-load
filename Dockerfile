# --- 阶段 1: 构建 gpt-load ---
FROM docker.1ms.run/golang:1.24.6-bookworm AS gpt-load-builder

# 复制bun从官方容器
COPY --from=docker.1ms.run/oven/bun:latest /usr/local/bin/bun /usr/local/bin/bun

# 设置bun环境变量和node符号链接
ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bun-node-fallback-bin"
RUN mkdir -p /usr/local/bun-node-fallback-bin && \
    ln -s /usr/local/bin/bun /usr/local/bun-node-fallback-bin/node
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/go"
ENV PATH="${GOPATH}/bin:${PATH}"
ENV GOROOT="/usr/local/go"

# 设置Go代理为中国镜像
ENV GO111MODULE=on
ENV GOPROXY=https://mirrors.aliyun.com/goproxy/
ENV GOSUMDB=sum.golang.google.cn
# 禁用Go自动下载更新
ENV GOTOOLCHAIN=local

WORKDIR /src

# 使用ghfast.top GitHub加速镜像
RUN git clone https://ghfast.top/https://github.com/tbphp/gpt-load.git . || \
    git clone https://github.com/tbphp/gpt-load.git .

# 修改 gpt-load 的 group_handler.go 文件：将 3(.*)30 替换为 3($1)100
RUN sed -i 's/3\(.*\)30/3\1100/g' internal/handler/group_handler.go

# 为 gpt-load 的 GroupID 和 Status 字段添加数据库索引以优化查询
RUN sed -i "s/uniqueIndex:idx_group_key\"/uniqueIndex:idx_group_key;index:idx_group_status\"/" internal/models/types.go && \
    sed -i "s/default:'active'\"/default:'active';index:idx_group_status\"/" internal/models/types.go

# 使用bun构建前端
RUN cd web && \
    rm -f package-lock.json yarn.lock pnpm-lock.yaml bun.lock && \
    echo '[install]\nregistry = "https://registry.npmmirror.com/"' > ./bunfig.toml
RUN cd web && bun install
RUN cd web && bun vite build

# 先下载go模块依赖
RUN go mod download && go mod verify

# 然后编译
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/gpt-load .

# --- 阶段 2: 构建 uni-api (使用其自己的Dockerfile) ---
FROM docker.1ms.run/python:3.11.13-bookworm AS uni-api-builder

WORKDIR /src

# 克隆uni-api项目
RUN git clone https://ghfast.top/https://github.com/yym68686/uni-api.git . || \
    git clone https://github.com/yym68686/uni-api.git .

# 克隆uni-api-core项目
RUN git clone https://ghfast.top/https://github.com/yym68686/uni-api-core.git core || \
git clone https://github.com/yym68686/uni-api-core.git core

COPY patches/uni-api-utils.patch uni-api-utils.patch
RUN patch -p1 < uni-api-utils.patch

# --- 阶段 3: 构建 uni-load (本项目) ---
FROM docker.1ms.run/oven/bun:latest AS uni-load-builder

WORKDIR /src
COPY package.json ./

# 使用淘宝npm镜像
RUN echo '[install]\nregistry = "https://registry.npmmirror.com/"' > ./bunfig.toml
RUN bun install
COPY . ./
RUN bun run build

# --- 最终阶段: 组合所有服务 ---
FROM docker.1ms.run/node:18-slim

# 复制Python和uv
COPY --from=docker.1ms.run/python:3.11.13-bookworm /usr/local/bin/python* /usr/local/bin/
COPY --from=docker.1ms.run/python:3.11.13-bookworm /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=docker.1ms.run/python:3.11.13-bookworm /usr/local/lib/libpython* /usr/local/lib/
COPY --from=docker.1ms.run/astral/uv /uv /uvx /bin/

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
COPY --from=gpt-load-builder /app/gpt-load /gpt-load/gpt-load
COPY --from=gpt-load-builder /src/web/dist /gpt-load/web/dist
COPY --from=gpt-load-builder /src/.env.example /gpt-load/.env.example

COPY --from=uni-load-builder /src/dist /uni-load/dist
COPY --from=uni-load-builder /src/public /uni-load/public
COPY --from=uni-load-builder /src/.env.example /uni-load/.env.example
COPY --from=uni-load-builder /src/package.json /uni-load/package.json
COPY --from=uni-load-builder /src/node_modules /uni-load/node_modules
COPY --from=uni-load-builder /src/start.sh /start.sh

# 按照uni-api的Dockerfile构建（使用项目自己的pyproject.toml）
COPY --from=uni-api-builder /src/pyproject.toml /uni-api/
# RUN cd /uni-api && uv sync -i https://mirrors.aliyun.com/pypi/simple/
RUN cd /uni-api && uv pip install --system --no-cache-dir . -i https://mirrors.aliyun.com/pypi/simple/
COPY --from=uni-api-builder /src /uni-api
# ENV PATH="/uni-api/.venv/bin:$PATH"

# 赋予启动脚本执行权限
RUN chmod +x /start.sh

# 暴露端口
EXPOSE 3001 3002 3003

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3002/api/health || exit 1

# 设置启动命令
CMD ["/start.sh"]
