/**
 * MCP与Gemini协议集成层
 * 实现MCP工具到Claude/Gemini格式的双向转换
 */

const { MCPClient } = require('./mcp-client');

class MCPIntegration {
  constructor(config) {
    this.mcpClient = new MCPClient({
      clientName: 'gemini-claude-bridge',
      clientVersion: '1.0.0'
    });

    this.geminiConfig = config;
    this.mcpServers = [];
    this.availableTools = new Map();
    this.initialized = false;
  }

  /**
   * 初始化MCP集成
   */
  async initialize(serverConfigs = []) {
    console.log('🚀 初始化MCP集成层...');

    try {
      // 连接所有配置的MCP服务器
      for (const serverConfig of serverConfigs) {
        const server = await this.mcpClient.connect(serverConfig);
        this.mcpServers.push(server);

        // 等待连接稳定
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 加载所有工具
      await this._loadAllTools();

      this.initialized = true;
      console.log(`✅ MCP集成完成，已连接 ${this.mcpServers.length} 个服务器`);
      console.log(`🔧 可用工具总数: ${this.availableTools.size}`);

      return this.availableTools;
    } catch (error) {
      console.error('❌ MCP集成初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载所有MCP工具
   */
  async _loadAllTools() {
    const allTools = this.mcpClient.getAllTools();

    for (const tool of allTools) {
      this.availableTools.set(tool.id, {
        ...tool,
        mcpCompatible: true
      });

      console.log(`🔧 注册MCP工具: ${tool.id}`);
    }
  }

  /**
   * 将MCP工具转换为Claude格式
   */
  mcpToClaudeFormat(mcpTools) {
    const claudeTools = [];

    for (const mcpTool of mcpTools) {
      // 转换输入schema格式
      const inputSchema = this._convertInputSchema(mcpTool.input_schema);

      const claudeTool = {
        name: mcpTool.id.replace(':', '_'), // 替换冒号为下划线避免冲突
        description: `[MCP] ${mcpTool.description}`,
        input_schema: inputSchema
      };

      claudeTools.push(claudeTool);
    }

    console.log(`🔄 转换 ${mcpTools.length} 个MCP工具为Claude格式`);
    return claudeTools;
  }

  /**
   * 将Claude工具调用转换为MCP调用
   */
  claudeToMcpCall(claudeToolUse) {
    const toolName = claudeToolUse.name;

    // 查找对应的MCP工具
    let mcpToolId = null;
    for (const [id, tool] of this.availableTools) {
      if (tool.name === toolName || id.replace(':', '_') === toolName) {
        mcpToolId = id;
        break;
      }
    }

    if (!mcpToolId) {
      console.warn(`⚠️ 未找到MCP工具: ${toolName}`);
      return null;
    }

    console.log(`🔀 转换Claude工具调用到MCP: ${toolName} → ${mcpToolId}`);

    return {
      toolId: mcpToolId,
      arguments: claudeToolUse.input || {}
    };
  }

  /**
   * 执行MCP工具调用
   */
  async executeMcpTool(mcpCall) {
    if (!this.initialized) {
      throw new Error('MCP集成未初始化');
    }

    try {
      console.log(`🔧 执行MCP工具: ${mcpCall.toolId}`);

      const result = await this.mcpClient.callTool(mcpCall.toolId, mcpCall.arguments);

      // 转换结果格式
      const claudeFormat = this._formatMcpResult(result);

      console.log(`✅ MCP工具执行成功: ${mcpCall.toolId}`);
      return claudeFormat;
    } catch (error) {
      console.error(`❌ MCP工具执行失败: ${mcpCall.toolId}`, error);

      // 返回错误格式
      return {
        type: 'tool_result',
        tool_use_id: mcpCall.toolId.replace(':', '_'),
        content: `工具执行失败: ${error.message}`,
        is_error: true
      };
    }
  }

  /**
   * 转换输入schema
   */
  _convertInputSchema(mcpSchema) {
    if (!mcpSchema) {
      return {
        type: 'object',
        properties: {},
        required: []
      };
    }

    // 清理不兼容Gemini的字段
    const cleanedSchema = JSON.parse(JSON.stringify(mcpSchema));

    // 递归清理
    const cleanSchema = (obj, depth = 0) => {
      if (depth > 10) return obj; // 防止无限递归

      if (Array.isArray(obj)) {
        return obj.map(item => cleanSchema(item, depth + 1));
      }

      if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
          // 跳过MCP特有但Claude/Gemini不支持的字段
          if (['$schema', '$id', '$ref', 'additionalProperties'].includes(key)) {
            continue;
          }

          cleaned[key] = cleanSchema(value, depth + 1);
        }
        return cleaned;
      }

      return obj;
    };

    return cleanSchema(cleanedSchema);
  }

  /**
   * 格式化MCP结果为Claude格式
   */
  _formatMcpResult(mcpResult) {
    if (typeof mcpResult === 'string') {
      return {
        type: 'content',
        text: mcpResult
      };
    }

    if (typeof mcpResult === 'object' && mcpResult !== null) {
      if (mcpResult.content) {
        return mcpResult.content;
      }

      if (Array.isArray(mcpResult)) {
        return {
          type: 'content',
          text: JSON.stringify(mcpResult, null, 2)
        };
      }

      return {
        type: 'content',
        text: JSON.stringify(mcpResult)
      };
    }

    return {
      type: 'content',
      text: String(mcpResult || '')
    };
  }

  /**
   * 获取所有MCP工具（Claude格式）
   */
  getClaudeTools() {
    const mcpTools = Array.from(this.availableTools.values());
    return this.mcpToClaudeFormat(mcpTools);
  }

  /**
   * 处理Claude工具调用
   */
  async handleClaudeToolUse(toolUse) {
    const mcpCall = this.claudeToMcpCall(toolUse);

    if (!mcpCall) {
      throw new Error(`无法处理工具调用: ${toolUse.name}`);
    }

    return await this.executeMcpTool(mcpCall);
  }

  /**
   * 检查工具是否为MCP工具
   */
  isMcpTool(toolName) {
    for (const [id, tool] of this.availableTools) {
      if (tool.name === toolName || id.replace(':', '_') === toolName) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取工具状态
   */
  getStatus() {
    return {
      initialized: this.initialized,
      servers: this.mcpServers.length,
      tools: this.availableTools.size,
      serverList: this.mcpServers.map(s => ({
        name: s.name,
        connected: s.transport && (s.transport.ws?.readyState === 1 || s.transport.process)
      }))
    };
  }

  /**
   * 断开连接
   */
  async disconnect() {
    console.log('🔌 断开MCP连接...');

    await this.mcpClient.disconnect();

    this.mcpServers = [];
    this.availableTools.clear();
    this.initialized = false;

    console.log('✅ MCP集成已断开');
  }
}

module.exports = { MCPIntegration };