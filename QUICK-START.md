# 快速开始

## 🚀 一键部署（推荐）

```bash
# 克隆项目
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude

# 设置超长超时时间（重要！避免构建超时）
export DOCKER_BUILDKIT=1
export COMPOSE_HTTP_TIMEOUT=600000
export DOCKER_CLIENT_TIMEOUT=600000

# 启动服务
docker-compose up -d

# 访问 http://localhost:9000
# 默认密码：admin123
```

---

## 🐌 慢速网络？

### 国内用户推荐方案

```bash
# 1. 克隆项目
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude

# 2. 编辑 Dockerfile，取消注释以下两行：
#    第 10 行：RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
#    第 25 行：RUN npm config set registry https://registry.npmmirror.com

# 3. 设置超长超时
export DOCKER_BUILDKIT=1
export COMPOSE_HTTP_TIMEOUT=600000
export DOCKER_CLIENT_TIMEOUT=600000

# 4. 构建并启动
docker-compose build --no-cache
docker-compose up -d
```

---

## 🔧 常用命令

```bash
# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 更新服务
git pull
docker-compose build --no-cache
docker-compose up -d
```

---

## ⚠️ 重要提示

### 必须设置的环境变量

```bash
export DOCKER_BUILDKIT=1              # 启用 BuildKit
export COMPOSE_HTTP_TIMEOUT=600000    # 设置 600000 秒超时
export DOCKER_CLIENT_TIMEOUT=600000   # 设置 Docker 客户端超时
```

**为什么需要这些？**
- Docker 默认 30 秒超时太短
- 慢速网络拉取镜像需要更长时间
- 600000 秒 = 约 166 小时，足够慢速网络使用

### 如果仍然超时

1. **使用国内镜像**（最有效）
   - 编辑 Dockerfile 取消注释镜像源配置

2. **使用代理**
   ```bash
   export HTTP_PROXY=http://your-proxy:port
   export HTTPS_PROXY=http://your-proxy:port
   ```

3. **配置 Docker 镜像加速**
   ```bash
   # 编辑 /etc/docker/daemon.json
   {
     "registry-mirrors": [
       "https://docker.mirrors.ustc.edu.cn"
     ]
   }
   # 重启 Docker
   sudo systemctl restart docker
   ```

---

## 📞 需要帮助？

- 详细部署指南：[DEPLOYMENT.md](DEPLOYMENT.md)
- 安全说明：[SECURITY.md](SECURITY.md)
- 问题反馈：[GitHub Issues](https://github.com/justForever17/gemini-claude/issues)
