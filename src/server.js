const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { loadConfig, saveConfig, validateConfig, generateApiKey } = require('./config');
const { hashPassword, verifyPassword, createSession, requireSession, requireApiKey, clearAllSessions } = require('./auth');
const {
  buildGeminiUrl,
  claudeToGeminiRequest,
  geminiToClaudeResponse,
  generateMessageId,
  GeminiStreamParser,
  ClaudeStreamConverter,
  formatClaudeSSE,
  initializeMCP,
  getMCPIntegration
} = require('./proxy');

const app = express();
const PORT = process.env.PORT || 9000;
const REQUEST_SIZE_LIMIT = process.env.REQUEST_SIZE_LIMIT || '200mb';

// ==================== 缓存系统 ====================
class RequestCache {
  constructor(ttl = 24 * 60 * 60 * 1000) {
    this.cache = new Map();
    this.ttl = ttl;
    this.stats = { hits: 0, misses: 0, total: 0 };
  }

  generateKey(data) {
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  }

  get(key) {
    this.stats.total++;
    const entry = this.cache.get(key);
    
    if (!entry || Date.now() - entry.timestamp > this.ttl) {
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.data;
  }

  set(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  getHitRate() {
    return this.stats.total > 0 
      ? ((this.stats.hits / this.stats.total) * 100).toFixed(1) 
      : 0;
  }
}

const cache = new RequestCache();

// ==================== 请求队列 ====================
class RequestQueue {
  constructor(maxConcurrent = 3, minInterval = 200) {
    this.maxConcurrent = maxConcurrent;
    this.minInterval = minInterval;
    this.running = 0;
    this.lastRequestTime = 0;
  }

  async add(fn) {
    // 等待并发槽位
    while (this.running >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // 等待最小间隔
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minInterval - timeSinceLastRequest)
      );
    }
    
    this.running++;
    this.lastRequestTime = Date.now();
    
    try {
      return await fn();
    } finally {
      this.running--;
    }
  }
}

const queue = new RequestQueue(3, 200); // 最多3个并发，间隔200ms

// ==================== 请求统计 ====================
const stats = {
  total: 0,
  cached: 0,
  errors: 0,
  byType: {},
  startTime: Date.now()
};

function identifyRequestType(body) {
  const content = body.messages?.[0]?.content?.[0]?.text || '';
  
  if (content.includes('Please write a 5-10 word title') || 
      content.includes('Summarize this coding conversation')) {
    return 'TITLE';
  }
  if (content.includes('Analyze if this message indicates a new conversation topic')) {
    return 'TOPIC';
  }
  if (content.includes('You are Claude Code') && content.length < 500) {
    return 'WARMUP';
  }
  if (body.tools && body.tools.length > 10) {
    return 'TOOLS';
  }
  return 'NORMAL';
}

// Load configuration
let config = loadConfig();

// Initialize MCP integration
let mcpIntegration = null;

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Admin endpoints (unchanged)
app.post('/api/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({
        error: { type: 'validation_error', message: 'Password is required' }
      });
    }
    
    let isValid;
    if (config.adminPassword.startsWith('$2b$')) {
      isValid = await verifyPassword(password, config.adminPassword);
    } else {
      isValid = password === config.adminPassword;
      if (isValid) {
        config.adminPassword = await hashPassword(password);
        saveConfig(config);
      }
    }
    
    if (!isValid) {
      return res.status(401).json({
        error: { type: 'authentication_error', message: 'Invalid password' }
      });
    }
    
    const token = createSession();
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: { type: 'server_error', message: 'Login failed' }
    });
  }
});

app.get('/api/config', requireSession, (req, res) => {
  try {
    const { adminPassword, ...safeConfig } = config;
    res.json(safeConfig);
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({
      error: { type: 'server_error', message: 'Failed to get configuration' }
    });
  }
});

