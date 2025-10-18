//Author: PublicAffairs (Modified for Anthropic-Gemini conversion)
//MIT License

import { Buffer } from "node:buffer";

// Worker 主入口：处理所有 API 请求
export default {
  async fetch(request) {
    // 处理 CORS 预检请求
    if (request.method === "OPTIONS") {
      return handleOPTIONS();
    }

    // 统一错误处理函数
    const errHandler = (err) => {
      console.error(err);
      return new Response(err.message, fixCors({ status: err.status ?? 500 }));
    };

    try {
      // 从 Authorization 头中提取 API Key
      const auth = request.headers.get("Authorization");
      const apiKey = auth?.split(" ")[1];

      // 断言辅助函数：验证请求方法
      const assert = (success) => {
        if (!success) {
          throw new HttpError("The specified HTTP method is not allowed for the requested resource", 400);
        }
      };

      // 根据路径路由到不同的处理函数
      const { pathname } = new URL(request.url);
      switch (true) {
        case pathname.includes("/v1/messages"):
          // Anthropic Messages API -> Gemini
          assert(request.method === "POST");
          return handleAnthropicToGemini(await request.json(), apiKey)
            .catch(errHandler);
        case pathname.includes("/v1beta/models/") && pathname.includes("generateContent"):
          // Gemini -> Anthropic Messages API
          assert(request.method === "POST");
          return handleGeminiToAnthropic(await request.json(), apiKey, pathname)
            .catch(errHandler);
        default:
          throw new HttpError("404 Not Found", 404);
      }
    } catch (err) {
      return errHandler(err);
    }
  }
};

// 自定义 HTTP 错误类，包含状态码
class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

// 为响应添加 CORS 头，允许跨域访问
const fixCors = ({ headers, status, statusText }) => {
  headers = new Headers(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return { headers, status, statusText };
};

// 处理 CORS 预检请求（OPTIONS 方法）
const handleOPTIONS = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
    }
  });
};

// Gemini API 配置
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const GEMINI_API_VERSION = "v1beta";
const API_CLIENT = "genai-js/0.21.0";

// 构造 Gemini API 请求头
const makeGeminiHeaders = (apiKey, more) => ({
  "x-goog-api-client": API_CLIENT,
  ...(apiKey && { "x-goog-api-key": apiKey }),
  ...more
});

// Gemini 安全设置：定义所有危害类别
const harmCategory = [
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_CIVIC_INTEGRITY",
];

// 将所有安全过滤设置为不阻止（BLOCK_NONE）
const safetySettings = harmCategory.map(category => ({
  category,
  threshold: "BLOCK_NONE",
}));

// 默认模型
const DEFAULT_GEMINI_MODEL = "gemini-1.5-pro-latest";

// ============ Anthropic -> Gemini 转换 ============

// 处理 Anthropic Messages API 请求并转换为 Gemini 格式
async function handleAnthropicToGemini(req, apiKey) {
  // 提取模型名称
  let model = req.model || DEFAULT_GEMINI_MODEL;
  if (model.startsWith("claude-")) {
    // 将 Claude 模型映射到 Gemini 模型
    model = DEFAULT_GEMINI_MODEL;
  }

  // 根据是否流式选择不同的 API 端点
  const TASK = req.stream ? "streamGenerateContent" : "generateContent";
  let url = `${GEMINI_BASE_URL}/${GEMINI_API_VERSION}/models/${model}:${TASK}`;
  if (req.stream) { url += "?alt=sse"; }

  // 转换请求格式
  const geminiRequest = anthropicToGeminiRequest(req);

  // 发送请求到 Gemini API
  const response = await fetch(url, {
    method: "POST",
    headers: makeGeminiHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(geminiRequest),
  });

  let body = response.body;
  if (response.ok) {
    const msgId = generateMessageId();

    if (req.stream) {
      // 流式响应：转换 Gemini SSE 到 Anthropic SSE
      body = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream({
          transform: parseStream,
          flush: parseStreamFlush,
          buffer: "",
        }))
        .pipeThrough(new TransformStream({
          transform: geminiToAnthropicStream,
          flush: geminiToAnthropicStreamFlush,
          model, msgId, index: 0,
        }))
        .pipeThrough(new TextEncoderStream());
    } else {
      // 非流式响应：直接转换 JSON
      const geminiResponse = JSON.parse(await response.text());
      body = JSON.stringify(geminiToAnthropicResponse(geminiResponse, model, msgId));
    }
  }
  return new Response(body, fixCors(response));
}

