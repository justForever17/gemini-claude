# Gemini to Claude API Proxy

<div align="left">
  <a href="README_CN.md">🇨🇳 中文</a> | <a href="README.md">🇺🇸 English</a>
</div>

<br>

将 Gemini API 转换为 Claude API 格式的代理服务，支持 Claude Code、Claude code VS Plugin 等客户端。
本项目特别适合与Gemini-balance搭配工作，将白嫖进行到底！

![alt text](image\image.png)

## ✨ 特性

- 🔄 完整的 API 格式转换（Gemini ↔ Claude）
- 🌊 支持流式响应（SSE）
- 🎯 完全兼容 Claude Code / VS Plugin
- 🔐 API Key 认证
- 🎨 Web 管理界面
- 🐳 Docker 一键部署

## 🚀 快速开始

> 💡 **慢速网络？** 查看 [部署指南](docs/DEPLOYMENT.md) 了解国内镜像加速方案

### 使用 Docker Compose（推荐）

1. 克隆项目
```bash
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude
```

2. 配置 Docker 镜像加速（慢速网络必须！）
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

3. 先拉取基础镜像
```bash
docker pull node:20-alpine
```

4. 编辑 Dockerfile 使用国内源
```bash
# 取消注释以下两行：
# 第 10 行：RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
# 第 25 行：RUN npm config set registry https://registry.npmmirror.com
```

5. 构建并启动
```bash
docker compose build --no-cache
docker compose up -d
```

3. 访问管理界面并配置
```
http://localhost:9000
```
- 默认密码：`admin123`
- 登录后在配置页面设置你的 Gemini API Key
- 配置 API URL、模型等参数
- 点击保存并测试连接

### 手动部署

1. 安装依赖
```bash
npm install
```

2. 启动服务
```bash
npm start
```

3. 访问 `http://localhost:9000` 进行配置

## 🔧 配置

所有配置都可以通过 Web 管理界面完成，无需修改配置文件。

### Web 管理界面配置

访问 `http://localhost:9000`，登录后可以配置：

#### 注意！使用Gemini-balance 时，URL后必须手动添加/v1beta
- **Gemini API URL**: Gemini API 地址（默认：`https://generativelanguage.googleapis.com/v1beta`）
- **Gemini API Key**: 你的 Gemini API Key
- **模型选择**: 
  - `gemini-2.5-pro` - 最强大的模型
  - `gemini-2.5-flash` - 速度快，稳定性高
- **本地 API Key**: 用于客户端连接的密钥（自动生成）
- **管理员密码**: Web 界面登录密码

### 环境变量（可选）

如果需要通过环境变量预配置，可以设置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `9000` |
| `GEMINI_API_URL` | Gemini API 地址 | 通过 Web 配置 |
| `GEMINI_API_KEY` | Gemini API Key | 通过 Web 配置 |
| `GEMINI_MODEL` | 使用的模型 | 通过 Web 配置 |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123` |

## 📱 客户端配置

### Claude Code

配置文件位置：
- Windows: `C:\Users\<用户名>\.claude\settings.json`
- macOS/Linux: `~/.claude/settings.json`

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:9000",
    "ANTHROPIC_AUTH_TOKEN": "your-local-api-key",
    "ANTHROPIC_MODEL": "gemini-2.5-pro",
    "ANTHROPIC_SMALL_FAST_MODEL": "gemini-2.5-pro"
  }
}
```

## 🎨 Web 管理界面

访问 `http://localhost:9000` 可以：

- 📊 查看服务状态和连接信息
- ⚙️ 配置 Gemini API（URL、Key、模型）
- 🔑 查看和管理本地 API Key
- 🧪 测试 Gemini API 连接
- 🔐 修改管理员密码

**默认密码**: `admin123`（首次登录后会自动加密存储）

**首次使用流程**:
1. 使用默认密码登录
2. 在配置页面填写你的 Gemini API Key
3. 选择要使用的模型
4. 点击"测试连接"确认配置正确
5. 保存配置
6. 复制本地 API Key 用于客户端配置

## 🔐 API Key 管理

### 获取本地 API Key

1. 访问 Web 界面
2. 登录后在配置页面查看
3. 或查看 `data/config.json` 文件

### 生成新的 API Key

```bash
# 在容器中执行
docker exec gemini-claude-proxy node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📝 API 格式说明

### 请求格式（Claude API）

```json
{
  "model": "****",
  "max_tokens": 1024,
  "system": "You are a helpful assistant.",
  "messages": [
    {
      "role": "user",
      "content": "Hello!"
    }
  ]
}
```

### 响应格式（Claude API）

```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you?",
      "citations": null
    }
  ],
  "model": "***",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 20
  }
}
```

## 🔄 流式响应

支持 Server-Sent Events (SSE) 流式响应：

```bash
curl http://localhost:9000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-local-api-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "***",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## 🐛 故障排除

### 配置无法保存

**症状**: Web 界面保存配置后没有反应，修改密码失败

**原因**: Docker 容器内的 nodejs 用户没有权限写入 `./data` 目录

**解决方案**:
```bash
# 1. 停止容器
docker compose down

# 2. 修复权限
chmod 777 ./data

# 3. 重启
docker compose up -d
```


### 查看日志

```bash
# Docker
docker logs gemini-claude-proxy

# 实时日志
docker logs -f gemini-claude-proxy
```

### 常见问题

**Q: 502 错误 - Gemini API request failed**
- 检查 Gemini API URL 和 Key 是否正确
- 确认网络连接正常
- 尝试切换到 `gemini-2.5-flash` 模型

**Q: 401 错误 - Unauthorized**
- 检查本地 API Key 是否正确
- 确认 Authorization header 格式：`Bearer your-api-key`

**Q: Claude Code 无法连接**
- 确认服务运行在 `http://localhost:9000`
- 检查 `.claude/settings.json` 配置
- 重启 Claude Code

## 🏗️ 项目结构

```
.
├── src/
│   ├── server.js          # 主服务器
│   ├── proxy.js           # API 转换逻辑
│   ├── auth.js            # 认证中间件
│   ├── config.js          # 配置管理
│   └── public/            # Web 界面
│       ├── index.html
│       ├── app.js
│       └── styles.css
├── data/                  # 持久化数据
│   └── config.json
├── docs/                  # 文档
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 🔒 安全说明

**重要**: 你的配置文件（包含 API Key 和密码）不会被上传到 Git 仓库。

- `data/` 目录已在 `.gitignore` 中排除
- 所有敏感信息都存储在本地
- 详细安全说明请查看 [docs/SECURITY.md](docs/SECURITY.md)

**安全建议**:
- 首次登录后立即修改默认密码
- 不要在公开场合分享你的 API Key
- 定期备份配置文件到安全位置

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🔗 相关链接

- [Gemini API 文档](https://ai.google.dev/docs)
- [Claude API 文档](https://docs.anthropic.com/claude/reference)
- [Claude Code](https://www.anthropic.com/claude/code)
- [Continue](https://continue.dev)

## ⭐ Star History

如果这个项目对你有帮助，请给个 Star ⭐️

---

Made with ❤️ by [justForever17](https://github.com/justForever17)