app.post('/api/config', requireSession, async (req, res) => {
  try {
    const updates = req.body;
    const newConfig = { ...config, ...updates };
    const validated = validateConfig(newConfig);
    
    if (saveConfig(validated)) {
      config = validated;
      const { adminPassword, ...safeConfig } = config;
      res.json(safeConfig);
    } else {
      res.status(500).json({
        error: { type: 'server_error', message: 'Failed to save configuration' }
      });
    }
  } catch (error) {
    console.error('Update config error:', error);
    res.status(400).json({
      error: { type: 'validation_error', message: error.message }
    });
  }
});

app.post('/api/test-connection', requireSession, async (req, res) => {
  try {
    if (!config.geminiApiUrl || !config.geminiApiKey) {
      return res.json({ connected: false, error: 'API URL or key not configured' });
    }
    
    const testUrl = `${config.geminiApiUrl}/models/${config.defaultGeminiModel}:generateContent?key=${config.geminiApiKey}`;
    
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-client': 'genai-js/0.21.0'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 64000 }
      })
    });
    
    const responseText = await response.text();
    console.log('Connection test response:', response.status, responseText);
    
    res.json({ 
      connected: response.ok,
      status: response.status,
      error: response.ok ? null : responseText
    });
  } catch (error) {
    console.error('Connection test error:', error);
    res.json({ connected: false, error: error.message });
  }
});

app.post('/api/generate-key', requireSession, (req, res) => {
  try {
    config.localApiKey = generateApiKey();
    if (saveConfig(config)) {
      res.json({ localApiKey: config.localApiKey });
    } else {
      res.status(500).json({
        error: { type: 'server_error', message: 'Failed to save new API key' }
      });
    }
  } catch (error) {
    console.error('Generate key error:', error);
    res.status(500).json({
      error: { type: 'server_error', message: 'Failed to generate API key' }
    });
  }
});

app.post('/api/change-password', requireSession, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: { type: 'validation_error', message: 'Both passwords are required' }
      });
    }
    
    let isValid;
    if (config.adminPassword.startsWith('$2b$')) {
      isValid = await verifyPassword(currentPassword, config.adminPassword);
    } else {
      isValid = currentPassword === config.adminPassword;
    }
    
    if (!isValid) {
      return res.status(401).json({
        error: { type: 'authentication_error', message: 'Current password is incorrect' }
      });
    }
    
    config.adminPassword = await hashPassword(newPassword);
    if (saveConfig(config)) {
      clearAllSessions();
      res.json({ success: true });
    } else {
      res.status(500).json({
        error: { type: 'server_error', message: 'Failed to save new password' }
      });
    }
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: { type: 'server_error', message: 'Failed to change password' }
    });
  }
});

