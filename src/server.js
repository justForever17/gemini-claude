const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadConfig, saveConfig, validateConfig, generateApiKey } = require('./config');
const { hashPassword, verifyPassword, createSession, requireSession, requireApiKey, clearAllSessions } = require('./auth');
const { 
  buildGeminiUrl, 
  claudeToGeminiRequest, 
  geminiToClaudeResponse, 
  generateMessageId,
  GeminiStreamParser,
  ClaudeStreamConverter,
  formatClaudeSSE
} = require('./proxy');

const app = express();
const PORT = process.env.PORT || 9000;

// Request size limit - can be configured via environment variable
// Set to a very high value to support large projects and contexts
const REQUEST_SIZE_LIMIT = process.env.REQUEST_SIZE_LIMIT || '200mb';

// Load configuration
let config = loadConfig();

// Request logging middleware with size tracking
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const size = req.headers['content-length'];
  
  if (size) {
    const sizeMB = (parseInt(size) / 1024 / 1024).toFixed(2);
    if (sizeMB > 10) {
      console.log(`[${timestamp}] ${req.method} ${req.path} - 📦 Large request: ${sizeMB}MB`);
    } else {
      console.log(`[${timestamp}] ${req.method} ${req.path}`);
    }
  } else {
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
  }
  
  next();
});

