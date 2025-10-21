# 递归 Schema 清理 - 完整解决方案

## 🐛 问题分析

### 错误日志分析

```json
{
  "error": {
    "code": 400,
    "message": "Invalid JSON payload received. Unknown name \"additionalProperties\" at 'tools[0].function_declarations[10].parameters.properties[0].value.items': Cannot find field."
  }
}
```

**关键发现**:
- ❌ `additionalProperties` 出现在 `properties[0].value.items` 中
- ❌ `additionalProperties` 出现在深层嵌套的 `items.properties[2].value.items` 中
- ❌ `exclusiveMinimum` 也是不支持的字段

**问题根源**:
- 之前只清理了顶层的 `additionalProperties` 和 `$schema`
- 但这些字段也出现在嵌套的 `properties`、`items`、`value` 中
- 需要**递归清理整个 schema 树**

---

## ✅ 完整解决方案

### 递归清理函数

```javascript
// Helper function: Recursively clean JSON Schema fields that Gemini doesn't support
function cleanJsonSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  
  // Handle arrays
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
    'exclusiveMinimum',      // ← 新发现
    'exclusiveMaximum',
    'multipleOf',
    'pattern',
    'format',
    'contentMediaType',
    'contentEncoding'
  ];
  
  // Copy supported fields and recursively clean nested objects
  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported fields
    if (unsupportedFields.includes(key)) {
      continue;
    }
    
    // Recursively clean nested objects and arrays
    if (typeof value === 'object' && value !== null) {
      cleaned[key] = cleanJsonSchema(value);
    } else {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
}
```

### 使用方式

```javascript
// Convert Claude tools to Gemini function declarations
if (claudeRequest.tools && Array.isArray(claudeRequest.tools)) {
  const functionDeclarations = claudeRequest.tools.map(tool => {
    // Recursively clean the entire input_schema tree
    const cleanedSchema = tool.input_schema 
      ? cleanJsonSchema(tool.input_schema)
      : {};

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
```

---

## 📊 清理示例

### 示例 1: 嵌套的 additionalProperties

**输入（Claude 格式）**:
```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" }
        },
        "additionalProperties": false  // ← 嵌套在 items 中
      }
    }
  },
  "additionalProperties": false  // ← 顶层
}
```

**输出（Gemini 格式）**:
```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" }
        }
        // ✅ additionalProperties 已移除
      }
    }
  }
  // ✅ additionalProperties 已移除
}
```

### 示例 2: 深层嵌套

**输入**:
```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "nested": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,  // ← 深层嵌套
              "properties": {
                "value": { "type": "string" }
              }
            }
          }
        }
      }
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

**输出**:
```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "nested": {
            "type": "array",
            "items": {
              "type": "object",
              // ✅ additionalProperties 已移除
              "properties": {
                "value": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
  // ✅ $schema 已移除
}
```

### 示例 3: exclusiveMinimum

**输入**:
```json
{
  "type": "object",
  "properties": {
    "age": {
      "type": "number",
      "minimum": 0,
      "exclusiveMinimum": true  // ← 不支持的字段
    }
  }
}
```

**输出**:
```json
{
  "type": "object",
  "properties": {
    "age": {
      "type": "number",
      "minimum": 0
      // ✅ exclusiveMinimum 已移除
    }
  }
}
```

---

## 🔍 Gemini 支持的字段

### ✅ 支持的字段

```javascript
const supportedFields = [
  // 基本类型
  'type',
  'description',
  
  // 对象相关
  'properties',
  'required',
  
  // 数组相关
  'items',
  
  // 数值约束
  'minimum',
  'maximum',
  
  // 字符串约束
  'minLength',
  'maxLength',
  
  // 枚举
  'enum'
];
```

### ❌ 不支持的字段（会被清理）

```javascript
const unsupportedFields = [
  // JSON Schema 元数据
  'additionalProperties',
  '$schema',
  '$id',
  '$ref',
  'definitions',
  
  // 文档字段
  'title',
  'examples',
  'default',
  
  // 访问控制
  'readOnly',
  'writeOnly',
  
  // 高级数值约束
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  
  // 字符串格式
  'pattern',
  'format',
  
  // 内容类型
  'contentMediaType',
  'contentEncoding'
];
```

---

## 🧪 测试用例

### 测试 1: 简单嵌套

```javascript
const input = {
  type: 'object',
  properties: {
    name: { type: 'string' }
  },
  additionalProperties: false
};

const output = cleanJsonSchema(input);
// 预期: additionalProperties 被移除
```

### 测试 2: 数组嵌套

```javascript
const input = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'number' }
    },
    additionalProperties: false
  }
};

const output = cleanJsonSchema(input);
// 预期: items 中的 additionalProperties 被移除
```

### 测试 3: 深层嵌套

```javascript
const input = {
  type: 'object',
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            additionalProperties: false
          }
        }
      }
    }
  },
  $schema: 'http://json-schema.org/draft-07/schema#'
};

