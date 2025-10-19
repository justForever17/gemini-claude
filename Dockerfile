FROM node:20-alpine

# 支持代理参数
ARG HTTP_PROXY
ARG HTTPS_PROXY

# 设置代理（如果提供）
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY}

# 可选：使用国内镜像加速（取消注释以启用）
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Create app directory
WORKDIR /app

# Install build dependencies for bcrypt
# 增加超时时间以适应慢速网络
RUN apk add --no-cache --timeout 600 python3 make g++

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies
# 可选：使用国内 npm 镜像（取消注释以启用）
# RUN npm config set registry https://registry.npmmirror.com
RUN npm ci --only=production --timeout=600000

# Copy source code
COPY src ./src

# Create data directory and set permissions
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app

# 清理代理环境变量
ENV HTTP_PROXY= \
    HTTPS_PROXY=

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 9000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:9000/health || exit 1

# Start server
CMD ["node", "src/server.js"]
