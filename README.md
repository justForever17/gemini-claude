# Gemini to Claude API Proxy

<div align="left">
  <a href="README_CN.md">🇨🇳 中文</a> | <a href="README.md">🇺🇸 English</a>
</div>

<br>

A proxy service that converts Gemini API to Claude API format, supporting Claude Code, Claude VS Plugin and other clients.
This project works perfectly with Gemini-balance for ultimate free usage!

## ✨ Features

- 🔄 Complete API format conversion (Gemini ↔ Claude)
- 🌊 Streaming response support (SSE)
- 🎯 Fully compatible with Claude Code / VS Plugin
- 🔐 API Key authentication
- 🎨 Web management interface
- 🐳 One-click Docker deployment

## 🚀 Quick Start

> 💡 **Slow network?** Check [Deployment Guide](docs/DEPLOYMENT.md) for mirror acceleration solutions

### Using Docker Compose (Recommended)

1. Clone the project
```bash
git clone https://github.com/justForever17/gemini-claude.git
cd gemini-claude
```

2. Configure Docker mirror acceleration (for slow networks - Required!)
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

3. Pre-pull base image
```bash
docker pull node:20-alpine
```

4. Edit Dockerfile to use domestic sources
```bash
# Uncomment the following two lines:
# Line 10: RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
# Line 25: RUN npm config set registry https://registry.npmmirror.com
```

5. Build and start
```bash
docker compose build --no-cache
docker compose up -d
```

3. Access management interface and configure
```
http://localhost:9000
```
- Default password: `admin123`
- Login and set your Gemini API Key in the configuration page
- Configure API URL, model and other parameters
- Click save and test connection

### Manual Deployment

1. Install dependencies
```bash
npm install
```

2. Start service
```bash
npm start
```

3. Visit `http://localhost:9000` for configuration

## 🔧 Configuration

All configurations can be completed through the Web management interface without modifying configuration files.

### Web Management Interface Configuration

Visit `http://localhost:9000`, login and configure:

#### Note! When using Gemini-balance, you must manually add /v1beta to the URL
- **Gemini API URL**: Gemini API address (default: `https://generativelanguage.googleapis.com/v1beta`)
- **Gemini API Key**: Your Gemini API Key
- **Model Selection**: 
  - `gemini-2.5-pro` - Most powerful model
  - `gemini-2.5-flash` - Fast and stable
- **Local API Key**: Key for client connections (auto-generated)
- **Admin Password**: Web interface login password

### Environment Variables (Optional)

If you need to pre-configure via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `9000` |
| `GEMINI_API_URL` | Gemini API address | Configure via Web |
| `GEMINI_API_KEY` | Gemini API Key | Configure via Web |
| `GEMINI_MODEL` | Model to use | Configure via Web |
| `ADMIN_PASSWORD` | Admin password | `admin123` |

## 📱 Client Configuration

### Claude Code

Configuration file location:
- Windows: `C:\Users\<username>\.claude\settings.json`
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

## 🎨 Web Management Interface

Visit `http://localhost:9000` to:

- 📊 View service status and connection info
- ⚙️ Configure Gemini API (URL, Key, model)
- 🔑 View and manage local API Key
- 🧪 Test Gemini API connection
- 🔐 Change admin password

**Default password**: `admin123` (automatically encrypted after first login)

**First-time usage flow**:
1. Login with default password
2. Fill in your Gemini API Key in configuration page
3. Select model to use
4. Click "Test Connection" to confirm configuration
5. Save configuration
6. Copy local API Key for client configuration

## 🔐 API Key Management

### Get Local API Key

1. Visit Web interface
2. View in configuration page after login
3. Or check `data/config.json` file

### Generate New API Key

```bash
# Execute in container
docker exec gemini-claude-proxy node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📝 API Format Description

### Request Format (Claude API)

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

### Response Format (Claude API)

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

## 🔄 Streaming Response

Supports Server-Sent Events (SSE) streaming response:

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

## 🐛 Troubleshooting

### Configuration Cannot Be Saved

**Symptoms**: No response after saving configuration in Web interface, password change fails

**Cause**: The nodejs user in Docker container doesn't have permission to write to `./data` directory

**Solution**:
```bash
# 1. Stop container
docker compose down

# 2. Fix permissions
chmod 777 ./data

# 3. Restart
docker compose up -d
```

### View Logs

```bash
# Docker
docker logs gemini-claude-proxy

# Real-time logs
docker logs -f gemini-claude-proxy
```

### Common Issues

**Q: 502 Error - Gemini API request failed**
- Check if Gemini API URL and Key are correct
- Confirm network connection is normal
- Try switching to `gemini-2.5-flash` model

**Q: 401 Error - Unauthorized**
- Check if local API Key is correct
- Confirm Authorization header format: `Bearer your-api-key`

**Q: Claude Code cannot connect**
- Confirm service is running on `http://localhost:9000`
- Check `.claude/settings.json` configuration
- Restart Claude Code

## 🏗️ Project Structure

```
.
├── src/
│   ├── server.js          # Main server
│   ├── proxy.js           # API conversion logic
│   ├── auth.js            # Authentication middleware
│   ├── config.js          # Configuration management
│   └── public/            # Web interface
│       ├── index.html
│       ├── app.js
│       └── styles.css
├── data/                  # Persistent data
│   └── config.json
├── docs/                  # Documentation
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 🔒 Security Notes

**Important**: Your configuration files (containing API Keys and passwords) will not be uploaded to Git repository.

- `data/` directory is excluded in `.gitignore`
- All sensitive information is stored locally
- For detailed security instructions, see [docs/SECURITY.md](docs/SECURITY.md)

**Security recommendations**:
- Change default password immediately after first login
- Don't share your API Key in public
- Regularly backup configuration files to secure location

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📄 License

MIT License

## 🔗 Related Links

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Claude API Documentation](https://docs.anthropic.com/claude/reference)
- [Claude Code](https://www.anthropic.com/claude/code)
- [Continue](https://continue.dev)

## ⭐ Star History

If this project helps you, please give it a Star ⭐️

---

Made with ❤️ by [justForever17](https://github.com/justForever17)
