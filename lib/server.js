/**
 * SSE 服务器处理模块
 * 处理代理请求，返回 SSE 流数据（支持分片延时）
 *
 * 使用方式：在 Whistle Rules 中配置
 *   pattern sse-mock://configName
 *   pattern whistle.sse-mock://configName
 *
 * ruleValue 支持两种模式：
 * 1. 配置模式：直接填写配置名（对应 data/config.json 中的 configs 键）
 * 2. 文件模式：file:<文件路径>[,<间隔毫秒>]，逐行读取文件，每次返回一行
 */

const fs = require('fs');
const path = require('path');
const storage = require('./storage');
const cors = require('./cors');

// 延时函数
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 格式化单条 SSE 消息
 * 支持 event / id / data 字段，data 为对象时序列化为 JSON
 * 若消息带 raw 字段，则原样输出 raw 内容（用于 jsonl 中已拼好的完整 SSE 帧）
 */
function formatSSEMessage(message) {
  if (message.raw !== undefined && message.raw !== null) {
    return String(message.raw);
  }

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

/**
 * 解析 ruleValue 是否为文件模式
 * 返回 { isFile, filePath, interval } 或 null
 */
function parseFileMode(ruleValue, options) {
  const value = (ruleValue || '').trim();
  const match = /^file:\s*(.+)$/i.exec(value);
  if (!match) {
    return null;
  }

  const raw = match[1].trim();
  const parts = raw.split(',').map((s) => s.trim());
  let filePath = parts[0];
  let interval = parseInt(parts[1], 10);

  if (isNaN(interval) || interval < 0) {
    interval = 1000;
  }

  // 相对路径基于插件根目录解析
  if (!path.isAbsolute(filePath)) {
    filePath = path.join(options && options.value ? options.value : __dirname, '..', filePath);
  }

  return { isFile: true, filePath, interval };
}

/**
 * 逐行读取文件内容
 */
function readLines(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        return reject(err);
      }
      // 兼容 CRLF / LF，过滤末尾空行
      const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
      resolve(lines);
    });
  });
}

/**
 * 根据文件格式将文本内容解析为消息列表
 * @param {string} content 文件原始文本
 * @param {string} format   'jsonl' | 'text'（text 为默认）
 * @param {number} interval 统一间隔毫秒
 */
function parseFileContent(content, format, interval) {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);

  if (format === 'jsonl') {
    // jsonl：每行一个 JSON 对象，取 chunk 字段作为原始 SSE 帧输出
    const messages = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const raw = obj.chunk != null ? String(obj.chunk) : '';
        messages.push({ raw, delay: interval });
      } catch (e) {
        // 非 JSON 行，作为普通文本行输出
        messages.push({ data: line, delay: interval });
      }
    }
    return messages;
  }

  // text：每行作为一条 data 消息
  return lines.map((line) => ({ data: line, delay: interval }));
}

/**
 * 从配置中解析消息列表
 * 支持两种配置结构：
 * 1. 顶层直接就是 { messages, loop }（旧式，直接用默认配置）
 * 2. { configs: { name: { messages, loop } } }
 */
function resolveConfig(config, configName) {
  const root = config || {};
  const direct = root.messages;
  if (Array.isArray(direct)) {
    return root;
  }
  const map = root.configs || {};
  return (
    map[configName] ||
    map['default'] ||
    {
      messages: [
        { data: 'Hello SSE!', delay: 100 },
        { data: 'This is mock data', delay: 100 },
        { data: '[DONE]', delay: 0 }
      ],
      loop: false
    }
  );
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no'
};

// 组合 CORS 头与 SSE 头
function buildHeaders(req) {
  return Object.assign({}, cors.getCorsHeaders(req), SSE_HEADERS);
}

module.exports = (server, options) => {
  server.on('request', async (req, res) => {
    const originalReq = req.originalReq || {};
    const ruleValue = originalReq.ruleValue || '';

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors.getCorsHeaders(req));
      res.end();
      return;
    }

    // 消费请求体（如果有）
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      await new Promise((resolve) => {
        req.on('data', () => {});
        req.on('end', resolve);
        req.on('error', resolve);
      });
    }

    // 标记连接是否已关闭
    let closed = false;
    req.on('close', () => { closed = true; });
    req.on('error', () => { closed = true; });
    res.on('close', () => { closed = true; });
    res.on('error', () => { closed = true; });

    // 解析文件模式
    const fileMode = parseFileMode(ruleValue, options);

    let messages = [];
    let loop = false;
    let interval = 1000;

    if (fileMode) {
      // 规则文件模式：file:<路径>[,<间隔>]
      try {
        const content = await new Promise((resolve, reject) => {
          fs.readFile(fileMode.filePath, 'utf8', (err, c) => (err ? reject(err) : resolve(c)));
        });
        const fmt = /\.jsonl$/i.test(fileMode.filePath) ? 'jsonl' : 'text';
        messages = parseFileContent(content, fmt, fileMode.interval);
        interval = fileMode.interval;
        loop = false;
      } catch (err) {
        // 文件读取失败，返回错误消息并结束
        if (!closed) {
          res.writeHead(200, buildHeaders(req));
          res.write(formatSSEMessage({ event: 'error', data: 'Failed to read file: ' + (err && err.message) }));
          res.end();
        }
        return;
      }
    } else {
      // 配置模式
      const config = storage.getConfig();
      const configName = ruleValue && ruleValue.trim() ? ruleValue.trim() : 'default';
      const sseConfig = resolveConfig(config, configName);
      loop = !!sseConfig.loop;

      if (sseConfig.file) {
        // 配置里的文件模式：{ file, format, interval }
        const filePath = sseConfig.file;
        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(options && options.value ? options.value : __dirname, '..', filePath);
        interval = parseInt(sseConfig.interval, 10);
        if (isNaN(interval) || interval < 0) interval = 1000;
        const format = sseConfig.format || (/\.jsonl$/i.test(filePath) ? 'jsonl' : 'text');
        try {
          const content = await new Promise((resolve, reject) => {
            fs.readFile(absPath, 'utf8', (err, c) => (err ? reject(err) : resolve(c)));
          });
          messages = parseFileContent(content, format, interval);
        } catch (err) {
          if (!closed) {
            res.writeHead(200, buildHeaders(req));
            res.write(formatSSEMessage({ event: 'error', data: 'Failed to read file: ' + (err && err.message) }));
            res.end();
          }
          return;
        }
      } else {
        messages = sseConfig.messages || [];
      }
    }

    // 写入响应头
    if (!closed) {
      res.writeHead(200, buildHeaders(req));
    }

    // 流式发送消息（带延时）
    const sendMessages = async (list) => {
      for (let i = 0; i < list.length; i++) {
        if (closed) break;

        const message = list[i];
        const delay = message.delay !== undefined ? message.delay : interval;

        if (delay > 0) {
          await sleep(delay);
        }
        if (closed) break;

        const sseData = formatSSEMessage(message);
        try {
          res.write(sseData);
          if (typeof res.flush === 'function') {
            res.flush();
          }
        } catch (err) {
          break;
        }
      }
    };

    // 循环模式：持续发送直到连接关闭
    if (loop) {
      while (!closed) {
        await sendMessages(messages);
        if (!messages.length) {
          break;
        }
      }
    } else {
      await sendMessages(messages);
    }

    if (!closed) {
      res.end();
    }
  });
};