// 转换 Anthropic 请求到 Gemini 格式
function anthropicToGeminiRequest(req) {
  const contents = [];
  let system_instruction;

  // 处理 system 参数
  if (req.system) {
    system_instruction = {
      parts: [{ text: req.system }]
    };
  }

  // 转换消息
  for (const msg of req.messages || []) {
    const role = msg.role === "assistant" ? "model" : "user";
    const parts = [];

    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "text") {
          parts.push({ text: block.text });
        } else if (block.type === "image") {
          parts.push({
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data,
            }
          });
        }
      }
    }

    contents.push({ role, parts });
  }

  // 构建生成配置
  const generationConfig = {};
  if (req.max_tokens) generationConfig.maxOutputTokens = req.max_tokens;
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.top_p !== undefined) generationConfig.topP = req.top_p;
  if (req.top_k !== undefined) generationConfig.topK = req.top_k;
  if (req.stop_sequences) generationConfig.stopSequences = req.stop_sequences;

  return {
    ...(system_instruction && { system_instruction }),
    contents,
    safetySettings,
    generationConfig,
  };
}

// 转换 Gemini 响应到 Anthropic 格式
function geminiToAnthropicResponse(geminiResp, model, msgId) {
  const candidate = geminiResp.candidates?.[0];
  if (!candidate) {
    throw new HttpError("No candidates in response", 500);
  }

  const content = candidate.content?.parts
    .map(p => ({
      type: "text",
      text: p.text || ""
    }))
    .filter(c => c.text) || [];

  const stopReason = mapGeminiStopReason(candidate.finishReason);

  return {
    id: msgId,
    type: "message",
    role: "assistant",
    content,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: geminiResp.usageMetadata?.promptTokenCount || 0,
      output_tokens: geminiResp.usageMetadata?.candidatesTokenCount || 0,
    }
  };
}

// 映射 Gemini 停止原因到 Anthropic 格式
function mapGeminiStopReason(finishReason) {
  const mapping = {
    "STOP": "end_turn",
    "MAX_TOKENS": "max_tokens",
    "SAFETY": "stop_sequence",
    "RECITATION": "stop_sequence",
  };
  return mapping[finishReason] || "end_turn";
}

// 流式转换：Gemini SSE -> Anthropic SSE
async function geminiToAnthropicStream(chunk, controller) {
  const line = await chunk;
  if (!line) return;

  let data;
  try {
    data = JSON.parse(line);
  } catch (err) {
    console.error("Parse error:", err);
    return;
  }

  const candidate = data.candidates?.[0];
  if (!candidate) return;

  // 发送 content_block_start (首次)
  if (this.index === 0) {
    controller.enqueue(`event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: this.msgId,
        type: "message",
        role: "assistant",
        content: [],
        model: this.model,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    })}\n\n`);

    controller.enqueue(`event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" }
    })}\n\n`);
  }

  // 发送 content_block_delta
  const text = candidate.content?.parts?.[0]?.text || "";
  if (text) {
    controller.enqueue(`event: content_block_delta\ndata: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text }
    })}\n\n`);
  }

  this.index++;
  this.lastData = data;
}

// 流式结束
async function geminiToAnthropicStreamFlush(controller) {
  if (this.lastData) {
    const candidate = this.lastData.candidates?.[0];
    const stopReason = mapGeminiStopReason(candidate?.finishReason);

    controller.enqueue(`event: content_block_stop\ndata: ${JSON.stringify({
      type: "content_block_stop",
      index: 0
    })}\n\n`);

    controller.enqueue(`event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: {
        output_tokens: this.lastData.usageMetadata?.candidatesTokenCount || 0
      }
    })}\n\n`);

    controller.enqueue(`event: message_stop\ndata: ${JSON.stringify({
      type: "message_stop"
    })}\n\n`);
  }
}

// ============ Gemini -> Anthropic 转换 ============