// Middleware
// High limit for request body to support unlimited data forwarding (like gemini-balance-lite)
// This allows Claude Code to work with very large projects and contexts
// Can be configured via REQUEST_SIZE_LIMIT environment variable
app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Root endpoint - serve configuration UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST /api/login - Authenticate admin user
app.post('/api/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        error: { type: 'validation_error', message: 'Password is required' }
      });
    }
    
    // Check if password is hashed (starts with $2b$)
    let isValid;
    if (config.adminPassword.startsWith('$2b$')) {
      isValid = await verifyPassword(password, config.adminPassword);
    } else {
      // Plain text password (first time setup)
      isValid = password === config.adminPassword;
      if (isValid) {
        // Hash the password for future use
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

// GET /api/config - Get current configuration
app.get('/api/config', requireSession, (req, res) => {
  try {
    // Return config without sensitive password
    const { adminPassword, ...safeConfig } = config;
    res.json(safeConfig);
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({
      error: { type: 'server_error', message: 'Failed to get configuration' }
    });
  }
});

// POST /api/config - Update configuration
app.post('/api/config', requireSession, async (req, res) => {
  try {
    const updates = req.body;
    
    // Validate and merge updates
    const newConfig = { ...config, ...updates };
    const validated = validateConfig(newConfig);
    
    // Save configuration
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

// POST /api/test-connection - Test Gemini API connectivity
app.post('/api/test-connection', requireSession, async (req, res) => {
  try {
    if (!config.geminiApiUrl || !config.geminiApiKey) {
      return res.json({ connected: false, error: 'API URL or key not configured' });
    }
    
    // Build test URL with API key as query parameter
    const testUrl = `${config.geminiApiUrl}/models/${config.geminiModelName}:generateContent?key=${config.geminiApiKey}`;
    
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

// POST /api/generate-key - Generate new local API key
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

// POST /api/change-password - Change admin password
app.post('/api/change-password', requireSession, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: { type: 'validation_error', message: 'Both passwords are required' }
      });
    }
    
    // Verify current password
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
    
    // Hash and save new password
    config.adminPassword = await hashPassword(newPassword);
    if (saveConfig(config)) {
      // Clear all sessions to force re-login
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

// POST /v1/messages - Proxy Claude API requests to Gemini
app.post('/v1/messages', requireApiKey(config), async (req, res) => {
  try {
    const claudeRequest = req.body;
    const messageId = generateMessageId();
    const isStreaming = claudeRequest.stream === true;
    
    console.log('Received Claude request:', JSON.stringify(claudeRequest, null, 2));
    
    // Convert request
    const geminiRequest = claudeToGeminiRequest(claudeRequest);
    
    console.log('Converted to Gemini request:', JSON.stringify(geminiRequest, null, 2));
    
    // Build Gemini API URL
    const geminiUrl = buildGeminiUrl(config, isStreaming);
    console.log('Gemini URL:', geminiUrl.replace(/key=.+/, 'key=***'));
    
    // Forward to Gemini API (API key is in URL)
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      console.error('⏱️  Request timeout after 60 seconds');
    }, 60000); // 60 second timeout
    
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
        console.error('❌ Request aborted due to timeout');
        return res.status(504).json({
          error: { 
            type: 'timeout_error', 
            message: 'Request to Gemini API timed out after 60 seconds'
          }
        });
      }
      throw fetchError;
    }
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', response.status, error);
      return res.status(502).json({
        error: { 
          type: 'upstream_error', 
          message: 'Gemini API request failed',
          details: error
        }
      });
    }
    
    if (isStreaming) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('anthropic-version', '2023-06-01');
      
      const parser = new GeminiStreamParser();
      const converter = new ClaudeStreamConverter(claudeRequest.model || 'claude-3-5-sonnet-20241022', messageId);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let chunkCount = 0;
      let lastChunkTime = Date.now();
      
      try {
        while (true) {
          // Check for stream timeout (no data for 30 seconds)
          if (Date.now() - lastChunkTime > 30000) {
            console.error('⏱️  Stream timeout: no data received for 30 seconds');
            res.write(formatClaudeSSE('error', {
              type: 'stream_timeout',
              message: 'Stream timed out waiting for data'
            }));
            res.end();
            break;
          }
          
          const { done, value } = await reader.read();
          if (done) {
            console.log(`✅ Stream completed after ${chunkCount} chunks`);
            break;
          }
          
          chunkCount++;
          lastChunkTime = Date.now();
          
          const chunk = decoder.decode(value, { stream: true });
          console.log(`📦 Received chunk ${chunkCount} (${chunk.length} bytes)`);
          
          const events = parser.parse(chunk);
          console.log(`📊 Parsed ${events.length} events from chunk`);
          
          for (const geminiData of events) {
            const claudeEvents = converter.convertChunk(geminiData);
            for (const { event, data } of claudeEvents) {
              res.write(formatClaudeSSE(event, data));
            }
          }
        }
        
        // Send final events
        const finalEvents = converter.finalize();
        for (const { event, data } of finalEvents) {
          res.write(formatClaudeSSE(event, data));
        }
        
        res.end();
      } catch (streamError) {
        console.error('❌ Stream error:', streamError);
        console.error('Stack:', streamError.stack);
        res.write(formatClaudeSSE('error', {
          type: 'stream_error',
          message: streamError.message
        }));
        res.end();
      }
    } else {
      // Handle non-streaming response
      const geminiResponse = await response.json();
      console.log('Gemini response:', JSON.stringify(geminiResponse, null, 2));
      
      const claudeResponse = geminiToClaudeResponse(
        geminiResponse, 
        claudeRequest.model || 'claude-3-5-sonnet-20241022',
        messageId
      );
      console.log('Claude response:', JSON.stringify(claudeResponse, null, 2));
      
      // Set proper headers for Claude API compatibility
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('anthropic-version', '2023-06-01');
      res.json(claudeResponse);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: { type: 'server_error', message: error.message }
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Error:`, err.message);
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  const errorType = err.type || 'server_error';
  
  res.status(statusCode).json({
    error: {
      type: errorType,
      message: err.message || 'Internal server error'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      type: 'not_found',
      message: 'Endpoint not found'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Gemini-Claude proxy server running on port ${PORT}`);
  console.log(`📊 Configuration UI: http://localhost:${PORT}`);
  console.log(`🔌 Proxy endpoint: http://localhost:${PORT}/v1/messages`);
  console.log(`📦 Request size limit: ${REQUEST_SIZE_LIMIT}`);
  console.log(`💡 Tip: Use stream mode for large projects and code generation\n`);
});
