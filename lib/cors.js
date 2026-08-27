/**
 * CORS 跨域配置模块
 * 跨域白名单可在 config.json 的 cors.allowOrigins 中配置，也可通过网页界面修改
 * 允许的请求头由预检请求自动回写，无需手动配置
 */

const storage = require('./storage');

/**
 * 从 Origin 中提取主机名（不含协议与端口）
 */
function extractHost(origin) {
  if (!origin) return '';
  try {
    return new URL(origin).hostname;
  } catch (e) {
    return '';
  }
}

/**
 * 判断某个 Origin 是否匹配白名单中的一条规则
 * @param {string} pattern 白名单规则，如 *.example.com / example.com / https://a.example.com / *
 * @param {string} origin  请求的 Origin，如 https://a.example.com:8080
 */
function matchOrigin(pattern, origin) {
  if (!origin) return false;
  const host = extractHost(origin);
  if (!host) return false;
  if (!pattern) return false;

  // 允许 * 表示所有来源
  if (pattern === '*') return true;

  // 去掉协议、端口与路径
  const p = pattern
    .replace(/^https?:\/\//i, '')
    .replace(/:\d+$/, '')
    .replace(/\/.*$/, '');

  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // ".example.com"
    const root = p.slice(2); // "example.com"
    // *.example.com 匹配 example.com 本身及其任意子域名
    return host === root || host.endsWith(suffix);
  }

  return host === p;
}

/**
 * 获取当前生效的跨域白名单
 */
function getAllowedOrigins() {
  const config = storage.getConfig();
  const cors = config.cors || {};
  const list = cors.allowOrigins;
  if (Array.isArray(list) && list.length) {
    return list;
  }
  return [];
}

/**
 * 根据请求生成 CORS 响应头
 * 1. 预检请求读取 Access-Control-Request-Headers / Access-Control-Request-Method 原样回写
 * 2. Origin 处理：
 *    - 白名单含 * 时直接输出 *（不能与 credentials 同时使用）
 *    - 否则回显具体 Origin 并附 credentials
 */
function getCorsHeaders(req) {
  const reqHeaders = (req && req.headers) || {};
  const origin = reqHeaders.origin || reqHeaders.Origin || '';

  // 预检请求声明的请求头与方法，原样回写
  const requestHeaders = reqHeaders['access-control-request-headers'] || reqHeaders['Access-Control-Request-Headers'] || '';
  const requestMethod = reqHeaders['access-control-request-method'] || reqHeaders['Access-Control-Request-Method'] || '';

  const allowHeaders = requestHeaders || '*';
  const allowMethods = requestMethod || 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH';

  const headers = {
    'Access-Control-Allow-Methods': allowMethods,
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Expose-Headers': 'Content-Type, Content-Length',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };

  const allowOrigins = getAllowedOrigins();
  const hasWildcard = allowOrigins.some((p) => p === '*');

  if (hasWildcard) {
    // 配置了 *：直接输出 *，不能与 credentials 同时使用
    headers['Access-Control-Allow-Origin'] = '*';
  } else {
    const allowed = allowOrigins.some((pattern) => matchOrigin(pattern, origin));
    if (allowed && origin) {
      // 回显具体 Origin（兼容 credentials，不能用 *）
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
  }

  return headers;
}

module.exports = {
  getCorsHeaders,
  getAllowedOrigins,
  matchOrigin
};
