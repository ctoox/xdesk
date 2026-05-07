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

> **注意：** Linux 和 macOS 暂不支持鼠标键盘控制，仅支持屏幕查看和 Shell。

## 特性

- **低延迟** - 15 FPS + requestAnimationFrame，延迟 < 1秒
- **原画质** - 自动检测分辨率，支持 4K
- **远程控制** - 鼠标移动、点击、键盘输入（Windows）
- **Shell 终端** - 远程执行命令
- **配置文件** - 支持自定义信令服务器
- **开箱即用** - 默认服务器，无需配置

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

创建 `xdesk.json`：

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

## 自部署信令服务器

详细步骤见 [worker/README.md](worker/README.md)

### 快速部署

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署
cd worker
wrangler deploy
```

部署后修改 `xdesk.json`：
```json
{
  "signal_server": "wss://your-worker.your-account.workers.dev/ws"
}
```

## 信令服务器替代方案

> **征求意见！** 如果你知道其他免费好用的 WebSocket 信令方案，请提 Issue 告诉我们！

### 当前方案：Cloudflare Workers

| 优点 | 缺点 |
|------|------|
| ✅ 免费（10万请求/天） | ❌ 需要 Cloudflare 账号 |
| ✅ 全球边缘节点 | ❌ WebSocket 限制 |
| ✅ 自定义域名 | |

### 潜在替代方案

| 方案 | 免费额度 | 优点 | 缺点 |
|------|---------|------|------|
| **Cloudflare Workers** | 10万/天 | 全球CDN | 需要账号 |
| **Fly.io** | 3台机器 | 容器部署 | 配置复杂 |
| **Railway** | $5/月额度 | 简单易用 | 有限制 |
| **Render** | 750小时/月 | 免费WebSockets | 冷启动 |
| **自建 VPS** | 无限制 | 完全控制 | 需要服务器 |
| **ngrok** | 临时URL | 无需部署 | 不稳定 |
| **P2P (WebRTC)** | 无需服务器 | 最低延迟 | NAT穿透难 |

### 推荐

- **个人使用**：Cloudflare Workers（免费、稳定）
- **团队使用**：自建 VPS（完全控制）
- **临时测试**：ngrok（快速）

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
   └─────────┘            └─────────┘
```

## 低延迟优化

详见 [低延迟优化原理](#低延迟优化原理)

核心思想：**宁可丢帧，不要积压**

- 15 FPS 减少帧积压
- requestAnimationFrame 只渲染最新帧
- 延迟从 14 秒降到 < 1 秒

## 技术栈

| 组件 | 技术 |
|------|------|
| 语言 | TypeScript + Rust |
| 运行时 | Node.js |
| 屏幕捕获 | ffmpeg (GDI/X11) |
| 输入控制 | Rust (Win32 API) |
| 传输 | WebSocket + SSE |
| 信令 | Cloudflare Workers |

## 打包分发

```bash
npm run build
npm run package          # Windows
npm run package:linux    # Linux
npm run package:mac      # macOS
```

## GitHub Actions

```bash
git tag v1.2.0
git push origin v1.2.0
```

## 开发路线

- [x] 屏幕共享（低延迟）
- [x] 远程控制（Windows）
- [x] Shell 终端
- [x] 配置文件支持
- [ ] Linux/macOS 输入控制
- [ ] WebRTC P2P
- [ ] 多显示器
- [ ] 剪贴板同步
- [ ] 文件传输

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

特别是：
- Linux/macOS 输入控制实现
- 免费信令服务器方案
- 性能优化建议
