# 快速开始

## 🚀 标准部署（快速网络）

```bash
# 1. 克隆项目
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude

# 2. 启动服务
docker compose up -d

# 3. 访问 http://localhost:9000
# 默认密码：admin123
```

---

## 🐌 慢速网络部署（推荐方案）

### 完整步骤

```bash
# 1. 配置 Docker 镜像加速
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.ccs.tencentyun.com"
  ]
}
EOF
sudo systemctl restart docker

# 2. 克隆项目
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude

# 3. 先拉取基础镜像（重要！）
docker pull node:20-alpine

# 4. 编辑 Dockerfile
# 使用文本编辑器打开 Dockerfile
# 取消注释以下两行（删除行首的 #）：
#   第 10 行：RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
#   第 25 行：RUN npm config set registry https://registry.npmmirror.com

# 5. 构建
docker compose build --no-cache

# 6. 启动
docker compose up -d

# 7. 访问 http://localhost:9000
```

### 一键脚本（推荐）

```bash
#!/bin/bash

# 配置 Docker 镜像加速
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
EOF
sudo systemctl restart docker

# 克隆项目
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude

# 拉取基础镜像
docker pull node:20-alpine

# 自动修改 Dockerfile 启用国内源
sed -i '10s/^# //' Dockerfile  # 取消注释第 10 行
sed -i '25s/^# //' Dockerfile  # 取消注释第 25 行

# 构建并启动
docker compose build --no-cache
docker compose up -d

echo "部署完成！访问 http://localhost:9000"
echo "默认密码：admin123"
```

---

## 🔧 分步说明

### 步骤 1: 配置镜像加速

这是最重要的一步！配置后 Docker 会从国内镜像站拉取镜像。

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
EOF
sudo systemctl restart docker
```

### 步骤 2: 先拉取基础镜像

这样可以避免构建时超时：

```bash
docker pull node:20-alpine
```

如果这一步很慢或超时，说明镜像加速没有生效，请检查步骤 1。

### 步骤 3: 使用国内源

编辑 `Dockerfile`，找到以下两行并删除行首的 `#`：

```dockerfile
# 第 10 行左右
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
改为：
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 第 25 行左右
# RUN npm config set registry https://registry.npmmirror.com
改为：
RUN npm config set registry https://registry.npmmirror.com
```

### 步骤 4: 构建

```bash
docker compose build --no-cache
```

这一步会：
- 使用已拉取的 node:20-alpine 镜像
- 从阿里云镜像安装 Alpine 包
- 从淘宝镜像安装 npm 包

### 步骤 5: 启动

```bash
docker compose up -d
```

---

## ⚠️ 常见问题

### Q: 为什么要先拉取镜像？

A: Docker Compose 构建时拉取镜像有 30 秒超时限制，先拉取可以避免这个问题。

### Q: 镜像加速配置后还是很慢？

A: 尝试其他镜像源：

```json
{
  "registry-mirrors": [
    "https://dockerproxy.com",
    "https://docker.nju.edu.cn",
    "https://docker.mirrors.sjtug.sjtu.edu.cn"
  ]
}
```

### Q: 构建时 npm install 很慢？

A: 确保已取消注释 Dockerfile 第 25 行：
```dockerfile
RUN npm config set registry https://registry.npmmirror.com
```

### Q: 权限错误？

A: 使用 sudo：
```bash
sudo docker compose build --no-cache
sudo docker compose up -d
```

或将用户加入 docker 组：
```bash
sudo usermod -aG docker $USER
# 重新登录生效
```

---

## 🔧 常用命令

```bash
# 查看日志
docker compose logs -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 重新构建
docker compose build --no-cache

# 更新服务
git pull
docker compose build --no-cache
docker compose up -d
```

---

## 📞 需要帮助？

- 详细部署指南：[DEPLOYMENT.md](DEPLOYMENT.md)
- 安全说明：[SECURITY.md](SECURITY.md)
- 问题反馈：[GitHub Issues](https://github.com/justForever17/gemini-claude/issues)
