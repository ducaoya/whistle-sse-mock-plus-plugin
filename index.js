/**
 * Whistle SSE Mock 插件入口
 * 用于模拟 SSE 流数据，支持：
 * 1. 通过配置（参考 whistle.sse-mock 的 messages 格式）分多段返回
 * 2. 通过文件逐行读取，每次返回一行，并支持统一间隔时间
 */

// 导出 server 模块 - 处理代理请求并直接返回 SSE 流
exports.server = require('./lib/server');

// 导出 uiServer 模块 - 提供网页配置界面
exports.uiServer = require('./lib/uiServer');
