# 全面修复计划 - 达到 100% 兼容性

基于官方文档分析，以下是完整的修复计划。

## 📋 问题清单

### 🔴 优先级 1: 关键功能缺失

#### 1.1 Gemini 结构化输出支持（responseJsonSchema）
**状态**: ❌ 完全缺失  
**影响**: 无法使用 Gemini 的 JSON Schema 约束功能  
**官方文档**:
```javascript
{
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseJsonSchema": {
      "type": "object",
      "properties": {
        "recipe_name": { "type": "string" },
        "ingredients": { "type": "array", "items": {...} }
      },
      "required": ["recipe_name", "ingredients"]
    }
  }
}
```

**修复方案**:
```javascript
// 在 claudeToGeminiRequest 中添加
if (claudeRequest.response_format?.type === 'json_object') {
  geminiRequest.generationConfig.responseMimeType = 'application/json';
  
  if (claudeRequest.response_format.schema) {
    geminiRequest.generationConfig.responseJsonSchema = 
      cleanJsonSchema(claudeRequest.response_format.schema);
  }
}
```

#### 1.2 工具名称映射逻辑缺陷
**状态**: ⚠️ 存在问题  
**当前实现**:
```javascript
let functionName = block.tool_use_id; // 简单使用ID作为名称
```

**问题**: 
- 使用 tool_use_id 作为 fallback 不正确
- 向后搜索逻辑可能在复杂对话中失败

**修复方案**:
```javascript
function findFunctionName(toolUseId, messages) {
  // 从后向前搜索，找到最近的 tool_use
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && block.id === toolUseId) {
          return block.name;
        }
      }
    }
  }
  
  // 如果找不到，记录错误并返回 null
  console.error(`❌ Could not find tool_use with id: ${toolUseId}`);
  return null;
}
```

### 🟡 优先级 2: Schema 清理优化

#### 2.1 当前清理过于激进
**问题**: 删除了一些 Gemini 实际支持的字段

**Gemini 实际支持的字段**（根据官方文档）:
```javascript
// ✅ Gemini 支持
{
  "type": "object",
  "properties": {...},
  "required": [...],
  "description": "...",
  "enum": [...],        // ✅ 支持
  "items": {...}        // ✅ 支持（数组）
}
```

**Gemini 不支持的字段**:
```javascript
// ❌ Gemini 不支持
{
  "$schema": "...",
  "additionalProperties": false,
  "minLength": 1,
  "maxLength": 100,
  "minimum": 0,
  "maximum": 100,
  "pattern": "^[a-z]+$",
  "format": "uri"
}
```

**修复方案**: 精确清理列表
```javascript
const trulyUnsupportedFields = [
  // 元数据（确认不支持）
  '$schema', '$id', '$ref', 'definitions',
  'title', 'examples', 'default',
  
  // 访问控制（确认不支持）
  'readOnly', 'writeOnly',
  
  // 数值约束（确认不支持）
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  
  // 字符串约束（确认不支持）
  'minLength', 'maxLength', 'pattern', 'format',
  
  // 数组约束（确认不支持）
  'minItems', 'maxItems', 'uniqueItems',
  
  // 对象约束（确认不支持）
  'minProperties', 'maxProperties', 'patternProperties', 'dependencies',
  'additionalProperties',  // ⚠️ 关键：必须删除
  
  // 高级约束（确认不支持）
  'const', 'allOf', 'anyOf', 'oneOf', 'not',
  
  // 内容相关（确认不支持）
  'contentMediaType', 'contentEncoding'
];
```

### 🟢 优先级 3: 错误处理增强

#### 3.1 Gemini 特定错误码处理
**当前**: 只有通用错误处理  
**需要**: 针对 Gemini 错误码的特定处理

**Gemini 常见错误码**:
- `400 INVALID_ARGUMENT`: 参数错误
- `429 RESOURCE_EXHAUSTED`: 配额耗尽
- `500 INTERNAL`: 服务器错误
- `503 UNAVAILABLE`: 服务不可用

