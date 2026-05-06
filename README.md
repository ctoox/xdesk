# xdesk

轻量级远程桌面控制软件，通过 Cloudflare Workers 实现全球可用的信令服务器。

## 功能状态

### ✅ 已完成

| 功能 | 状态 | 说明 |
|------|------|------|
| WebSocket 信令 | ✅ | 通过 Cloudflare Workers 实现 |
| 屏幕共享 | ✅ | JPEG 压缩，HTTP 流媒体显示 |
| Shell 终端 | ✅ | 远程执行命令，UTF-8 编码 |
| 自动重连 | ✅ | 断线自动重连 |
| 心跳保活 | ✅ | 30 秒心跳防止断连 |
| 浏览器查看 | ✅ | http://localhost:8080 |
| 帧率显示 | ✅ | 实时 FPS 和延迟监控 |

### 🔧 待完善

| 功能 | 状态 | 说明 |
|------|------|------|
| 键鼠控制 | 🔧 | 框架已实现，需要调试 |
| 多显示器 | 📋 | 计划中 |
| 剪贴板同步 | 📋 | 计划中 |
| 文件传输 | 📋 | 计划中 |

### 📋 未来计划

| 功能 | 说明 |
|------|------|
| WebRTC P2P | 降低延迟 |
| 硬件编码 | H264/VP8 提升帧率 |
| GUI 客户端 | Electron/Tauri |
| 移动端 | Android/iOS |

## 为什么可以通过 Cloudflare 实现？

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
│                    (全球边缘节点)                            │
│                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│   │  美国节点   │     │  欧洲节点   │     │  亚洲节点   │  │
│   └─────────────┘     └─────────────┘     └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         │ WebSocket          │ WebSocket          │ WebSocket
         │                    │                    │
    ┌────┴────┐          ┌────┴────┐          ┌────┴────┐
    │ Agent A │          │ Agent B │          │ Agent C │
    │ (被控端) │          │ (被控端) │          │ (被控端) │
    └─────────┘          └─────────┘          └─────────┘
```

**原理：**
1. **Cloudflare Workers** 提供免费的全球边缘计算节点
2. **WebSocket** 支持全双工实时通信
3. **Durable Objects** 支持状态持久化（房间机制）
4. **全球 CDN** 确保低延迟连接

**优势：**
- 免费额度：每天 10 万次请求
- 全球节点：自动选择最近的服务器
- 无需自建服务器
- 自动 HTTPS

**限制：**
- WebSocket 空闲超时 100 秒（已用心跳解决）
- 单请求 CPU 时间 10ms（不适合大量计算）
- 不适合高带宽传输（屏幕共享）

## 性能优化分析

### 当前瓶颈

```
屏幕捕获 → JPEG 压缩 → WebSocket 传输 → 浏览器渲染
   50ms      100ms         50ms          30ms
                              ↓
                          总计 ~230ms → FPS ≈ 4
```

### RustDesk 为什么快？

| 对比 | xdesk (当前) | RustDesk |
|------|-------------|----------|
| 编码 | JPEG (CPU) | VP8/VP9/H264 (GPU) |
| 传输 | WebSocket (TCP) | WebRTC (UDP) |
| 增量 | 全帧传输 | 只传变化区域 |
| 分辨率 | 1920x1080 | 可调 720p/480p |

### 优化方案

#### 方案 1：优化当前实现（推荐先做）

```typescript
// 1. 降低分辨率
const capture = new ScreenCapture(20, 70, 0.5);  // scale 0.5 = 960x540

// 2. 降低质量
const capture = new ScreenCapture(20, 50, 0.5);  // quality 50%

// 3. 使用 WebP（比 JPEG 小 30%）
const sharp = require('sharp');
const frame = await sharp(imgBuffer).webp({ quality: 60 }).toBuffer();
```

**预期效果：** FPS 从 3 提升到 8-10

#### 方案 2：使用 WebRTC（中等难度）

```typescript
// 使用 simple-peer 或 wrtc
const Peer = require('simple-peer');
const peer = new Peer({ initiator: true, stream: screenStream });
```

**预期效果：** FPS 提升到 15-20，延迟降低 50%

#### 方案 3：硬件编码（高难度）

```typescript
// 使用 @aspect-build/aspect 或 ffmpeg
const ffmpeg = require('fluent-ffmpeg');
ffmpeg(screenStream)
  .videoCodec('h264_nvenc')  // NVIDIA GPU 编码
  .output('pipe:1');
```

**预期效果：** FPS 提升到 30+，接近 RustDesk

### 语言选择对比

| 语言 | 屏幕捕获 | 编码性能 | 开发效率 | 推荐度 |
|------|---------|---------|---------|--------|
| TypeScript | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | 快速原型 |
| Rust | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | 高性能 |
| C++ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ | 极致性能 |
| Go | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | 平衡 |

**建议：**
- 当前用 TypeScript 验证功能
- 性能优化时考虑 Rust 重写核心模块
- 或者调用 Rust/C++ 编码库（如 ffmpeg）

## 快速开始

```bash
# 克隆
git clone https://github.com/ctoox/xdesk.git
cd xdesk
npm install

# Agent (被控端)
npx ts-node src/index.ts agent
agent> stream

# Controller (控制端)
npx ts-node src/index.ts controller
ctrl> connect <agent-id>
ctrl> view

# 打开浏览器 http://localhost:8080
```

## 项目结构

```
xdesk/
├── src/
│   ├── index.ts      # 入口
│   ├── client.ts     # WebSocket 客户端
│   ├── message.ts    # 消息协议
│   ├── capture.ts    # 屏幕捕获
│   ├── input.ts      # 键鼠控制（待调试）
│   ├── shell.ts      # Shell 执行
│   └── viewer.ts     # HTTP 视图服务器
├── package.json
└── README.md
```

## 技术栈

- **TypeScript** - 类型安全
- **Node.js** - 运行时
- **WebSocket** - 信令通信
- **screenshot-desktop** - 屏幕捕获
- **sharp** - 图像压缩
- **Cloudflare Workers** - 信令服务器

## 信令服务器

部署在 Cloudflare Workers：

```bash
# 服务器代码
cd xdesk-server
wrangler deploy
```

## 许可证

MIT License
