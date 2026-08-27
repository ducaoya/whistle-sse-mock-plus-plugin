/**
 * UI 服务器模块
 * 提供配置界面 API，可在 Whistle 插件的 Option 页面中可视化配置 SSE 数据
 */

const path = require('path');
const fs = require('fs');
const storage = require('./storage');

/**
 * 根据文件格式将文本内容解析为消息列表
 * 与 server.js 中的逻辑保持一致
 */
function parseFileContent(content, format, interval) {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);

  if (format === 'jsonl') {
    const messages = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const raw = obj.chunk != null ? String(obj.chunk) : '';
        messages.push({ raw, delay: interval });
      } catch (e) {
        messages.push({ data: line, delay: interval });
      }
    }
    return messages;
  }

  return lines.map((line) => ({ data: line, delay: interval }));
}

// 解析 JSON 请求体
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// 发送 JSON 响应
function sendJson(res, data, status) {
  res.writeHead(status || 200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// 发送 HTML 响应
function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

module.exports = (server, options) => {
  server.on('request', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      // 首页 - 返回配置界面
      if (pathname === '/' || pathname === '/index.html') {
        const htmlPath = path.join(__dirname, '../public/index.html');
        if (fs.existsSync(htmlPath)) {
          sendHtml(res, fs.readFileSync(htmlPath, 'utf8'));
        } else {
          sendHtml(res, '<h1>SSE Mock 配置界面</h1><p>public/index.html 不存在</p>');
        }
        return;
      }

      // API: 获取所有配置
      if (pathname === '/api/configs' && req.method === 'GET') {
        const config = storage.getConfig();
        sendJson(res, { success: true, data: config.configs || {} });
        return;
      }

      // API: 获取配置名称列表
      if (pathname === '/api/config-names' && req.method === 'GET') {
        sendJson(res, { success: true, data: storage.getConfigNames() });
        return;
      }

      // API: 获取单个配置
      if (pathname.startsWith('/api/config/') && req.method === 'GET') {
        const name = pathname.replace('/api/config/', '');
        const config = storage.getConfigByName(decodeURIComponent(name));
        if (config) {
          sendJson(res, { success: true, data: config });
        } else {
          sendJson(res, { success: false, error: '配置不存在' }, 404);
        }
        return;
      }

      // API: 保存配置
      if (pathname === '/api/config' && req.method === 'POST') {
        const body = await parseBody(req);
        const { name, ...configData } = body;
        if (!name) {
          sendJson(res, { success: false, error: '配置名称不能为空' }, 400);
          return;
        }
        const success = storage.saveConfigByName(name, configData);
        sendJson(res, { success, message: success ? '保存成功' : '保存失败' });
        return;
      }

      // API: 删除配置
      if (pathname.startsWith('/api/config/') && req.method === 'DELETE') {
        const name = pathname.replace('/api/config/', '');
        const success = storage.deleteConfigByName(decodeURIComponent(name));
        sendJson(res, { success, message: success ? '删除成功' : '删除失败' });
        return;
      }

      // API: 预览文件内容（读取本地文件并解析为消息列表）
      if (pathname === '/api/preview-file' && req.method === 'POST') {
        const body = await parseBody(req);
        const filePath = body.file;
        if (!filePath) {
          sendJson(res, { success: false, error: '文件路径不能为空' }, 400);
          return;
        }
        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(__dirname, '..', filePath);
        const format = body.format || (/\.jsonl$/i.test(filePath) ? 'jsonl' : 'text');
        const interval = parseInt(body.interval, 10);
        const iv = isNaN(interval) || interval < 0 ? 1000 : interval;

        try {
          const content = fs.readFileSync(absPath, 'utf8');
          const messages = parseFileContent(content, format, iv);
          sendJson(res, { success: true, data: { messages, total: messages.length } });
        } catch (err) {
          sendJson(res, { success: false, error: '读取文件失败: ' + (err && err.message) }, 500);
        }
        return;
      }

      // API: 获取跨域白名单
      if (pathname === '/api/cors' && req.method === 'GET') {
        sendJson(res, { success: true, data: storage.getCorsConfig() });
        return;
      }

      // API: 保存跨域白名单
      if (pathname === '/api/cors' && req.method === 'POST') {
        const body = await parseBody(req);
        const allowOrigins = body.allowOrigins;
        if (!Array.isArray(allowOrigins)) {
          sendJson(res, { success: false, error: 'allowOrigins 必须为数组' }, 400);
          return;
        }
        const success = storage.saveCorsConfig({
          allowOrigins: Array.isArray(allowOrigins) ? allowOrigins : []
        });
        sendJson(res, { success, message: success ? '保存成功' : '保存失败' });
        return;
      }

      // 404
      sendJson(res, { success: false, error: 'Not Found' }, 404);
    } catch (error) {
      sendJson(res, { success: false, error: error && error.message }, 500);
    }
  });
};
