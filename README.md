# xdesk

轻量级远程桌面控制软件，通过 Cloudflare Workers 实现全球可用的信令服务器。

## 功能特性

### ✅ 已实现

| 功能 | 状态 | 说明 |
|------|------|------|
| 屏幕共享 | ✅ | **60 FPS**，原画质，自动检测分辨率 |
| Shell 终端 | ✅ | 远程执行命令，UTF-8 编码 |
| 自动重连 | ✅ | 断线自动重连 |
| 心跳保活 | ✅ | 30 秒心跳防止断连 |
| 浏览器查看 | ✅ | http://localhost:8080 |
| 帧率显示 | ✅ | 实时 FPS 和延迟监控 |
| 代理支持 | ✅ | 自动检测系统代理 |
| 打包分发 | ✅ | 可打包成 exe |

### 🔧 待完善

| 功能 | 状态 | 说明 |
|------|------|------|
| 键鼠控制 | 🔧 | 框架已实现，需要调试 |
| WebRTC P2P | 🔧 | 已实现，NAT 穿透有问题 |
| 多显示器 | 📋 | 计划中 |
| 剪贴板同步 | 📋 | 计划中 |
| 文件传输 | 📋 | 计划中 |

## 性能指标

| 指标 | 数值 |
|------|------|
| **帧率** | **60 FPS** |
| 分辨率 | 自动检测（支持 4K） |
| 延迟 | ~100-150ms |
| 编码 | MJPEG（ffmpeg） |
| 传输 | WebSocket + JSON base64 |

### 延迟分析

| 来源 | 延迟 |
|------|------|
| ffmpeg 捕获 | ~16ms |
| JPEG 编码 | ~10ms |
| base64 编码 | ~5ms |
| WebSocket 传输 | ~50-100ms |
| 浏览器渲染 | ~16ms |
| **总计** | **~100-150ms** |

**说明：** 延迟主要来自 WebSocket 传输（通过 Cloudflare Workers 中转）。对于远程桌面场景，100-150ms 延迟是可接受的。

## 快速开始

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/ctoox/xdesk.git
cd xdesk
npm install

# 安装 ffmpeg（必需）
winget install Gyan.FFmpeg
```

### 运行

```powershell
# Agent (被控端)
npx ts-node src/index.ts agent
agent> stream

# Controller (控制端)
npx ts-node src/index.ts controller
ctrl> connect <agent-id>
ctrl> view
# 打开 http://localhost:8080
```

### 打包成 exe

```powershell
npm run build
npm run package

# 生成 xdesk.exe，可直接分发
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
│                    (信令服务器)                               │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │ WebSocket                    │ WebSocket
         │                              │
    ┌────┴────┐                   ┌────┴────┐
    │  Agent  │                   │Controller│
    │ (被控端) │                   │ (控制端) │
    │         │                   │         │
    │ ffmpeg  │                   │ 浏览器   │
    │ 捕获屏幕 │                   │ 显示画面  │
    │         │                   │ Shell    │
    └─────────┘                   └─────────┘
```

## 项目结构

```
xdesk/
├── src/
│   ├── index.ts          # 入口
│   ├── client.ts         # WebSocket 客户端
│   ├── message.ts        # 消息协议
│   ├── ffmpeg-capture.ts # ffmpeg 屏幕捕获
│   ├── shell.ts          # Shell 执行
│   ├── viewer.ts         # HTTP 视图服务器
│   └── types.d.ts        # 类型声明
├── package.json
├── tsconfig.json
└── README.md
```

## 技术栈

- **TypeScript** - 类型安全
- **Node.js** - 运行时
- **ffmpeg** - 屏幕捕获 + MJPEG 编码
- **WebSocket** - 信令 + 数据传输
- **Cloudflare Workers** - 信令服务器

## 命令

### Agent 命令

```
agent> stream    # 开始屏幕共享
agent> stop      # 停止共享
agent> quit      # 退出
```

### Controller 命令

```
ctrl> connect <id>  # 连接到 Agent
ctrl> view          # 开始查看远程屏幕
ctrl> quit          # 退出
```

### 浏览器功能

- 实时屏幕显示
- Shell 终端
- FPS 和延迟监控

## 配置

### 环境变量

```powershell
# 代理设置（可选）
$env:HTTP_PROXY = "http://127.0.0.1:7897"

# Node.js 内存限制（可选）
$env:NODE_OPTIONS = "--max-old-space-size=4096"
```

### ffmpeg 参数

```typescript
// 在 src/index.ts 中修改
const capture = new FFmpegCapture(
  0,      // 宽度（0 = 自动检测）
  0,      // 高度（0 = 自动检测）
  60,     // FPS
  3       // 质量（1-31，越低越清晰）
);
```

## 信令服务器

部署在 Cloudflare Workers：

```bash
# 服务器代码
cd xdesk-server
wrangler deploy
```

## 开发路线

### Phase 1 - 核心功能 ✅

- [x] 屏幕共享（60 FPS）
- [x] Shell 终端
- [x] 自动重连
- [x] 打包分发

### Phase 2 - 增强功能

- [ ] 键鼠控制
- [ ] 降低延迟（WebRTC）
- [ ] 多显示器支持
- [ ] 剪贴板同步
- [ ] 文件传输

### Phase 3 - 高级功能

- [ ] 音频传输
- [ ] 录屏功能
- [ ] 多用户支持
- [ ] 权限管理

### Phase 4 - 平台扩展

- [ ] GUI 桌面应用（Electron/Tauri）
- [ ] Android 客户端
- [ ] iOS 客户端
- [ ] Web 客户端

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
