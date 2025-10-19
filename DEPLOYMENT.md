# 部署指南

## 🚀 标准部署

### 1. 克隆项目
```bash
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude
```

### 2. 启动服务
```bash
docker-compose up -d
```

### 3. 访问配置
访问 `http://localhost:9000`，使用默认密码 `admin123` 登录并配置。

---

## 🐌 慢速网络环境部署

如果你的网络环境较慢（如国内网络），可以使用以下优化方案：

### 方案 1: 使用代理

```bash
# 设置代理环境变量
export HTTP_PROXY=http://your-proxy:port
export HTTPS_PROXY=http://your-proxy:port

# 构建镜像
docker-compose build --no-cache

# 启动服务
docker-compose up -d
```

### 方案 2: 使用国内镜像源

1. 编辑 `Dockerfile`，取消注释以下两行：

```dockerfile
# 第 10 行左右
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 第 25 行左右
RUN npm config set registry https://registry.npmmirror.com
```

2. 构建并启动：

```bash
docker-compose build --no-cache
docker-compose up -d
```

### 方案 3: 增加超时时间

Dockerfile 已经配置了较长的超时时间：
- APK 安装超时：600 秒
- NPM 安装超时：600 秒（10 分钟）

如果仍然超时，可以进一步增加：

```dockerfile
# 修改 Dockerfile 中的超时参数
RUN apk add --no-cache --timeout 1200 python3 make g++
RUN npm ci --only=production --timeout=1200000
```

### 方案 4: 分步构建

如果一次性构建失败，可以分步进行：

```bash
# 1. 先拉取基础镜像
docker pull node:20-alpine

# 2. 构建镜像（不使用缓存）
docker-compose build --no-cache

# 3. 如果失败，重试构建
docker-compose build

# 4. 启动服务
docker-compose up -d
```

---

## 🔧 构建问题排查

### 问题 1: npm install 超时

**症状**：
```
npm ERR! network timeout
```

**解决方案**：
1. 使用国内 npm 镜像（方案 2）
2. 使用代理（方案 1）
3. 增加超时时间（方案 3）

### 问题 2: apk add 失败

**症状**：
```
ERROR: unable to select packages
```

**解决方案**：
1. 使用国内 Alpine 镜像（方案 2）
2. 检查网络连接
3. 重试构建

### 问题 3: Docker 拉取镜像慢

**症状**：
```
Pulling from library/node...
```

**解决方案**：

配置 Docker 使用国内镜像源：

```bash
# Linux/Mac
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
EOF
sudo systemctl restart docker

# Windows
# 在 Docker Desktop 设置中添加镜像源
```

---

## 📦 预构建镜像（推荐）

如果构建仍然很慢，可以使用预构建的 Docker 镜像：

```bash
# 拉取预构建镜像（待发布）
docker pull justforever17/gemini-claude:latest

# 修改 docker-compose.yml
# 将 build: . 改为 image: justforever17/gemini-claude:latest

# 启动服务
docker-compose up -d
```

---

## 🌐 无 Docker 环境部署

如果无法使用 Docker，可以直接运行：

### 前置要求
- Node.js 20+
- npm 或 yarn

### 部署步骤

```bash
# 1. 克隆项目
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude

# 2. 安装依赖（使用国内镜像）
npm config set registry https://registry.npmmirror.com
npm install

# 3. 启动服务
npm start

# 4. 访问 http://localhost:9000
```

---

## 🔄 更新部署

### 更新代码

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建
docker-compose build --no-cache

# 3. 重启服务
docker-compose down
docker-compose up -d
```

### 保留配置

配置文件存储在 `./data` 目录，更新不会影响现有配置。

---

## 🐛 常见问题

### Q: 构建时间过长

A: 
1. 使用国内镜像源（最有效）
2. 使用代理
3. 等待完成（首次构建较慢，后续会使用缓存）

### Q: 端口 9000 被占用

A: 修改 `docker-compose.yml` 中的端口映射：
```yaml
ports:
  - "8080:9000"  # 改为其他端口
```

### Q: 权限问题

A: 
```bash
# Linux/Mac
sudo chown -R $USER:$USER ./data

# 或使用 sudo 运行
sudo docker-compose up -d
```

### Q: 配置丢失

A: 
配置存储在 `./data/config.json`，确保：
1. 该目录有写入权限
2. 没有被 Docker 卷覆盖
3. 定期备份该文件

---

## 📞 获取帮助

如果遇到部署问题：

1. 查看日志：`docker-compose logs -f`
2. 检查容器状态：`docker-compose ps`
3. 提交 Issue：[GitHub Issues](https://github.com/justForever17/gemini-claude/issues)

---

## 🎯 生产环境部署

生产环境建议：

1. **使用反向代理**（Nginx/Caddy）
2. **启用 HTTPS**
3. **配置防火墙**
4. **定期备份配置**
5. **监控服务状态**
6. **使用强密码**

详细的生产环境配置请参考 [SECURITY.md](SECURITY.md)。