// ==================== 优化的代理端点 ====================
app.post('/v1/messages', requireApiKey(config), async (req, res) => {
  stats.total++;
  const requestType = identifyRequestType(req.body);
  stats.byType[requestType] = (stats.byType[requestType] || 0) + 1;
  
  try {
    const claudeRequest = req.body;
    
    // 🔥 关键优化：只移除明确不需要工具的请求类型的工具定义
    // 保留所有正常编程请求的工具！
    const originalToolCount = claudeRequest.tools?.length || 0;
    if (originalToolCount > 0) {
      // 只有标题生成、话题分析、Warmup 这些元数据请求才移除工具
      // 这些请求不涉及实际编程工作
      if (requestType === 'TITLE' || requestType === 'TOPIC' || requestType === 'WARMUP') {
        console.log(`🧹 移除 ${originalToolCount} 个工具定义（${requestType} 是元数据请求，不需要工具）`);
        claudeRequest.tools = [];
      }
      // 所有其他请求（NORMAL、TOOLS）保留完整的工具定义
      // 这些是实际的编程请求，必须有工具才能工作
    }
    const messageId = generateMessageId();
    const isStreaming = claudeRequest.stream === true;
    
    // 生成缓存键
    const cacheKey = cache.generateKey(claudeRequest);
    
    // 检查缓存（只缓存非流式请求）
    if (!isStreaming) {
      const cachedResponse = cache.get(cacheKey);
      if (cachedResponse) {
        stats.cached++;
        console.log(`✅ 缓存命中 [${requestType}] - 命中率: ${cache.getHitRate()}%`);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('anthropic-version', '2023-06-01');
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedResponse);
      }
    }
    
    console.log(`📨 新请求 [${requestType}] #${stats.total} - 队列处理中...`);
    
    // 使用队列处理请求
    await queue.add(async () => {
      const geminiRequest = claudeToGeminiRequest(claudeRequest);
      const geminiUrl = buildGeminiUrl(config, isStreaming, claudeRequest.model);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      
      let response;
      try {
        response = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-client': 'genai-js/0.21.0'
          },
          body: JSON.stringify(geminiRequest),
          signal: controller.signal
        });
        clearTimeout(timeout);
      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          stats.errors++;
          console.error('❌ 请求超时');
          return res.status(504).json({
            error: { type: 'timeout_error', message: 'Request timeout' }
          });
        }
        throw fetchError;
      }
      
      if (!response.ok) {
        stats.errors++;
        const error = await response.text();
        console.error(`❌ Gemini API 错误 [${response.status}]:`, error);
        
        // Map Gemini error codes to Claude error types
        const errorMap = {
          400: {
            type: 'invalid_request_error',
            message: 'Invalid request parameters',
            hint: 'Check tool definitions and request format'
          },
          401: {
            type: 'authentication_error',
            message: 'Invalid API key',
            hint: 'Verify your Gemini API key is correct'
          },
          403: {
            type: 'permission_error',
            message: 'Permission denied',
            hint: 'Check API key permissions'
          },
          429: {
            type: 'rate_limit_error',
            message: 'API rate limit exceeded',
            hint: 'Reduce request frequency or upgrade quota'
          },
          500: {
            type: 'api_error',
            message: 'Gemini API internal error',
            hint: 'This is a Gemini server issue, try again later'
          },
          503: {
            type: 'overloaded_error',
            message: 'Gemini API temporarily unavailable',
            hint: 'Service is overloaded, retry with exponential backoff'
          }
        };
        
        const mapped = errorMap[response.status] || {
          type: 'api_error',
          message: 'Unknown Gemini API error',
          hint: 'Check Gemini API status'
        };
        
        // Enhanced debugging for tool-related errors
        if ((response.status === 400 || response.status === 500) && geminiRequest.tools) {
          console.error('🔍 Request contained tools - debugging information:');
          console.error(`   Tool count: ${geminiRequest.tools[0]?.function_declarations?.length || 0}`);
          
          // Check for common issues
          const hasFunctionResponse = geminiRequest.contents.some(content => 
            content.parts && content.parts.some(part => part.functionResponse)
          );
          
          if (hasFunctionResponse) {
            console.error('   ⚠️  Request contains functionResponse');
            console.error('   This should NOT have tools definition (Gemini limitation)');
          }
          
          // Check each tool for suspicious fields
          if (geminiRequest.tools[0]?.function_declarations) {
            geminiRequest.tools[0].function_declarations.forEach((tool, idx) => {
              console.error(`   [${idx}] ${tool.name}:`);
              console.error(`       Parameters keys: ${Object.keys(tool.parameters || {}).join(', ')}`);
              
              const paramStr = JSON.stringify(tool.parameters);
              const suspiciousFields = [
                'additionalProperties', '$schema', 'format', 'pattern',
                'minLength', 'maxLength', 'minItems', 'maxItems',
                'minimum', 'maximum'
              ];
              const found = suspiciousFields.filter(field => paramStr.includes(`"${field}"`));
              if (found.length > 0) {
                console.error(`       ⚠️  Unsupported fields found: ${found.join(', ')}`);
                console.error(`       These fields should have been removed!`);
              }
            });
          }
          
          // For small tool sets, dump full definition
          if (geminiRequest.tools[0]?.function_declarations?.length <= 3) {
            console.error('   Full tools definition:');
            console.error(JSON.stringify(geminiRequest.tools, null, 2));
          }
        }
        
        // Return Claude-compatible error
        return res.status(502).json({
          error: { 
            type: mapped.type,
            message: mapped.message,
            details: error,
            hint: mapped.hint
          }
        });
      }
      
      if (isStreaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('anthropic-version', '2023-06-01');
        
        const parser = new GeminiStreamParser();
        const converter = new ClaudeStreamConverter(claudeRequest.model || config.defaultGeminiModel || 'gemini-2.5-flash', messageId);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const events = parser.parse(chunk);
            
            for (const geminiData of events) {
              const claudeEvents = converter.convertChunk(geminiData);
              for (const { event, data } of claudeEvents) {
                res.write(formatClaudeSSE(event, data));
              }
            }
          }
          
          const finalEvents = converter.finalize();
          for (const { event, data } of finalEvents) {
            res.write(formatClaudeSSE(event, data));
          }
          
          res.end();
        } catch (streamError) {
          console.error('❌ 流错误:', streamError);
          res.write(formatClaudeSSE('error', {
            type: 'stream_error',
            message: streamError.message
          }));
          res.end();
        }
      } else {
        const geminiResponse = await response.json();
        const claudeResponse = geminiToClaudeResponse(
          geminiResponse, 
          claudeRequest.model || config.defaultGeminiModel || 'gemini-2.5-flash',
          messageId
        );
        
        // 存入缓存
        cache.set(cacheKey, claudeResponse);
        
        console.log(`✅ 请求完成 [${requestType}] - 缓存已更新`);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('anthropic-version', '2023-06-01');
        res.setHeader('X-Cache', 'MISS');
        res.json(claudeResponse);
      }
    });
    
  } catch (error) {
    stats.errors++;
    console.error('❌ 代理错误:', error);
    res.status(500).json({
      error: { type: 'server_error', message: error.message }
    });
  }
});