**修复方案**:
```javascript
function handleGeminiError(response, error) {
  const errorMap = {
    400: {
      type: 'invalid_request_error',
      message: 'Invalid request parameters'
    },
    429: {
      type: 'rate_limit_error',
      message: 'API rate limit exceeded'
    },
    500: {
      type: 'api_error',
      message: 'Gemini API internal error'
    },
    503: {
      type: 'overloaded_error',
      message: 'Gemini API temporarily unavailable'
    }
  };
  
  const mapped = errorMap[response.status] || {
    type: 'api_error',
    message: 'Unknown Gemini API error'
  };
  
  return {
    error: {
      type: mapped.type,
      message: mapped.message,
      details: error
    }
  };
}
```

### 🔵 优先级 4: 功能完善

#### 4.1 Tool Config 支持
**Gemini 支持的 tool_config**:
```javascript
{
  "tool_config": {
    "function_calling_config": {
      "mode": "ANY" | "AUTO" | "NONE"
    }
  }
}
```

**Claude 对应**: 
```javascript
{
  "tool_choice": {
    "type": "any" | "auto" | "tool",
    "name": "tool_name"  // 当 type="tool" 时
  }
}
```

**修复方案**:
```javascript
// 转换 tool_choice 到 tool_config
if (claudeRequest.tool_choice) {
  const modeMap = {
    'auto': 'AUTO',
    'any': 'ANY',
    'tool': 'ANY'  // Claude 的 tool 模式映射到 Gemini 的 ANY
  };
  
  geminiRequest.tool_config = {
    function_calling_config: {
      mode: modeMap[claudeRequest.tool_choice.type] || 'AUTO'
    }
  };
}
```

## 📝 实施步骤

### Step 1: 修复工具名称映射（最关键）
1. 创建 `findFunctionName` 辅助函数
2. 更新 `tool_result` 转换逻辑
3. 添加错误处理和日志

### Step 2: 添加结构化输出支持
1. 检测 `response_format` 字段
2. 转换为 `responseMimeType` 和 `responseJsonSchema`
3. 清理 schema 中的不支持字段

### Step 3: 优化 Schema 清理
1. 更新 `unsupportedFields` 列表
2. 保留 Gemini 支持的字段（enum, description）
3. 添加验证日志

### Step 4: 增强错误处理
1. 添加 Gemini 错误码映射
2. 改进错误消息
3. 添加重试逻辑（可选）

### Step 5: 添加 Tool Config 支持
1. 转换 `tool_choice` 到 `tool_config`
2. 处理强制工具调用模式
3. 测试不同模式

## 🧪 测试计划

### 测试用例 1: 基本工具调用
```javascript
// Claude 请求
{
  "messages": [{ "role": "user", "content": "查询天气" }],
  "tools": [{ "name": "get_weather", ... }]
}

// 预期: Gemini 返回 functionCall
```

### 测试用例 2: 工具结果提交
```javascript
// Claude 请求
{
  "messages": [
    { "role": "user", "content": "查询天气" },
    { "role": "assistant", "content": [{ "type": "tool_use", "id": "toolu_xxx", "name": "get_weather" }] },
    { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_xxx", "content": "晴天" }] }
  ],
  "tools": [...]
}

// 预期: 
// 1. 正确找到 function name
// 2. 不发送 tools 到 Gemini
// 3. Gemini 返回文本响应
```

### 测试用例 3: 结构化输出
```javascript
// Claude 请求
{
  "messages": [{ "role": "user", "content": "提取食谱" }],
  "response_format": {
    "type": "json_object",
    "schema": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "ingredients": { "type": "array" }
      }
    }
  }
}

// 预期: Gemini 返回符合 schema 的 JSON
```

### 测试用例 4: 强制工具调用
```javascript
// Claude 请求
{
  "messages": [{ "role": "user", "content": "帮我做点什么" }],
  "tools": [...],
  "tool_choice": { "type": "any" }
}

// 预期: Gemini 必须调用工具
```

## 📊 成功标准

- ✅ 所有基本工具调用正常工作
- ✅ 工具结果正确映射
- ✅ 结构化输出功能可用
- ✅ 错误处理完善
- ✅ 日志清晰易懂
- ✅ 性能无明显下降
- ✅ 向后兼容现有功能

## 🎯 目标

**达到 100% 兼容性**：
- Claude Code 的所有功能都能通过代理正常工作
- 错误信息清晰准确
- 性能优化
- 代码质量高

---

**预计完成时间**: 2-3 小时  
**风险等级**: 中等  
**回滚策略**: Git 版本控制，可随时回滚
