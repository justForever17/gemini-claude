# 部署指南

## 🚀 标准部署

### 1. 克隆项目
```bash
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude
```

### 2. 启动服务
```bash
# 启动服务
docker-compose up -d
```

### 3. 访问配置
访问 `http://localhost:9000`，使用默认密码 `admin123` 登录并配置。

---

## 🐌 慢速网络环境部署

如果你的网络环境较慢（如国内网络），可以使用以下优化方案：

### 步骤 1: 使用docker镜像源

```bash
# 配置docker镜像源（重要！）
{
  "registry-mirrors": [
    "https://docker.xuanyuan.me",
    "https://docker.1ms.run",
    "https://hub-mirror.c.163.com"
  ]
}

# 先拉取镜像（网速给力则跳过）
docker pull node:20-alpine

# 启动服务
docker-compose up -d
```

### 步骤 2: 使用国内镜像源

1. 编辑 `Dockerfile`，取消注释以下两行：

```dockerfile
# 第 10 行左右
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 第 25 行左右
RUN npm config set registry https://registry.npmmirror.com
```

2. 设置超时并构建：

```bash
# 启动
docker-compose up -d
```

## 🔧 构建问题排查

### 问题 1: npm install 超时

**症状**：
```
npm ERR! network timeout
```

**解决方案**：
1. 使用国内 npm 镜像
2. 使用代理
3. 增加超时时

### 问题 2: apk add 失败

**症状**：
```
ERROR: unable to select packages
```

**解决方案**：
1. 使用国内 Alpine 镜像
2. 检查网络连接
3. 重试构建

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

配置文件存储在 `./data` 目录，更新不会影响现有配置。（docker部署需要提权）

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