const output = cleanJsonSchema(input);
// 预期: 所有层级的不支持字段都被移除
```

### 测试 4: 多个不支持字段

```javascript
const input = {
  type: 'object',
  properties: {
    age: {
      type: 'number',
      minimum: 0,
      exclusiveMinimum: true,
      multipleOf: 1
    }
  },
  additionalProperties: false,
  $schema: 'http://json-schema.org/draft-07/schema#'
};

const output = cleanJsonSchema(input);
// 预期: exclusiveMinimum, multipleOf, additionalProperties, $schema 都被移除
```

---

## 🚀 部署和验证

### 1. 重启服务

```bash
docker compose restart
```

### 2. 测试基本功能

```bash
curl -X POST http://localhost:9000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-local-api-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "gemini-2.5-flash",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "test"}],
    "tools": [{
      "name": "test_tool",
      "input_schema": {
        "type": "object",
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false
            }
          }
        },
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }]
  }'
```

### 3. 在 Claude Code 中测试

1. 打开 Claude Code
2. 打开一个项目
3. 尝试使用 MCP 工具：
   - Context7: 查询库文档
   - Sequential: 复杂推理
   - 其他 MCP 工具

### 4. 查看日志验证

```bash
# 查看转换后的请求
docker logs gemini-claude-proxy | grep "Converted to Gemini"

# 确认没有 400 错误
docker logs gemini-claude-proxy | grep "400"

# 确认没有 Schema 错误
docker logs gemini-claude-proxy | grep "additionalProperties\|exclusiveMinimum"
```

---

## 📊 预期结果

### ✅ 成功标志

1. **无 400 错误**
   ```bash
   docker logs gemini-claude-proxy | grep "400"
   # 应该没有输出或很少
   ```

2. **工具调用成功**
   ```json
   {
     "type": "message",
     "content": [
       {
         "type": "tool_use",
         "name": "mcp__context7__resolve-library-id",
         "input": { ... }
       }
     ]
   }
   ```

3. **Claude Code 正常工作**
   - MCP 工具可以调用
   - 工具响应正确
   - 无错误提示

### ❌ 失败标志

1. **仍有 400 错误**
   - 检查日志中的具体字段
   - 可能需要添加更多不支持的字段到清理列表

2. **工具调用失败**
   - 检查 schema 是否被过度清理
   - 确认必要字段（type, properties, required）仍然存在

---

## 🔧 调试技巧

### 1. 打印清理前后的 Schema

```javascript
// 在 cleanJsonSchema 函数前添加
console.log('Original schema:', JSON.stringify(tool.input_schema, null, 2));

const cleanedSchema = cleanJsonSchema(tool.input_schema);

console.log('Cleaned schema:', JSON.stringify(cleanedSchema, null, 2));
```

### 2. 验证特定字段

```javascript
// 检查是否还有不支持的字段
function hasUnsupportedFields(obj, path = '') {
  if (!obj || typeof obj !== 'object') return false;
  
  const unsupported = ['additionalProperties', '$schema', 'exclusiveMinimum'];
  
  for (const [key, value] of Object.entries(obj)) {
    if (unsupported.includes(key)) {
      console.warn(`Found unsupported field: ${path}.${key}`);
      return true;
    }
    if (typeof value === 'object') {
      if (hasUnsupportedFields(value, `${path}.${key}`)) {
        return true;
      }
    }
  }
  return false;
}
```

### 3. 对比原始和清理后的大小

```javascript
const originalSize = JSON.stringify(tool.input_schema).length;
const cleanedSize = JSON.stringify(cleanedSchema).length;
console.log(`Schema size: ${originalSize} → ${cleanedSize} (${originalSize - cleanedSize} bytes removed)`);
```

---

## 💡 性能考虑

### 递归清理的性能

- **时间复杂度**: O(n)，其中 n 是 schema 中的节点总数
- **空间复杂度**: O(d)，其中 d 是 schema 的最大深度
- **实际影响**: 可忽略不计（通常 < 1ms）

### 优化建议

如果有大量工具定义，可以考虑缓存：

```javascript
const schemaCache = new Map();

function getCleaned Schema(schema) {
  const key = JSON.stringify(schema);
  if (schemaCache.has(key)) {
    return schemaCache.get(key);
  }
  
  const cleaned = cleanJsonSchema(schema);
  schemaCache.set(key, cleaned);
  return cleaned;
}
```

---

## ✅ 验证清单

- [ ] 代码已更新（递归清理函数）
- [ ] 服务已重启
- [ ] 无 400 Schema 错误
- [ ] Claude Code 可以使用所有 MCP 工具
- [ ] 工具调用响应正确
- [ ] 日志中无不支持字段的错误
- [ ] 性能正常（无明显延迟）

---

**更新时间**: 2025-10-20  
**版本**: v1.2.2 - 递归 Schema 清理  
**状态**: ✅ 完整解决方案
