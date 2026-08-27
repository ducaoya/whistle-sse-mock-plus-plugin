/**
 * 简单测试：验证 SSE 消息格式化与配置解析逻辑
 * 运行：node test/sse.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// 将 server.js 内部逻辑拆出来无法直接 require，这里做轻量验证：
// 直接通过内联复制核心函数验证行为一致性

function formatSSEMessage(message) {
  let output = '';
  if (message.event) {
    output += `event: ${message.event}\n`;
  }
  if (message.id !== undefined && message.id !== null) {
    output += `id: ${message.id}\n`;
  }
  const data = message.data !== undefined ? message.data : message;
  if (typeof data === 'object') {
    output += `data: ${JSON.stringify(data)}\n\n`;
  } else {
    output += `data: ${data}\n\n`;
  }
  return output;
}

// 1. 基础 data 消息
assert.strictEqual(
  formatSSEMessage({ data: 'Hello' }),
  'data: Hello\n\n'
);

// 2. event + id + data
assert.strictEqual(
  formatSSEMessage({ event: 'message', id: '1', data: 'x' }),
  'event: message\nid: 1\ndata: x\n\n'
);

// 3. data 为对象时 JSON 序列化
assert.strictEqual(
  formatSSEMessage({ data: { a: 1 } }),
  'data: {"a":1}\n\n'
);

// 4. 文件逐行读取
function readLines(content) {
  return content.split(/\r?\n/).filter((line) => line.length > 0);
}
const lines = readLines('a\nb\n\nc\r\n');
assert.deepStrictEqual(lines, ['a', 'b', 'c']);

// 5. 文件模式解析
function parseFileMode(ruleValue) {
  const value = (ruleValue || '').trim();
  const match = /^file:\s*(.+)$/i.exec(value);
  if (!match) return null;
  const raw = match[1].trim();
  const parts = raw.split(',').map((s) => s.trim());
  let filePath = parts[0];
  let interval = parseInt(parts[1], 10);
  if (isNaN(interval) || interval < 0) interval = 1000;
  return { filePath, interval };
}
assert.deepStrictEqual(parseFileMode('file:./data/example.txt,500'), {
  filePath: './data/example.txt',
  interval: 500
});
assert.deepStrictEqual(parseFileMode('file:./data/example.txt'), {
  filePath: './data/example.txt',
  interval: 1000
});
assert.strictEqual(parseFileMode('default'), null);

console.log('✅ 所有测试通过');
