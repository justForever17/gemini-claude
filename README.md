# Gemini-Claude Proxy

A lightweight API proxy service that converts between Anthropic Claude API format and third-party Gemini API format. This allows you to use Claude Code, Claude VSCode plugin, and other Claude-compatible tools with Gemini API endpoints.

## Features

- 🔄 Bidirectional API conversion (Claude ↔ Gemini)
- 🌊 Streaming response support
- 🔐 Password-protected configuration interface
- 🎨 Light/Dark theme support
- 🔑 Local API key generation
- 📊 Real-time connectivity monitoring
- 🐳 Docker containerization
- 💾 Persistent configuration storage

## Quick Start

### Using Docker Compose (Recommended)

1. Clone this repository
2. Create a `.env` file (optional):

```env
ADMIN_PASSWORD=your_secure_password
GEMINI_API_URL=https://your-gemini-api-endpoint.com/v1beta
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL_NAME=gemini-1.5-pro-latest
```

3. Start the service:

```bash
docker-compose up -d
```

4. Access the configuration UI at `http://localhost:9000`

### Using Docker

```bash
# Build the image
docker build -t gemini-claude-proxy .

# Run the container
docker run -d \
  -p 9000:9000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_PASSWORD=your_password \
  -e GEMINI_API_URL=https://your-api-endpoint.com/v1beta \
  -e GEMINI_API_KEY=your_api_key \
  -e GEMINI_MODEL_NAME=gemini-1.5-pro-latest \
  --name gemini-claude-proxy \
  gemini-claude-proxy
```

### Using Node.js

```bash
# Install dependencies
npm install

# Set environment variables (optional)
export ADMIN_PASSWORD=your_password
export GEMINI_API_URL=https://your-api-endpoint.com/v1beta
export GEMINI_API_KEY=your_api_key
export GEMINI_MODEL_NAME=gemini-1.5-pro-latest

# Start the server
npm start
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_PASSWORD` | Initial admin password for configuration UI | `admin123` |
| `GEMINI_API_URL` | Third-party Gemini API base URL | Empty |
| `GEMINI_API_KEY` | API key for Gemini service | Empty |
| `GEMINI_MODEL_NAME` | Gemini model name | `gemini-1.5-pro-latest` |
| `PORT` | Server port | `9000` |

### Configuration UI

1. Navigate to `http://localhost:9000`
2. Login with your admin password
3. Configure:
   - **Gemini API URL**: Your third-party Gemini API endpoint
   - **Gemini API Key**: Your API key for the Gemini service
   - **Gemini Model Name**: The model to use (e.g., `gemini-1.5-pro-latest`)
   - **Local API Key**: Generated key for downstream clients (can be regenerated)
4. Save configuration and verify connectivity

### Using with Claude Clients

#### Claude Code / VSCode Plugin

1. Open settings
2. Set API endpoint to: `http://localhost:9000`
3. Set API key to: The local API key from the configuration UI
4. Select any Claude model (the proxy will use your configured Gemini model)

## API Endpoints

### Proxy Endpoint

**POST** `/v1/messages`

Accepts Claude API format requests and returns Claude API format responses.

**Headers:**
- `Authorization: Bearer <local_api_key>`
- `Content-Type: application/json`

**Example Request:**
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ]
}
```

### Configuration API

All configuration endpoints require the `x-session-token` header obtained from login.

- **POST** `/api/login` - Authenticate admin user
- **GET** `/api/config` - Get current configuration
- **POST** `/api/config` - Update configuration
- **POST** `/api/test-connection` - Test Gemini API connectivity
- **POST** `/api/generate-key` - Generate new local API key
- **POST** `/api/change-password` - Change admin password

## Data Persistence

Configuration is stored in `/app/data/config.json` inside the container. When using Docker, mount a volume to persist data across container restarts:

```bash
-v $(pwd)/data:/app/data
```

## Security Considerations

- Change the default admin password immediately
- Use HTTPS in production (consider using a reverse proxy like nginx)
- Keep your Gemini API key secure
- Regenerate the local API key if compromised
- The configuration file contains sensitive data - protect it appropriately

## Troubleshooting

### Connection Test Fails

- Verify the Gemini API URL is correct and accessible
- Check that the API key is valid
- Ensure the model name is supported by your Gemini API endpoint
- Check network connectivity from the container

### Proxy Requests Fail

- Verify the local API key is correct
- Check that the Gemini API configuration is saved
- Review server logs: `docker logs gemini-claude-proxy`

### Configuration Not Persisting

- Ensure the data volume is properly mounted
- Check file permissions on the data directory
- Verify the container has write access to `/app/data`

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
