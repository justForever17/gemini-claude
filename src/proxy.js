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
 * @param {Object} config - Configuration object with geminiApiUrl, geminiModelName, and geminiApiKey
 * @param {boolean} stream - Whether this is a streaming request
 * @returns {string} Complete API endpoint URL with key parameter
 */
function buildGeminiUrl(config, stream) {
  const { geminiApiUrl, geminiModelName, geminiApiKey } = config;
  let url = `${geminiApiUrl}/models/${geminiModelName}:`;
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
    geminiRequest.generationConfig.maxOutputTokens = claudeRequest.max_tokens;
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
  function cleanJsonSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // Handle arrays - recurse into each element
    if (Array.isArray(schema)) {
      return schema.map(item => cleanJsonSchema(item));
    }

    // Create a clean copy
    const cleaned = {};

    // List of JSON Schema fields that Gemini doesn't accept
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
      'multipleOf',
      'pattern',
      'format',
      'contentMediaType',
      'contentEncoding'
    ];

    // Fields that contain schemas as object values (each value is a schema)
    const schemaContainerFields = [
      'properties',
      'patternProperties',
      'dependentSchemas'
    ];

    // Fields that contain schema arrays
    const schemaArrayFields = [
      'anyOf',
      'oneOf',
      'allOf'
    ];

    // Fields that contain a single schema
    const schemaSingleFields = [
      'not',
      'if',
      'then',
      'else',
      'contains',
      'propertyNames',
      'additionalItems'
    ];

    // Copy supported fields and recursively clean nested schemas
    for (const [key, value] of Object.entries(schema)) {
      // Skip unsupported fields entirely
      if (unsupportedFields.includes(key)) {
        continue;
      }

      // Handle schema container fields (properties, patternProperties, etc.)
      // These are objects where each value is a schema
      if (schemaContainerFields.includes(key) && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        cleaned[key] = {};
        for (const [propKey, propValue] of Object.entries(value)) {
          cleaned[key][propKey] = cleanJsonSchema(propValue);
        }
        continue;
      }

      // Handle schema array fields (anyOf, oneOf, allOf)
      // These are arrays where each element is a schema
      if (schemaArrayFields.includes(key) && Array.isArray(value)) {
        cleaned[key] = value.map(item => cleanJsonSchema(item));
        continue;
      }

      // Handle single schema fields (not, if, then, else, etc.)
      // These contain a single schema object
      if (schemaSingleFields.includes(key) && typeof value === 'object' && value !== null) {
        cleaned[key] = cleanJsonSchema(value);
        continue;
      }

      // Handle 'items' field specially - can be schema or array of schemas
      if (key === 'items') {
        if (Array.isArray(value)) {
          cleaned[key] = value.map(item => cleanJsonSchema(item));
        } else if (typeof value === 'object' && value !== null) {
          cleaned[key] = cleanJsonSchema(value);
        } else {
          cleaned[key] = value;
        }
        continue;
      }

      // Handle 'dependencies' field - can contain schemas or string arrays
      if (key === 'dependencies' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        cleaned[key] = {};
        for (const [depKey, depValue] of Object.entries(value)) {
          if (Array.isArray(depValue)) {
            // Array of property names - keep as is
            cleaned[key][depKey] = depValue;
          } else if (typeof depValue === 'object' && depValue !== null) {
            // Schema object - recurse
            cleaned[key][depKey] = cleanJsonSchema(depValue);
          } else {
            cleaned[key][depKey] = depValue;
          }
        }
        continue;
      }

      // For all other fields, recursively clean if object or array
      if (typeof value === 'object' && value !== null) {
        cleaned[key] = cleanJsonSchema(value);
      } else {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }

  // Helper function: Validate that cleaned schema has no unsupported fields
  function validateCleanedSchema(schema, toolName, toolIndex) {
    if (!schema || typeof schema !== 'object') {
      return true;
    }

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
      'multipleOf',
      'pattern',
      'format',
      'contentMediaType',
      'contentEncoding'
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

  // Convert Claude tools to Gemini function declarations
  if (claudeRequest.tools && Array.isArray(claudeRequest.tools)) {
    const functionDeclarations = claudeRequest.tools.map((tool, index) => {
      // Recursively clean the entire input_schema tree
      const cleanedSchema = tool.input_schema
        ? cleanJsonSchema(tool.input_schema)
        : {};

      // Validate that cleaning was successful
      validateCleanedSchema(cleanedSchema, tool.name, index);

      // Debug logging for problematic tools (based on error log)
      const problematicIndices = [10, 14, 26, 55, 57, 62];
      if (problematicIndices.includes(index)) {
        console.log(`🔍 Tool[${index}] "${tool.name}" - Schema cleaned and validated`);
      }

      return {
        name: tool.name,
        description: tool.description || '',
        parameters: cleanedSchema
      };
    });

    if (functionDeclarations.length > 0) {
      geminiRequest.tools = [{
        function_declarations: functionDeclarations
      }];
    }
  }

  return geminiRequest;
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

    // Send message_start and content_block_start on first chunk
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

      events.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        }
      });
    }

    // Send content_block_delta
    const text = candidate.content?.parts?.[0]?.text || '';
    if (text) {
      events.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text }
        }
      });
    }

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
  formatClaudeSSE
};
