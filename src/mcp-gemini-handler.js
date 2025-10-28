/**
 * MCP工具执行处理器
 * 专门处理MCP工具调用和Gemini限制
 */

class MCPGeminiHandler {
  constructor(mcpIntegration) {
    this.mcp = mcpIntegration;
    this.concurrentCalls = 0;
    this.maxConcurrentCalls = 1; // Gemini 2.5限制
    this.callQueue = [];
  }

  /**
   * 处理工具调用，考虑Gemini限制
   */
  async handleToolCall(toolUse, claudeRequest) {
    const toolName = toolUse.name;

    console.log(`🔧 处理工具调用: ${toolName}`);

    // 检查是否为MCP工具
    const isMcpTool = this.mcp.isMcpTool(toolName);

    if (isMcpTool) {
      return await this._handleMcpToolCall(toolUse);
    } else {
      // 原生工具，直接调用
      return await this._handleNativeToolCall(toolUse, claudeRequest);
    }
  }

  /**
   * 处理MCP工具调用
   */
  async _handleMcpToolCall(toolUse) {
    const toolName = toolUse.name;

    // 检查并发限制
    if (this.concurrentCalls >= this.maxConcurrentCalls) {
      console.warn(`⚠️ 达到Gemini并发限制，排队MCP工具: ${toolName}`);

      // 加入队列
      return new Promise((resolve, reject) => {
        this.callQueue.push({ toolUse, resolve, reject });

        // 处理队列
        this._processQueue();
      });
    }

    this.concurrentCalls++;

    try {
      console.log(`🚀 执行MCP工具: ${toolName}`);

      // 执行MCP工具
      const result = await this.mcp.executeMcpTool({
        toolId: `${this.mcp.servers.find(s => s.tools?.includes(toolName))?.name}:${toolName}`,
        arguments: toolUse.input || {}
      });

      console.log(`✅ MCP工具执行成功: ${toolName}`);
      return result;
    } catch (error) {
      console.error(`❌ MCP工具执行失败: ${toolName}`, error);

      // 返回错误格式
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `工具执行失败: ${error.message}`,
        is_error: true
      };
    } finally {
      this.concurrentCalls--;

      // 继续处理队列
      this._processQueue();
    }
  }

  /**
   * 处理原生工具调用
   */
  async _handleNativeToolCall(toolUse, claudeRequest) {
    console.log(`🔧 执行原生工具: ${toolUse.name}`);

    // 原生工具调用暂时返回占位符
    // 实际执行需要等待Gemini响应
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: `原生工具 ${toolUse.name} 调用已转发到Gemini`,
      is_error: false
    };
  }

  /**
   * 处理调用队列
   */
  _processQueue() {
    if (this.callQueue.length > 0 && this.concurrentCalls < this.maxConcurrentCalls) {
      const { toolUse, resolve, reject } = this.callQueue.shift();

      this._handleMcpToolCall(toolUse)
        .then(resolve)
        .catch(reject);
    }
  }

  /**
   * 获取状态信息
   */
  getStatus() {
    return {
      concurrentCalls: this.concurrentCalls,
      maxConcurrentCalls: this.maxConcurrentCalls,
      queuedCalls: this.callQueue.length,
      isLimited: this.concurrentCalls >= this.maxConcurrentCalls
    };
  }

  /**
   * 重置状态
   */
  reset() {
    this.concurrentCalls = 0;
    this.callQueue = [];
  }
}

module.exports = { MCPGeminiHandler };