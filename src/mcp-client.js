/**
 * MCP (Model Context Protocol) Client Implementation
 * 支持2025年MCP标准，实现Claude Desktop兼容的MCP协议
 */

const { EventEmitter } = require('events');
const WebSocket = require('ws');

class MCPClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      version: '2025-1',
      clientName: config.clientName || 'gemini-claude-bridge',
      clientVersion: config.clientVersion || '1.0.0',
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        logging: {},
        experimental: {}
      },
      ...config
    };

    this.servers = new Map();
    this.tools = new Map();
    this.resources = new Map();
    this.prompts = new Map();
    this.connectionId = null;
    this.initialized = false;
  }

  /**
   * 连接到MCP服务器
   */
  async connect(serverConfig) {
    const { name, url, command, args = [] } = serverConfig;

    try {
      console.log(`🔗 连接MCP服务器: ${name}`);

      let transport;
      if (url) {
        transport = new WebSocketTransport(url);
      } else if (command) {
        transport = new StdioTransport(command, args);
      } else {
        throw new Error('必须提供url或command参数');
      }

      await transport.connect();

      const server = {
        name,
        config: serverConfig,
        transport,
        capabilities: null
      };

      // 初始化握手
      await this._initializeHandshake(server);
      this.servers.set(name, server);

      // 获取服务器能力
      await this._fetchServerCapabilities(server);

      // 注册可用工具
      if (server.capabilities.tools) {
        await this._loadTools(server);
      }

      // 注册资源
      if (server.capabilities.resources) {
        await this._loadResources(server);
      }

      // 注册提示
      if (server.capabilities.prompts) {
        await this._loadPrompts(server);
      }

      console.log(`✅ MCP服务器 ${name} 连接成功`);
      this.emit('server:connected', server);

      return server;
    } catch (error) {
      console.error(`❌ 连接MCP服务器失败: ${name}`, error);
      throw error;
    }
  }

  /**
   * MCP握手协议初始化
   */
  async _initializeHandshake(server) {
    const initRequest = {
      jsonrpc: '2.0',
      id: this._generateId(),
      method: 'initialize',
      params: {
        protocolVersion: this.config.version,
        capabilities: this.config.capabilities,
        clientInfo: {
          name: this.config.clientName,
          version: this.config.clientVersion
        }
      }
    };

    const response = await server.transport.send(initRequest);

    if (response.error) {
      throw new Error(`MCP初始化失败: ${response.error.message}`);
    }

    server.capabilities = response.result.capabilities;

    // 发送initialized通知
    await server.transport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });

    console.log(`🤝 MCP握手完成: ${server.name}`);
    console.log(`   服务器能力: ${JSON.stringify(server.capabilities, null, 2)}`);
  }

  /**
   * 获取服务器能力
   */
  async _fetchServerCapabilities(server) {
    // 通常在initialize响应中已包含，无需额外请求
    console.log(`📋 服务器 ${server.name} 能力已获取`);
  }

  /**
   * 加载工具列表
   */
  async _loadTools(server) {
    try {
      const response = await server.transport.send({
        jsonrpc: '2.0',
        id: this._generateId(),
        method: 'tools/list'
      });

      if (response.error) {
        console.warn(`⚠️ 获取工具列表失败: ${response.error.message}`);
        return;
      }

      const tools = response.result.tools || [];
      tools.forEach(tool => {
        const toolId = `${server.name}:${tool.name}`;
        this.tools.set(toolId, {
          ...tool,
          server: server.name,
          serverName: tool.name
        });
      });

      console.log(`🔧 加载 ${tools.length} 个工具从 ${server.name}`);
    } catch (error) {
      console.error(`❌ 加载工具失败: ${server.name}`, error);
    }
  }

  /**
   * 加载资源列表
   */
  async _loadResources(server) {
    try {
      const response = await server.transport.send({
        jsonrpc: '2.0',
        id: this._generateId(),
        method: 'resources/list'
      });

      if (response.error) {
        console.warn(`⚠️ 获取资源列表失败: ${response.error.message}`);
        return;
      }

      const resources = response.result.resources || [];
      resources.forEach(resource => {
        const resourceId = `${server.name}:${resource.uri}`;
        this.resources.set(resourceId, {
          ...resource,
          server: server.name
        });
      });

      console.log(`📁 加载 ${resources.length} 个资源从 ${server.name}`);
    } catch (error) {
      console.error(`❌ 加载资源失败: ${server.name}`, error);
    }
  }

  /**
   * 加载提示列表
   */
  async _loadPrompts(server) {
    try {
      const response = await server.transport.send({
        jsonrpc: '2.0',
        id: this._generateId(),
        method: 'prompts/list'
      });

      if (response.error) {
        console.warn(`⚠️ 获取提示列表失败: ${response.error.message}`);
        return;
      }

      const prompts = response.result.prompts || [];
      prompts.forEach(prompt => {
        const promptId = `${server.name}:${prompt.name}`;
        this.prompts.set(promptId, {
          ...prompt,
          server: server.name
        });
      });

      console.log(`💬 加载 ${prompts.length} 个提示从 ${server.name}`);
    } catch (error) {
      console.error(`❌ 加载提示失败: ${server.name}`, error);
    }
  }

  /**
   * 调用MCP工具
   */
  async callTool(toolId, args = {}) {
    const [serverName, toolName] = toolId.split(':');
    const server = this.servers.get(serverName);

    if (!server) {
      throw new Error(`服务器未连接: ${serverName}`);
    }

    try {
      console.log(`🔧 调用MCP工具: ${toolId}`);
      console.log(`   参数: ${JSON.stringify(args, null, 2)}`);

      const response = await server.transport.send({
        jsonrpc: '2.0',
        id: this._generateId(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      });

      if (response.error) {
        console.error(`❌ 工具调用失败: ${response.error.message}`);
        throw new Error(`工具执行失败: ${response.error.message}`);
      }

      console.log(`✅ 工具执行成功: ${toolId}`);
      return response.result;
    } catch (error) {
      console.error(`❌ 工具调用异常: ${toolId}`, error);
      throw error;
    }
  }

  /**
   * 读取资源
   */
  async readResource(resourceId) {
    const [serverName, uri] = resourceId.split(':');
    const server = this.servers.get(serverName);

    if (!server) {
      throw new Error(`服务器未连接: ${serverName}`);
    }

    try {
      console.log(`📖 读取MCP资源: ${resourceId}`);

      const response = await server.transport.send({
        jsonrpc: '2.0',
        id: this._generateId(),
        method: 'resources/read',
        params: { uri }
      });

      if (response.error) {
        console.error(`❌ 资源读取失败: ${response.error.message}`);
        throw new Error(`资源读取失败: ${response.error.message}`);
      }

      console.log(`✅ 资源读取成功: ${resourceId}`);
      return response.result;
    } catch (error) {
      console.error(`❌ 资源读取异常: ${resourceId}`, error);
      throw error;
    }
  }

  /**
   * 获取提示
   */
  async getPrompt(promptId, args = {}) {
    const [serverName, promptName] = promptId.split(':');
    const server = this.servers.get(serverName);

    if (!server) {
      throw new Error(`服务器未连接: ${serverName}`);
    }

    try {
      console.log(`💬 获取MCP提示: ${promptId}`);

      const response = await server.transport.send({
        jsonrpc: '2.0',
        id: this._generateId(),
        method: 'prompts/get',
        params: {
          name: promptName,
          arguments: args
        }
      });

      if (response.error) {
        console.error(`❌ 提示获取失败: ${response.error.message}`);
        throw new Error(`提示获取失败: ${response.error.message}`);
      }

      console.log(`✅ 提示获取成功: ${promptId}`);
      return response.result;
    } catch (error) {
      console.error(`❌ 提示获取异常: ${promptId}`, error);
      throw error;
    }
  }

  /**
   * 断开所有连接
   */
  async disconnect() {
    console.log('🔌 断开所有MCP连接...');

    for (const [name, server] of this.servers) {
      try {
        if (server.transport && server.transport.close) {
          await server.transport.close();
          console.log(`✅ 已断开: ${name}`);
        }
      } catch (error) {
        console.error(`❌ 断开连接失败: ${name}`, error);
      }
    }

    this.servers.clear();
    this.tools.clear();
    this.resources.clear();
    this.prompts.clear();
  }

  /**
   * 获取所有可用工具
   */
  getAllTools() {
    const tools = [];
    for (const [id, tool] of this.tools) {
      tools.push({
        id,
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
        server: tool.server
      });
    }
    return tools;
  }

  /**
   * 获取所有可用资源
   */
  getAllResources() {
    const resources = [];
    for (const [id, resource] of this.resources) {
      resources.push({
        id,
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        server: resource.server
      });
    }
    return resources;
  }

  /**
   * 获取所有可用提示
   */
  getAllPrompts() {
    const prompts = [];
    for (const [id, prompt] of this.prompts) {
      prompts.push({
        id,
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
        server: prompt.server
      });
    }
    return prompts;
  }

  /**
   * 生成请求ID
   */
  _generateId() {
    return Math.random().toString(36).substring(2, 15);
  }
}

