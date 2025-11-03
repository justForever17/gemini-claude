/**
 * API Conversion Module
 * Handles conversion between Claude and Gemini API formats
 *
 * Key conversions:
 * - Claude messages → Gemini contents (role mapping: assistant→model, user→user)
 * - Claude system → Gemini system_instruction
 * - Claude parameters → Gemini generationConfig
 * - Gemini candidates → Claude content blocks
 * - Gemini finishReason → Claude stop_reason
 * - SSE streaming format conversion
 */

// Import MCP integration
const { MCPIntegration } = require('./mcp-integration');

// Global MCP integration instance
let mcpIntegration = null;

// Safety settings for Gemini API - disable all content filtering
const safetySettings = [
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_CIVIC_INTEGRITY'
].map(category => ({
  category,
  threshold: 'BLOCK_NONE'
}));

/**
 * Build complete Gemini API endpoint URL with API key
 * @param {Object} config - Configuration object with geminiApiUrl, defaultGeminiModel, and geminiApiKey
 * @param {boolean} stream - Whether this is a streaming request
 * @param {string} requestedModel - Model name from the request (optional)
 * @returns {string} Complete API endpoint URL with key parameter
 */
function buildGeminiUrl(config, stream, requestedModel) {
  const { geminiApiUrl, defaultGeminiModel, geminiApiKey } = config;
  const modelName = requestedModel || defaultGeminiModel || 'gemini-2.5-flash';
  
  console.log(`🎯 Using Gemini model: ${modelName}${requestedModel ? ' (from request)' : ' (default)'}`);
  
  let url = `${geminiApiUrl}/models/${modelName}:`;
  url += stream ? 'streamGenerateContent' : 'generateContent';
  url += `?key=${geminiApiKey}`;
  if (stream) {
    url += '&alt=sse';
  }
  return url;
}

/**
 * Convert Claude API request to Gemini API format
 * @param {Object} claudeRequest - Claude API request object
 * @returns {Object} Gemini API request object
 */
