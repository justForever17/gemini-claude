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
  
  const content = candidate.content?.parts
    ?.map(p => ({
      type: 'text',
      text: p.text || '',
      citations: null
    }))
    .filter(c => c.text) || [];
  
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