/**
 * WebSocket传输层
 */
class WebSocketTransport {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.pendingRequests = new Map();
    this.messageId = 0;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log(`🌐 WebSocket连接已建立: ${this.url}`);
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this._handleMessage(message);
        } catch (error) {
          console.error('❌ 解析WebSocket消息失败:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket错误:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('🔌 WebSocket连接已关闭');
      });
    });
  }

  async send(request) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket未连接');
    }

    const id = request.id || ++this.messageId;
    if (!request.id) {
      request.id = id;
    }

    return new Promise((resolve, reject) => {
      if (request.id) {
        this.pendingRequests.set(request.id, { resolve, reject });
      }

      this.ws.send(JSON.stringify(request));

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error('请求超时'));
        }
      }, 30000); // 30秒超时
    });
  }

  _handleMessage(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      resolve(message);
    } else {
      // 处理通知
      console.log('📢 收到MCP通知:', message);
    }
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

/**
 * Stdio传输层（用于子进程）
 */
class StdioTransport {
  constructor(command, args) {
    this.command = command;
    this.args = args;
    this.process = null;
    this.pendingRequests = new Map();
    this.messageId = 0;
    this.buffer = '';
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');

      this.process = spawn(this.command, this.args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        this._processMessages();
      });

      this.process.stderr.on('data', (data) => {
        console.error('❌ MCP服务器错误:', data.toString());
      });

      this.process.on('error', (error) => {
        console.error('❌ 进程错误:', error);
        reject(error);
      });

      this.process.on('close', (code) => {
        console.log(`🔌 MCP服务器进程退出: ${code}`);
      });

      // 给进程一点时间启动
      setTimeout(() => resolve(), 1000);
    });
  }

  async send(request) {
    if (!this.process) {
      throw new Error('进程未连接');
    }

    const id = request.id || ++this.messageId;
    if (!request.id) {
      request.id = id;
    }

    return new Promise((resolve, reject) => {
      if (request.id) {
        this.pendingRequests.set(request.id, { resolve, reject });
      }

      const message = JSON.stringify(request) + '\n';
      this.process.stdin.write(message);

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error('请求超时'));
        }
      }, 30000);
    });
  }

  _processMessages() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // 保留未完整的行

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this._handleMessage(message);
        } catch (error) {
          console.error('❌ 解析消息失败:', error);
        }
      }
    }
  }

  _handleMessage(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      resolve(message);
    } else {
      // 处理通知
      console.log('📢 收到MCP通知:', message);
    }
  }

  async close() {
    if (this.process) {
      this.process.kill();
    }
  }
}

module.exports = {
  MCPClient,
  WebSocketTransport,
  StdioTransport
};