function claudeToGeminiRequest(claudeRequest) {
  // Log request overview
  console.log('📨 Converting Claude request to Gemini format');
  console.log(`  Model: ${claudeRequest.model || 'default'}`);
  console.log(`  Messages: ${claudeRequest.messages?.length || 0}`);
  console.log(`  Tools: ${claudeRequest.tools?.length || 0}`);
  console.log(`  Max tokens: ${claudeRequest.max_tokens || 'default'}`);
  console.log(`  Stream: ${claudeRequest.stream ? 'yes' : 'no'}`);

  const geminiRequest = {
    contents: [],
    safetySettings,
    generationConfig: {}
  };

  // Handle system instruction
  if (claudeRequest.system) {
    let systemText = '';
    if (typeof claudeRequest.system === 'string') {
      systemText = claudeRequest.system;
    } else if (Array.isArray(claudeRequest.system)) {
      // Handle array of system instruction blocks
      systemText = claudeRequest.system
        .map(block => block.type === 'text' ? block.text : '')
        .filter(text => text)
        .join('\n\n');
    }

    if (systemText) {
      geminiRequest.system_instruction = {
        parts: [{ text: systemText }]
      };
    }
  }

  // Log message details
  if (claudeRequest.messages && claudeRequest.messages.length > 0) {
    console.log('💬 Converting messages:');
    claudeRequest.messages.forEach((msg, index) => {
      const contentTypes = Array.isArray(msg.content)
        ? msg.content.map(b => b.type).join(', ')
        : 'text';
      const contentLength = Array.isArray(msg.content)
        ? msg.content.length
        : 1;
      console.log(`  [${index}] ${msg.role}: ${contentLength} block(s) (${contentTypes})`);
    });
  }

  // Convert messages - merge consecutive messages with same role
  for (const msg of claudeRequest.messages || []) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'image') {
          parts.push({
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data
            }
          });
        } else if (block.type === 'tool_result') {
          // Convert Claude tool_result to Gemini functionResponse
          // Find the corresponding tool_use from previous messages to get the function name
          let functionName = block.tool_use_id; // Fallback to ID
          
          // Search backwards through messages to find the tool_use with matching ID
          for (let i = claudeRequest.messages.length - 1; i >= 0; i--) {
            const prevMsg = claudeRequest.messages[i];
            if (Array.isArray(prevMsg.content)) {
              for (const prevBlock of prevMsg.content) {
                if (prevBlock.type === 'tool_use' && prevBlock.id === block.tool_use_id) {
                  functionName = prevBlock.name;
                  break;
                }
              }
            }
            if (functionName !== block.tool_use_id) break;
          }
          
          // Prepare response object - MUST be an object, not array or primitive
          let response;
          if (typeof block.content === 'string') {
            response = { result: block.content };
          } else if (Array.isArray(block.content)) {
            // If content is an array, wrap it in an object
            response = { result: block.content };
          } else if (typeof block.content === 'object' && block.content !== null) {
            // If it's already an object, use it directly
            response = block.content;
          } else {
            // Handle unexpected content types
            console.warn(`⚠️  Unexpected tool_result content type: ${typeof block.content}`);
            response = { result: String(block.content) };
          }
          
          // Handle error status
          if (block.is_error) {
            response.error = true;
            response.error_message = typeof block.content === 'string' 
              ? block.content 
              : JSON.stringify(block.content);
            console.warn(`⚠️  Tool execution failed: ${functionName} (${block.tool_use_id})`);
            console.warn(`   Error: ${response.error_message.substring(0, 200)}${response.error_message.length > 200 ? '...' : ''}`);
          }
          
          parts.push({
            functionResponse: {
              name: functionName,
              response: response
            }
          });
          
          // Log successful conversion
          if (!block.is_error) {
            const contentSize = typeof block.content === 'string' 
              ? block.content.length 
              : JSON.stringify(block.content).length;
            console.log(`🔧 Converted tool_result: ${block.tool_use_id} → ${functionName} (${contentSize} bytes)`);
          }
          
          // Warn if function name wasn't found
          if (functionName === block.tool_use_id) {
            console.warn(`⚠️  Could not find function name for tool_use_id: ${block.tool_use_id}`);
            console.warn(`   Using tool_use_id as fallback function name`);
          }
        } else if (block.type === 'tool_use') {
          // Check if this is an MCP tool call
          if (mcpIntegration && mcpIntegration.isMcpTool(block.name)) {
            // Handle MCP tool use - defer execution
            console.log(`🔧 Detected MCP tool use: ${block.name}`);
            // For now, just convert to Gemini format
            // Actual execution will be handled separately
            parts.push({
              functionCall: {
                name: block.name,
                args: block.input || {}
              }
            });
          } else {
            // Handle native tool_use in assistant messages (for context)
            // Gemini expects functionCall format
            parts.push({
              functionCall: {
                name: block.name,
                args: block.input || {}
              }
            });
          }
        }
      }
    }

    // Check if we should merge with previous message
    const lastContent = geminiRequest.contents[geminiRequest.contents.length - 1];
    if (lastContent && lastContent.role === role) {
      // Merge with previous message of same role
      lastContent.parts.push(...parts);
    } else {
      // Add as new message
      geminiRequest.contents.push({ role, parts });
    }
  }

  // Map generation parameters
  if (claudeRequest.max_tokens) {
    // Protect against unreasonably small max_tokens values
    // Claude Code sometimes sends max_tokens: 1 which causes issues
    const minTokens = 100; // Minimum reasonable token count
    const defaultTokens = 4096; // Default if not specified or too small
    
    let maxTokens = claudeRequest.max_tokens;
    
    if (maxTokens < minTokens) {
      console.warn(`⚠️  max_tokens (${maxTokens}) is too small, using default (${defaultTokens})`);
      maxTokens = defaultTokens;
    }
    
    geminiRequest.generationConfig.maxOutputTokens = maxTokens;
  } else {
    // If max_tokens not specified, use a reasonable default
    geminiRequest.generationConfig.maxOutputTokens = 4096;
  }
  if (claudeRequest.temperature !== undefined) {
    geminiRequest.generationConfig.temperature = claudeRequest.temperature;
  }
  if (claudeRequest.top_p !== undefined) {
    geminiRequest.generationConfig.topP = claudeRequest.top_p;
  }
  if (claudeRequest.top_k !== undefined) {
    geminiRequest.generationConfig.topK = claudeRequest.top_k;
  }
  if (claudeRequest.stop_sequences) {
    geminiRequest.generationConfig.stopSequences = claudeRequest.stop_sequences;
  }

  // Helper function: Recursively clean JSON Schema fields that Gemini doesn't support
  function cleanJsonSchema(schema, depth = 0, path = '') {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // Handle arrays - recurse into each element
    if (Array.isArray(schema)) {
      return schema.map((item, index) => 
        cleanJsonSchema(item, depth + 1, `${path}[${index}]`)
      );
    }

    // Comprehensive list of JSON Schema fields that Gemini doesn't accept
    const unsupportedFields = [
      // JSON Schema metadata
      'additionalProperties',
      '$schema',
      '$id',
      '$ref',
      'definitions',
      'title',
      'examples',
      'default',
      
      // Access control
      'readOnly',
      'writeOnly',
      
      // Numeric constraints
      'exclusiveMinimum',
      'exclusiveMaximum',
      'minimum',
      'maximum',
      'multipleOf',
      
      // String constraints
      'pattern',
      'format',
      'minLength',
      'maxLength',
      
      // Array constraints
      'minItems',
      'maxItems',
      'uniqueItems',
      
      // Object constraints
      'minProperties',
      'maxProperties',
      'patternProperties',
      'dependencies',
      
      // Content-related
      'contentMediaType',
      'contentEncoding',
      
      // Additional constraints
      'const',
      'allOf',
      'anyOf',
      'oneOf',
      'not'
    ];

    // Create a clean copy
    const cleaned = {};
    const removedFields = [];

    // Process each field
    for (const [key, value] of Object.entries(schema)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Skip unsupported fields entirely
      if (unsupportedFields.includes(key)) {
        removedFields.push(currentPath);
        continue;
      }

      // Recursively clean all nested objects and arrays
      // This ensures that pattern/format in deeply nested properties are also removed
      if (typeof value === 'object' && value !== null) {
        cleaned[key] = cleanJsonSchema(value, depth + 1, currentPath);
      } else {
        cleaned[key] = value;
      }
    }

    // Clean up 'required' array to only include properties that still exist
    if (cleaned.required && Array.isArray(cleaned.required) && cleaned.properties) {
      const validProperties = Object.keys(cleaned.properties);
      const originalRequired = cleaned.required;
      cleaned.required = cleaned.required.filter(prop => validProperties.includes(prop));
      
      // Log if we removed any required properties
      if (cleaned.required.length < originalRequired.length) {
        const removed = originalRequired.filter(prop => !cleaned.required.includes(prop));
        console.log(`🧹 Cleaned 'required' array: removed ${removed.length} reference(s) to deleted properties: ${removed.join(', ')}`);
      }
      
      // Remove empty required array
      if (cleaned.required.length === 0) {
        delete cleaned.required;
      }
    }

    // Log removed fields at root level only
    if (depth === 0 && removedFields.length > 0) {
      console.log(`🧹 Cleaned schema: removed ${removedFields.length} unsupported field(s)`);
      if (removedFields.length <= 10) {
        removedFields.forEach(field => console.log(`   - ${field}`));
      } else {
        console.log(`   - ${removedFields.slice(0, 10).join(', ')} ... and ${removedFields.length - 10} more`);
      }
    }

    return cleaned;
  }

  // Helper function: Validate that cleaned schema has no unsupported fields
  function validateCleanedSchema(schema, toolName, toolIndex) {
    if (!schema || typeof schema !== 'object') {
      return true;
    }

    // Must match the list in cleanJsonSchema
    const unsupportedFields = [
      'additionalProperties',
      '$schema',
      '$id',
      '$ref',
      'definitions',
      'title',
      'examples',
      'default',
      'readOnly',
      'writeOnly',
      'exclusiveMinimum',
      'exclusiveMaximum',
      'minimum',
      'maximum',
      'multipleOf',
      'pattern',
      'format',
      'minLength',
      'maxLength',
      'minItems',
      'maxItems',
      'uniqueItems',
      'minProperties',
      'maxProperties',
      'patternProperties',
      'dependencies',
      'contentMediaType',
      'contentEncoding',
      'const',
      'allOf',
      'anyOf',
      'oneOf',
      'not'
    ];

    // Deep search for unsupported fields
    function findUnsupportedFields(obj, path = '') {
      const found = [];

      if (!obj || typeof obj !== 'object') {
        return found;
      }

      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          found.push(...findUnsupportedFields(item, `${path}[${index}]`));
        });
        return found;
      }

      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (unsupportedFields.includes(key)) {
          found.push(currentPath);
        }

        if (typeof value === 'object' && value !== null) {
          found.push(...findUnsupportedFields(value, currentPath));
        }
      }

      return found;
    }

    const foundFields = findUnsupportedFields(schema);

    if (foundFields.length > 0) {
      console.warn(`⚠️  Tool[${toolIndex}] "${toolName}" still contains unsupported fields after cleaning:`);
      foundFields.forEach(field => console.warn(`   - ${field}`));
      return false;
    }

    return true;
  }

  // Merge MCP tools with Claude tools
  const allTools = [];

  // Add MCP tools if integration is available
  if (mcpIntegration && mcpIntegration.initialized) {
    const mcpTools = mcpIntegration.getClaudeTools();
    allTools.push(...mcpTools);
    console.log(`🔧 Adding ${mcpTools.length} MCP tool(s) to request`);
  }

  // Add Claude native tools
  if (claudeRequest.tools && Array.isArray(claudeRequest.tools)) {
    allTools.push(...claudeRequest.tools);
    console.log(`🔧 Adding ${claudeRequest.tools.length} native tool(s) to request`);
  }

  // Check if the request contains any functionResponse (tool_result)
  // Gemini doesn't allow tools definition when functionResponse is present
  const hasFunctionResponse = geminiRequest.contents.some(content => 
    content.parts && content.parts.some(part => part.functionResponse)
  );

  if (hasFunctionResponse && allTools.length > 0) {
    console.log(`⚠️  Skipping tools definition: Request contains functionResponse`);
    console.log(`   Gemini API limitation: Cannot send tools with function responses`);
    console.log(`   This is normal for tool result submissions`);
  }

  // Convert all tools to Gemini function declarations
  // BUT: Skip if request contains functionResponse (Gemini limitation)
  if (allTools.length > 0 && !hasFunctionResponse) {
    console.log(`🔧 Converting ${allTools.length} total tool(s) to Gemini format:`);
    allTools.forEach((tool, index) => {
      console.log(`  [${index}] ${tool.name}`);
    });

    const functionDeclarations = allTools.map((tool, index) => {
      // Skip MCP tools in schema cleaning (they're already cleaned)
      const isMcpTool = mcpIntegration && mcpIntegration.isMcpTool(tool.name);

      let cleanedSchema = {};
      if (tool.input_schema) {
        const originalSize = JSON.stringify(tool.input_schema).length;

        if (isMcpTool) {
          // MCP tools already have cleaned schema
          cleanedSchema = tool.input_schema;
          console.log(`  ✓ [${index}] ${tool.name}: MCP tool (pre-cleaned)`);
        } else {
          // Clean native Claude tools
          cleanedSchema = cleanJsonSchema(tool.input_schema);
          const cleanedSize = JSON.stringify(cleanedSchema).length;
          const reduction = originalSize - cleanedSize;

          if (reduction > 0) {
            console.log(`  🧹 [${index}] ${tool.name}: Cleaned ${reduction} bytes (${originalSize} → ${cleanedSize})`);
          } else {
            console.log(`  ✓ [${index}] ${tool.name}: No cleaning needed`);
          }
        }
      }

      // Validate that cleaning was successful (only for non-MCP tools)
      if (!isMcpTool) {
        const isValid = validateCleanedSchema(cleanedSchema, tool.name, index);
        if (!isValid) {
          console.error(`  ❌ [${index}] ${tool.name}: Validation failed - may cause Gemini errors`);
        }
      }

      // Ensure proper Gemini function declaration format
      const functionDeclaration = {
        name: tool.name,
        description: tool.description || ''
      };

      // Only include parameters if they exist and are not empty
      if (cleanedSchema && Object.keys(cleanedSchema).length > 0) {
        functionDeclaration.parameters = cleanedSchema;
      }

      return functionDeclaration;
    });

    if (functionDeclarations.length > 0) {
      geminiRequest.tools = [{
        functionDeclarations: functionDeclarations
      }];
    }
  }

  return geminiRequest;
}

