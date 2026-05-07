# xdesk

轻量级远程桌面控制软件，低延迟，跨平台。

## 特性

- **低延迟** - 15 FPS + requestAnimationFrame，延迟 < 1秒
- **原画质** - 自动检测分辨率，支持 4K
- **远程控制** - 鼠标移动、点击、键盘输入
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
| `quit` | 退出程序 |

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
