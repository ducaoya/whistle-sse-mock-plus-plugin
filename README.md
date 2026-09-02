# whistle.sse-mock-plus

一个用于模拟 SSE (Server-Sent Events) 流数据的 Whistle 插件。

## 功能特点

- 🎯 **配置模式**：通过 JSON 配置多条消息，每条消息可设置延迟时间，分多段返回
- 📄 **文件模式**：指定本地文件，逐行读取，每次返回一行，并支持统一的间隔时间；支持 `.jsonl` 格式（取 `chunk` 字段作为完整 SSE 帧）
- 📝 **完整 SSE 支持**：支持 `event`、`id`、`data` 等 SSE 字段
- 🔁 **循环播放**：支持消息循环播放模式
- 💻 **网页配置界面**：可视化编辑配置、文件模式、跨域白名单，支持实时预览
- 🌐 **CORS 支持**：支持自定义跨域白名单，预检请求头自动回写

## 安装

```bash
npm i -g whistle.sse-mock-plus
```

或在 Whistle 界面 Plugins 标签页中安装。

## 使用方法

在 Whistle Rules 中添加规则：

```txt
# 使用默认配置
api.example.com/sse/stream sse-mock://

# 使用指定配置
api.example.com/chat/stream sse-mock://chatgpt

# 使用文件模式：逐行返回，间隔 1000ms
api.example.com/sse/stream sse-mock://file:./data/example.txt,1000
```

然后访问匹配的接口：

```bash
curl -N http://api.example.com/sse/stream
```

## 网页配置界面

安装后在 Whistle 的 Plugins 标签页点击 `sse-mock` 即可打开配置界面，支持：

- 配置列表的增删改查
- 可视化编辑消息（`event` / `id` / `data` / `delay` 字段）
- 数据来源切换：**配置消息列表** / **本地文件**（含 `text`、`jsonl` 两种格式）
- 循环播放开关
- 实时预览 SSE 输出
- 跨域白名单配置

## 配置模式

配置文件位于插件根目录 `data/config.json`，格式如下：

```json
{
  "configs": {
    "default": {
      "description": "默认 SSE 配置",
      "messages": [
        { "data": "Hello SSE!", "delay": 1000 },
        { "data": "This is mock data", "delay": 1000 },
        { "data": "[DONE]", "delay": 0 }
      ],
      "loop": false
    },
    "chatgpt": {
      "description": "ChatGPT 风格 SSE 响应",
      "messages": [
        { "data": "{\"choices\":[{\"delta\":{\"content\":\"你\"}}]}", "delay": 100 },
        { "data": "{\"choices\":[{\"delta\":{\"content\":\"好\"}}]}", "delay": 100 },
        { "data": "[DONE]", "delay": 0 }
      ],
      "loop": false
    },
    "sse_stream": {
      "description": "本地 jsonl 文件回放",
      "file": "D:\\download\\sse_stream(1).jsonl",
      "format": "jsonl",
      "interval": 200,
      "loop": false
    }
  }
}
```

### 消息字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data | string | 是 | SSE 数据内容，可以是普通字符串或 JSON 字符串 |
| delay | number | 否 | 发送前的延迟时间（毫秒），默认 1000 |
| event | string | 否 | SSE 事件类型，对应 `event:` 字段 |
| id | string | 否 | SSE 消息 ID，对应 `id:` 字段 |

### 配置项字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| description | string | 配置描述 |
| messages | array | 消息列表（配置模式） |
| file | string | 本地文件路径（文件模式） |
| format | string | 文件格式：`text`（每行一条 data）或 `jsonl`（每行 JSON 取 `chunk` 字段） |
| interval | number | 文件模式下的统一间隔时间（毫秒） |
| loop | boolean | 是否循环播放 |

## 文件模式

### 方式一：规则直接指定

规则值使用 `file:<文件路径>[,<间隔毫秒>]` 格式：

```txt
# 逐行返回文件内容，每行间隔 500ms
api.example.com/sse/stream sse-mock://file:./data/example.txt,500

# 使用绝对路径
api.example.com/sse/stream sse-mock://file:C:/tmp/sse-data.txt,1000
```

### 方式二：配置内指定

在 `config.json` 中配置 `file` / `format` / `interval` 字段，然后通过配置名引用：

```txt
api.example.com/sse/stream sse-mock://sse_stream
```

- 相对路径基于插件根目录解析
- `text` 格式：逐行读取，每行作为一条 `data` 消息返回
- `jsonl` 格式：每行是一个 JSON 对象，取 `chunk` 字段作为完整 SSE 帧原样输出（适合回放抓包得到的 SSE 数据）
- 未指定间隔时间时默认为 1000ms
- 自动过滤空行

## CORS 跨域配置

跨域配置位于 `data/config.json` 的 `cors` 字段：

```json
{
  "cors": {
    "allowOrigins": ["*.example.com"]
  }
}
```

### 跨域白名单（allowOrigins）

- 默认值为空，仅当白名单命中时返回跨域允许头
- 支持 `*`（允许所有来源）、`*.example.com`、`example.com`、`https://a.example.com` 等写法
- 配置 `*` 时输出 `Access-Control-Allow-Origin: *`（不含 credentials）
- 其它情况回显具体 Origin 并附带 `Access-Control-Allow-Credentials: true`

### 允许的请求头

- 预检请求会携带 `Access-Control-Request-Headers`，插件会**原样回写**到 `Access-Control-Allow-Headers`
- 非预检请求时输出 `*`

### 网页配置

在插件 Option 页面点击「跨域设置」按钮，可视化编辑跨域白名单。

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/configs` | GET | 获取所有配置 |
| `/api/config-names` | GET | 获取配置名列表 |
| `/api/config/:name` | GET | 获取单个配置 |
| `/api/config` | POST | 保存配置 |
| `/api/config/:name` | DELETE | 删除配置 |
| `/api/preview-file` | POST | 预览本地文件内容 |
| `/api/cors` | GET | 获取跨域配置 |
| `/api/cors` | POST | 保存跨域配置 |

## 目录结构

```
whistle-sse-mock-plus/
├── package.json
├── index.js           # 插件入口（导出 server、uiServer）
├── lib/
│   ├── server.js      # SSE 服务器（处理代理请求）
│   ├── uiServer.js    # UI 服务器（配置界面 API）
│   ├── storage.js     # 存储模块（配置数据管理）
│   └── cors.js        # CORS 跨域配置模块
├── public/
│   └── index.html     # 网页配置界面
├── data/
│   ├── config.json    # 配置数据
│   └── example.txt    # 文件模式示例
└── README.md
```

## 常见问题

### Q: 插件安装后在 Whistle 中看不到？

A: 确保：
1. 插件名称以 `whistle.` 开头
2. 重启 Whistle：`w2 restart`

### Q: 规则配置正确但没有生效？

A: 检查：
1. 规则格式是否正确（注意 `://` 符号）
2. URL 匹配是否正确
3. 查看 Whistle Network 面板确认请求是否被匹配

### Q: 配置 `*` 号后跨域不生效？

A: `*` 与 `Access-Control-Allow-Credentials` 互斥。配置 `*` 时会输出 `Access-Control-Allow-Origin: *` 且不附带 credentials，这是浏览器规范要求，属正常行为。

## License

MIT