// 统计端点
app.get('/api/stats', (req, res) => {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = (stats.total / elapsed).toFixed(2);
  
  res.json({
    uptime: `${elapsed.toFixed(1)}s`,
    total: stats.total,
    cached: stats.cached,
    errors: stats.errors,
    rate: `${rate} req/s`,
    cacheHitRate: `${cache.getHitRate()}%`,
    byType: stats.byType,
    queue: {
      running: queue.running,
      maxConcurrent: queue.maxConcurrent
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.statusCode || 500).json({
    error: {
      type: err.type || 'server_error',
      message: err.message || 'Internal server error'
    }
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: { type: 'not_found', message: 'Endpoint not found' }
  });
});

// Start server
app.listen(PORT, async () => {
  console.log('\n' + '═'.repeat(80));
  console.log('🚀 Gemini-Claude MCP桥接服务器');
  console.log('═'.repeat(80));

  // Initialize MCP integration if configured
  try {
    if (config.mcpServers && config.mcpServers.length > 0) {
      mcpIntegration = await initializeMCP(config);
      console.log('✅ MCP集成已启动');
    } else {
      console.log('ℹ️ 未配置MCP服务器，仅运行原生工具支持');
    }
  } catch (error) {
    console.error('⚠️ MCP集成启动失败:', error.message);
  }

  console.log(`📊 配置界面: http://localhost:${PORT}`);
  console.log(`🔌 代理端点: http://localhost:${PORT}/v1/messages`);
  console.log(`📈 统计信息: http://localhost:${PORT}/api/stats`);
  console.log(`\n✨ 功能特性:`);
  console.log(`   ✅ 请求缓存 (24小时)`);
  console.log(`   ✅ 请求队列 (最多3个并发)`);
  console.log(`   ✅ 速率限制 (200ms间隔)`);
  console.log(`   ✅ MCP协议支持`);
  console.log(`   ✅ 请求统计`);
  console.log('═'.repeat(80) + '\n');
});

// 定期输出统计
setInterval(() => {
  if (stats.total > 0) {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const rate = (stats.total / elapsed).toFixed(2);
    console.log(`📊 统计: ${stats.total}个请求 | ${stats.cached}个缓存 | 命中率${cache.getHitRate()}% | ${rate} req/s`);
  }
}, 30000);