/**
 * Initialize MCP integration
 */
async function initializeMCP(config) {
  if (!mcpIntegration) {
    try {
      console.log('🚀 初始化MCP集成...');

      // Get MCP server configurations from config
      const mcpServers = config.mcpServers || [];

      mcpIntegration = new MCPIntegration(config);
      await mcpIntegration.initialize(mcpServers);

      console.log('✅ MCP集成初始化完成');
      return mcpIntegration;
    } catch (error) {
      console.error('❌ MCP集成初始化失败:', error);
      mcpIntegration = null;
      throw error;
    }
  }
  return null;
}

// Generate Claude-style message ID
function generateMessageId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomChar = () => characters[Math.floor(Math.random() * characters.length)];
  return 'msg_' + Array.from({ length: 29 }, randomChar).join('');
}

// Map Gemini finish reason to Claude stop reason
function mapFinishReason(finishReason) {
  const mapping = {
    'STOP': 'end_turn',
    'MAX_TOKENS': 'max_tokens',
    'SAFETY': 'stop_sequence',
    'RECITATION': 'stop_sequence'
  };
  return mapping[finishReason] || 'end_turn';
}

// Convert Gemini response to Claude format
function geminiToClaudeResponse(geminiResponse, model, messageId) {
  const candidate = geminiResponse.candidates?.[0];
  if (!candidate) {
    throw new Error('No candidates in Gemini response');
  }

  const content = [];
  const parts = candidate.content?.parts || [];

  // Process each part (text or function call)
  for (const part of parts) {
    if (part.text) {
      content.push({
        type: 'text',
        text: part.text,
        citations: null
      });
    } else if (part.functionCall) {
      // Convert Gemini function call to Claude tool use format
      content.push({
        type: 'tool_use',
        id: `toolu_${Math.random().toString(36).substring(2, 15)}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {}
      });
    }
  }

  const stopReason = mapFinishReason(candidate.finishReason);

  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
      output_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0
    }
  };
}

// Parse SSE stream from Gemini
class GeminiStreamParser {
  constructor() {
    this.buffer = '';
  }

  parse(chunk) {
    this.buffer += chunk;
    const events = [];
    const regex = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/gm;
    let match;

    while ((match = regex.exec(this.buffer)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        events.push(data);
        this.buffer = this.buffer.substring(match[0].length);
      } catch (e) {
        // Skip invalid JSON
      }
    }

    return events;
  }
}

// Convert Gemini SSE stream to Claude SSE format
class ClaudeStreamConverter {
  constructor(model, messageId) {
    this.model = model;
    this.messageId = messageId;
    this.index = 0;
    this.lastData = null;
  }

  convertChunk(geminiData) {
    const events = [];
    const candidate = geminiData.candidates?.[0];
    if (!candidate) return events;

    // Send message_start on first chunk
    if (this.index === 0) {
      events.push({
        event: 'message_start',
        data: {
          type: 'message_start',
          message: {
            id: this.messageId,
            type: 'message',
            role: 'assistant',
            content: [],
            model: this.model,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        }
      });
    }

    // Process each part in the response
    const parts = candidate.content?.parts || [];
    parts.forEach((part, partIndex) => {
      // Handle text content
      if (part.text) {
        // Send content_block_start for text on first occurrence
        if (this.index === 0 && partIndex === 0) {
          events.push({
            event: 'content_block_start',
            data: {
              type: 'content_block_start',
              index: partIndex,
              content_block: { type: 'text', text: '' }
            }
          });
        }

        // Send text delta
        events.push({
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: partIndex,
            delta: { type: 'text_delta', text: part.text }
          }
        });
      }
      
      // Handle function call (tool use)
      else if (part.functionCall) {
        // Send content_block_start for tool_use
        events.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: partIndex,
            content_block: {
              type: 'tool_use',
              id: `toolu_${Math.random().toString(36).substring(2, 15)}`,
              name: part.functionCall.name,
              input: {}
            }
          }
        });

        // Send input delta
        events.push({
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: partIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: JSON.stringify(part.functionCall.args || {})
            }
          }
        });

        // Send content_block_stop for tool_use
        events.push({
          event: 'content_block_stop',
          data: {
            type: 'content_block_stop',
            index: partIndex
          }
        });

        console.log(`🔧 Streaming tool_use: ${part.functionCall.name}`);
      }
    });

    this.index++;
    this.lastData = geminiData;
    return events;
  }

  finalize() {
    const events = [];
    if (this.lastData) {
      const candidate = this.lastData.candidates?.[0];
      const stopReason = mapFinishReason(candidate?.finishReason);

      events.push({
        event: 'content_block_stop',
        data: {
          type: 'content_block_stop',
          index: 0
        }
      });

      events.push({
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: {
            output_tokens: this.lastData.usageMetadata?.candidatesTokenCount || 0
          }
        }
      });

      events.push({
        event: 'message_stop',
        data: {
          type: 'message_stop'
        }
      });
    }
    return events;
  }
}

// Format Claude SSE event
function formatClaudeSSE(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

module.exports = {
  buildGeminiUrl,
  claudeToGeminiRequest,
  geminiToClaudeResponse,
  generateMessageId,
  mapFinishReason,
  GeminiStreamParser,
  ClaudeStreamConverter,
  formatClaudeSSE,
  initializeMCP,
  getMCPIntegration: () => mcpIntegration
};