// 处理 Gemini 请求并转换为 Anthropic 格式（反向代理）
async function handleGeminiToAnthropic(req, apiKey, pathname) {
  // 从路径提取模型名称
  const modelMatch = pathname.match(/models\/([^:]+)/);
  const model = modelMatch ? modelMatch[1] : DEFAULT_GEMINI_MODEL;

  // 转换为 Anthropic 请求
  const anthropicRequest = geminiToAnthropicRequest(req, model);

  // 这里需要 Anthropic API Key，从环境变量或请求头获取
  // 注意：实际使用时需要配置 Anthropic API endpoint
  const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
  
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(anthropicRequest),
  });

  let body = response.body;
  if (response.ok) {
    const anthropicResponse = JSON.parse(await response.text());
    body = JSON.stringify(anthropicToGeminiResponse(anthropicResponse));
  }

  return new Response(body, fixCors(response));
}

// 转换 Gemini 请求到 Anthropic 格式
function geminiToAnthropicRequest(req, model) {
  const messages = [];
  let system;

  // 提取 system instruction
  if (req.system_instruction) {
    system = req.system_instruction.parts.map(p => p.text).join("\n");
  }

  // 转换消息
  for (const content of req.contents || []) {
    const role = content.role === "model" ? "assistant" : "user";
    const contentBlocks = [];

    for (const part of content.parts || []) {
      if (part.text !== undefined) {
        contentBlocks.push({ type: "text", text: part.text });
      } else if (part.inlineData) {
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: part.inlineData.mimeType,
            data: part.inlineData.data,
          }
        });
      }
    }

    messages.push({
      role,
      content: contentBlocks.length === 1 && contentBlocks[0].type === "text"
        ? contentBlocks[0].text
        : contentBlocks
    });
  }

  // 构建请求
  const anthropicReq = {
    model: model.startsWith("gemini-") ? "claude-3-5-sonnet-20241022" : model,
    messages,
    max_tokens: req.generationConfig?.maxOutputTokens || 4096,
  };

  if (system) anthropicReq.system = system;
  if (req.generationConfig?.temperature !== undefined) {
    anthropicReq.temperature = req.generationConfig.temperature;
  }
  if (req.generationConfig?.topP !== undefined) {
    anthropicReq.top_p = req.generationConfig.topP;
  }
  if (req.generationConfig?.topK !== undefined) {
    anthropicReq.top_k = req.generationConfig.topK;
  }
  if (req.generationConfig?.stopSequences) {
    anthropicReq.stop_sequences = req.generationConfig.stopSequences;
  }

  return anthropicReq;
}

// 转换 Anthropic 响应到 Gemini 格式
function anthropicToGeminiResponse(anthropicResp) {
  const parts = [];
  
  for (const block of anthropicResp.content || []) {
    if (block.type === "text") {
      parts.push({ text: block.text });
    }
  }

  const finishReason = mapAnthropicStopReason(anthropicResp.stop_reason);

  return {
    candidates: [{
      content: { parts, role: "model" },
      finishReason,
      index: 0,
    }],
    usageMetadata: {
      promptTokenCount: anthropicResp.usage?.input_tokens || 0,
      candidatesTokenCount: anthropicResp.usage?.output_tokens || 0,
      totalTokenCount: (anthropicResp.usage?.input_tokens || 0) + (anthropicResp.usage?.output_tokens || 0),
    }
  };
}

// 映射 Anthropic 停止原因到 Gemini 格式
function mapAnthropicStopReason(stopReason) {
  const mapping = {
    "end_turn": "STOP",
    "max_tokens": "MAX_TOKENS",
    "stop_sequence": "STOP",
  };
  return mapping[stopReason] || "STOP";
}

// ============ 工具函数 ============

// 生成 Anthropic 格式的消息 ID
const generateMessageId = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomChar = () => characters[Math.floor(Math.random() * characters.length)];
  return "msg_" + Array.from({ length: 29 }, randomChar).join("");
};

// SSE 数据行的正则表达式
const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;

// 解析 SSE 流
async function parseStream(chunk, controller) {
  chunk = await chunk;
  if (!chunk) return;

  this.buffer += chunk;

  do {
    const match = this.buffer.match(responseLineRE);
    if (!match) break;
    controller.enqueue(match[1]);
    this.buffer = this.buffer.substring(match[0].length);
  } while (true); // eslint-disable-line no-constant-condition
}

// 流结束时处理剩余缓冲区
async function parseStreamFlush(controller) {
  if (this.buffer) {
    console.error("Invalid data:", this.buffer);
    controller.enqueue(this.buffer);
  }
}
