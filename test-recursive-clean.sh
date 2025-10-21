#!/bin/bash

# 递归 Schema 清理测试脚本

echo "🧪 测试递归 Schema 清理..."
echo "================================"
echo ""

# 测试 1: 嵌套的 additionalProperties
echo "📝 测试 1: 嵌套的 additionalProperties"
echo "--------------------------------"

RESPONSE1=$(curl -s -X POST http://localhost:9000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-local-api-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "gemini-2.5-flash",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "test"}],
    "tools": [{
      "name": "nested_tool",
      "input_schema": {
        "type": "object",
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string"}
              },
              "additionalProperties": false
            }
          }
        },
        "additionalProperties": false
      }
    }]
  }')

if echo "$RESPONSE1" | jq -e '.error' > /dev/null 2>&1; then
    ERROR_MSG=$(echo "$RESPONSE1" | jq -r '.error.message')
    if [[ "$ERROR_MSG" == *"additionalProperties"* ]]; then
        echo "❌ 测试 1 失败: 嵌套的 additionalProperties 未被清理"
        echo "错误: $ERROR_MSG"
    else
        echo "⚠️  测试 1: 其他错误 - $ERROR_MSG"
    fi
else
    echo "✅ 测试 1 通过: 嵌套的 additionalProperties 已清理"
fi

echo ""

# 测试 2: exclusiveMinimum
echo "📝 测试 2: exclusiveMinimum 字段"
echo "--------------------------------"

RESPONSE2=$(curl -s -X POST http://localhost:9000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-local-api-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "gemini-2.5-flash",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "test"}],
    "tools": [{
      "name": "number_tool",
      "input_schema": {
        "type": "object",
        "properties": {
          "age": {
            "type": "number",
            "minimum": 0,
            "exclusiveMinimum": true
          }
        }
      }
    }]
  }')

if echo "$RESPONSE2" | jq -e '.error' > /dev/null 2>&1; then
    ERROR_MSG=$(echo "$RESPONSE2" | jq -r '.error.message')
    if [[ "$ERROR_MSG" == *"exclusiveMinimum"* ]]; then
        echo "❌ 测试 2 失败: exclusiveMinimum 未被清理"
        echo "错误: $ERROR_MSG"
    else
        echo "⚠️  测试 2: 其他错误 - $ERROR_MSG"
    fi
else
    echo "✅ 测试 2 通过: exclusiveMinimum 已清理"
fi

echo ""

# 测试 3: 深层嵌套
echo "📝 测试 3: 深层嵌套结构"
echo "--------------------------------"

RESPONSE3=$(curl -s -X POST http://localhost:9000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-local-api-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "gemini-2.5-flash",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "test"}],
    "tools": [{
      "name": "deep_nested_tool",
      "input_schema": {
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
                    "properties": {
                      "value": {"type": "string"}
                    },
                    "additionalProperties": false
                  }
                }
              }
            }
          }
        },
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }]
  }')

if echo "$RESPONSE3" | jq -e '.error' > /dev/null 2>&1; then
    ERROR_MSG=$(echo "$RESPONSE3" | jq -r '.error.message')
    if [[ "$ERROR_MSG" == *"additionalProperties"* ]] || [[ "$ERROR_MSG" == *"\$schema"* ]]; then
        echo "❌ 测试 3 失败: 深层嵌套字段未被清理"
        echo "错误: $ERROR_MSG"
    else
        echo "⚠️  测试 3: 其他错误 - $ERROR_MSG"
    fi
else
    echo "✅ 测试 3 通过: 深层嵌套字段已清理"
fi

echo ""

# 测试 4: 多个不支持字段
echo "📝 测试 4: 多个不支持字段"
echo "--------------------------------"

RESPONSE4=$(curl -s -X POST http://localhost:9000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-local-api-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "gemini-2.5-flash",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "test"}],
    "tools": [{
      "name": "multi_field_tool",
      "input_schema": {
        "type": "object",
        "properties": {
          "value": {
            "type": "number",
            "minimum": 0,
            "exclusiveMinimum": true,
            "multipleOf": 1
          }
        },
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Test Schema"
      }
    }]
  }')

if echo "$RESPONSE4" | jq -e '.error' > /dev/null 2>&1; then
    ERROR_MSG=$(echo "$RESPONSE4" | jq -r '.error.message')
    if [[ "$ERROR_MSG" == *"additionalProperties"* ]] || \
       [[ "$ERROR_MSG" == *"exclusiveMinimum"* ]] || \
       [[ "$ERROR_MSG" == *"multipleOf"* ]] || \
       [[ "$ERROR_MSG" == *"title"* ]]; then
        echo "❌ 测试 4 失败: 某些不支持字段未被清理"
        echo "错误: $ERROR_MSG"
    else
        echo "⚠️  测试 4: 其他错误 - $ERROR_MSG"
    fi
else
    echo "✅ 测试 4 通过: 所有不支持字段已清理"
fi

echo ""
echo "================================"
echo "📊 测试总结"
echo "================================"
echo ""

# 统计结果
TOTAL=4
PASSED=$(echo "$RESPONSE1 $RESPONSE2 $RESPONSE3 $RESPONSE4" | grep -o "✅" | wc -l)

echo "总测试数: $TOTAL"
echo "通过: $PASSED"
echo "失败: $((TOTAL - PASSED))"
echo ""

if [ $PASSED -eq $TOTAL ]; then
    echo "🎉 所有测试通过！Schema 清理工作正常"
    echo ""
    echo "✅ 下一步:"
    echo "  1. 在 Claude Code 中测试 MCP 工具"
    echo "  2. 验证工具调用正常工作"
    echo "  3. 监控日志确认无 400 错误"
else
    echo "⚠️  部分测试失败，请检查:"
    echo "  1. 服务是否已重启"
    echo "  2. 代码是否正确更新"
    echo "  3. 查看详细日志: docker logs gemini-claude-proxy"
fi

echo ""
echo "💡 查看详细日志:"
echo "   docker logs gemini-claude-proxy | tail -50"
echo ""
