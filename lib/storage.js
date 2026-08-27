/**
 * 存储模块 - 读取配置文件
 * 配置文件位于插件根目录的 data/config.json，格式参考 whistle.sse-mock
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 读取配置文件，返回 { configs: { [name]: {...} } }
 * 文件不存在或解析失败时返回空配置
 */
function getConfig() {
  ensureDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { configs: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || { configs: {} };
  } catch (e) {
    return { configs: {} };
  }
}

/**
 * 保存配置到文件
 */
function saveConfig(config) {
  ensureDir();
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 获取所有配置名称
 */
function getConfigNames() {
  const config = getConfig();
  return Object.keys(config.configs || {});
}

/**
 * 获取单个配置
 */
function getConfigByName(name) {
  const config = getConfig();
  return (config.configs || {})[name] || null;
}

/**
 * 保存单个配置（覆盖式，自动写入 name 字段）
 */
function saveConfigByName(name, sseConfig) {
  const config = getConfig();
  if (!config.configs) {
    config.configs = {};
  }
  config.configs[name] = Object.assign({}, sseConfig, { name });
  return saveConfig(config);
}

/**
 * 删除单个配置
 */
function deleteConfigByName(name) {
  const config = getConfig();
  if (config.configs && config.configs[name]) {
    delete config.configs[name];
    return saveConfig(config);
  }
  return false;
}

/**
 * 获取跨域白名单配置
 * 返回 { allowOrigins: [...] }
 */
function getCorsConfig() {
  const config = getConfig();
  const cors = config.cors || {};
  return {
    allowOrigins: Array.isArray(cors.allowOrigins) ? cors.allowOrigins : []
  };
}

/**
 * 保存跨域白名单配置
 * @param {object} corsConfig { allowOrigins }
 */
function saveCorsConfig(corsConfig) {
  const config = getConfig();
  config.cors = {
    allowOrigins: Array.isArray(corsConfig.allowOrigins) ? corsConfig.allowOrigins : []
  };
  return saveConfig(config);
}

module.exports = {
  getConfig,
  saveConfig,
  getConfigNames,
  getConfigByName,
  saveConfigByName,
  deleteConfigByName,
  getCorsConfig,
  saveCorsConfig,
  CONFIG_FILE,
  DATA_DIR
};
