# xdesk

轻量级远程桌面控制软件，低延迟，跨平台。

## 平台支持

| 功能 | Windows | Linux | macOS |
|------|:-------:|:-----:|:-----:|
| 屏幕捕获 | ✅ | ✅ | ✅ |
| 屏幕共享 | ✅ | ✅ | ✅ |
| Shell 终端 | ✅ | ✅ | ✅ |
| 鼠标控制 | ✅ | ❌ | ❌ |
| 键盘控制 | ✅ | ❌ | ❌ |

> **注意：** Linux 和 macOS 暂不支持鼠标键盘控制，仅支持屏幕查看和 Shell。后续版本会添加跨平台输入控制支持。

## 特性

- **低延迟** - 15 FPS + requestAnimationFrame，延迟 < 1秒
- **原画质** - 自动检测分辨率，支持 4K
- **远程控制** - 鼠标移动、点击、键盘输入（Windows）
- **Shell 终端** - 远程执行命令
- **跨平台** - Windows / Linux / macOS
- **开箱即用** - 无需安装，直接运行

## 快速开始

### 安装依赖

```bash
# Windows
winget install Gyan.FFmpeg

# macOS
brew install ffmpeg

# Linux
sudo apt install ffmpeg
```

### 下载运行

从 [Releases](https://github.com/ctoox/xdesk/releases) 下载。

```bash
# 两台机器都运行
./xdesk

# 机器 A
xdesk> connect <机器B的ID>

# 机器 B
xdesk> connect <机器A的ID>
```

### 从源码构建

```bash
git clone https://github.com/ctoox/xdesk.git
cd xdesk
npm install
npm start
```

## 命令

| 命令 | 说明 |
|------|------|
| `connect <id>` | 连接对端（自动请求屏幕） |
| `peers` | 查看在线列表 |
| `share` | 分享你的屏幕 |
| `stop` | 停止分享 |
| `config` | 显示当前配置 |
| `quit` | 退出程序 |

## 配置

### 配置文件

创建 `xdesk.json` 或 `~/.xdesk/config.json`：

```json
{
  "signal_server": "wss://xdesk.ctoocn.workers.dev/ws",
  "room": "myroom",
  "fps": 15,
  "quality": 3,
  "proxy": null
}
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `signal_server` | 信令服务器地址 | `wss://xdesk.ctoocn.workers.dev/ws` |
| `room` | 房间名 | `default` |
| `fps` | 帧率 | `15` |
| `quality` | JPEG 质量 (1-31) | `3` |
| `proxy` | 代理地址 | `null` |

### 自定义信令服务器

如果要使用自己的信令服务器：

1. 部署 Cloudflare Worker（见下方）
2. 修改配置文件中的 `signal_server`
3. 重启 xdesk

## 自部署信令服务器

### 1. 创建 Cloudflare Worker

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login
```

### 2. Worker 代码

创建 `worker.js`：

```javascript
export class Room {
  constructor(state, env) {
    this.state = state;
    this.clients = new Map();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("xdesk signal server", { status: 200 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const clientId = crypto.randomUUID();
    this.clients.set(clientId, server);

    server.send(JSON.stringify({ type: "id", id: clientId }));

    server.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      msg.id = clientId;

      if (msg.to && this.clients.has(msg.to)) {
        this.clients.get(msg.to).send(JSON.stringify(msg));
      }

      if (!msg.to) {
        for (const [id, c] of this.clients) {
          if (id !== clientId) {
            c.send(JSON.stringify(msg));
          }
        }
      }
    });

    server.addEventListener("close", () => {
      this.clients.delete(clientId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
```

### 3. 配置 wrangler.toml

```toml
name = "xdesk-signal"
main = "worker.js"
compatibility_date = "2024-01-01"

[durable_objects]
bindings = [{ name = "ROOM", class_name = "Room" }]

[[migrations]]
tag = "v1"
new_classes = ["Room"]
```

### 4. 部署

```bash
wrangler deploy
```

### 5. 使用自定义服务器

创建 `xdesk.json`：

```json
{
  "signal_server": "wss://xdesk-signal.your-account.workers.dev/ws",
  "room": "myroom"
}
```

## 架构

```
┌─────────────────────────────────────────┐
│         Cloudflare Workers              │
│         (信令服务器)                     │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
   ┌────┴────┐            ┌────┴────┐
   │ Client  │            │ Client  │
   │         │            │         │
   │ ffmpeg  │            │ ffmpeg  │
   │ 屏幕捕获 │            │ 屏幕捕获 │
   │         │            │         │
   │ Rust    │            │ Rust    │
   │ 输入控制 │            │ 输入控制 │
   │         │            │         │
   │ 浏览器   │            │ 浏览器   │
   │ 显示远程 │            │ 显示远程 │
   └─────────┘            └─────────┘
```

## 低延迟优化原理

### 问题：帧积压导致延迟

```
传统方案（60 FPS）：
帧1 → 帧2 → 帧3 → ... → 帧100 → 浏览器
                                 ↑
                            积压 14 秒

优化方案（15 FPS + 丢帧）：
帧1 → 丢弃 → 帧2 → 丢弃 → 帧3 → 浏览器
                              ↑
                         实时显示
```

### 关键优化

#### 1. 降低帧率（60 → 15 FPS）

```typescript
// 之前：60 FPS，帧积压严重
const capture = new FFmpegCapture(0, 0, 60, 3);

// 现在：15 FPS，减少积压
const capture = new FFmpegCapture(0, 0, 15, 3);
```

**原理：**
- 60 FPS = 每 16ms 一帧
- 15 FPS = 每 66ms 一帧
- 减少 4 倍帧积压

#### 2. 浏览器端：只渲染最新帧

```javascript
// 之前：每帧都渲染，导致积压
es.onmessage = function(e) {
  img.src = 'data:image/jpeg;base64,' + e.data;  // 直接渲染
};

// 现在：只保留最新帧，跳过中间帧
var pendingFrame = null;
es.onmessage = function(e) {
  pendingFrame = e.data;  // 只存储，不渲染
};

function renderFrame() {
  if (pendingFrame) {
    img.src = 'data:image/jpeg;base64,' + pendingFrame;  // 渲染最新
    pendingFrame = null;
  }
  requestAnimationFrame(renderFrame);  // 浏览器控制节奏
}
requestAnimationFrame(renderFrame);
```

**原理：**
- `requestAnimationFrame` 与浏览器刷新率同步（60Hz）
- 如果收到多帧，只渲染最新的一帧
- 丢弃中间帧，避免积压

#### 3. 服务端：只发送最新帧

```typescript
updateFrame(frameBase64: string): void {
  // 直接覆盖，不排队
  this.currentFrame = frameBase64;
  this.frameCount++;
  
  // 推送给客户端
  for (const client of this.clients) {
    client.write('data: ' + frameBase64 + '\n\n');
  }
}
```

**原理：**
- 不使用队列，直接覆盖
- 客户端收到的永远是最新帧
- 旧帧自动被新帧替换

### 性能对比

| 指标 | 之前 | 现在 |
|------|------|------|
| FPS | 60 | 15 |
| 延迟 | 4-14 秒 | < 1 秒 |
| 帧积压 | 严重 | 无 |
| 带宽 | 高 | 低 |

### 核心思想

**宁可丢帧，不要积压**

```
远程桌面不需要流畅的动画
需要的是：操作 → 立即响应
15 FPS 足够流畅，延迟更低
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 语言 | TypeScript + Rust |
| 运行时 | Node.js |
| 屏幕捕获 | ffmpeg (GDI) |
| 输入控制 | Rust (Win32 API) |
| 传输 | WebSocket + SSE |
| 信令 | Cloudflare Workers |

## 项目结构

```
xdesk/
├── src/                    # TypeScript 主程序
│   ├── index.ts           # 入口
│   ├── client.ts          # WebSocket 客户端
│   ├── message.ts         # 消息协议
│   ├── ffmpeg-capture.ts  # 屏幕捕获
│   ├── input.ts           # 输入控制
│   ├── shell.ts           # Shell 执行
│   └── viewer.ts          # 浏览器视图
├── capture-rs/            # Rust 屏幕捕获
├── input-rs/              # Rust 输入控制
├── .github/workflows/     # GitHub Actions
└── README.md
```

## 打包分发

```bash
npm run build
npm run package          # Windows
npm run package:linux    # Linux
npm run package:mac      # macOS
```

## GitHub Actions

推送到 GitHub 后，Actions 会自动构建多平台版本：

```bash
git tag v1.1.0
git push origin v1.1.0
```

## 开发路线

- [x] 屏幕共享（低延迟）
- [x] 远程控制（鼠标 + 键盘）
- [x] Shell 终端
- [x] 跨平台支持
- [ ] WebRTC P2P（更低延迟）
- [ ] 多显示器
- [ ] 剪贴板同步
- [ ] 文件传输

## 许可证

MIT License
