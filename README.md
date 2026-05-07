<div align="center">

# xdesk

**轻量级远程桌面控制软件**

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)
![FPS](https://img.shields.io/badge/fps-60-green)
![License](https://img.shields.io/badge/license-MIT-blue)

[下载](https://github.com/ctoox/xdesk/releases) · [文档](#快速开始) · [反馈](https://github.com/ctoox/xdesk/issues)

---

![xdesk preview](https://via.placeholder.com/800x400/1a1a1a/4CAF50?text=xdesk+Remote+Desktop)

</div>

## 功能特性

<div align="center">

| 功能 | 描述 | 状态 |
|:---:|:---|:---:|
| 🖥️ **屏幕共享** | 60 FPS 原画质，自动检测分辨率 | ✅ |
| ⌨️ **远程控制** | 鼠标移动、点击、键盘输入 | ✅ |
| 💻 **Shell 终端** | 远程执行命令，UTF-8 编码 | ✅ |
| 🔄 **自动重连** | 断线自动恢复连接 | ✅ |
| 🌐 **跨平台** | Windows / Linux / macOS | ✅ |
| 📦 **开箱即用** | 无需安装，直接运行 | ✅ |

</div>

## 性能指标

<div align="center">

```
┌─────────────────────────────────────────┐
│                                         │
│   ⚡ 60 FPS    🎨 原画质    🌐 跨平台    │
│                                         │
│   延迟 ~100-150ms                       │
│   分辨率自动检测（支持 4K）               │
│   MJPEG 编码（ffmpeg）                  │
│                                         │
└─────────────────────────────────────────┘
```

</div>

## 快速开始

### 1. 安装依赖

<div align="center">

| 平台 | 命令 |
|:---|:---|
| **Windows** | `winget install Gyan.FFmpeg` |
| **macOS** | `brew install ffmpeg` |
| **Linux** | `sudo apt install ffmpeg` |

</div>

### 2. 下载运行

<div align="center">

[![Download Windows](https://img.shields.io/badge/Windows-x64-blue?logo=windows)](https://github.com/ctoox/xdesk/releases)
[![Download Linux](https://img.shields.io/badge/Linux-x64-orange?logo=linux)](https://github.com/ctoox/xdesk/releases)
[![Download macOS](https://img.shields.io/badge/macOS-x64-black?logo=apple)](https://github.com/ctoox/xdesk/releases)

</div>

```bash
# 两台机器都运行
./xdesk

# 机器 A
xdesk> connect <机器B的ID>

# 机器 B
xdesk> connect <机器A的ID>
```

### 3. 从源码构建

```bash
git clone https://github.com/ctoox/xdesk.git
cd xdesk
npm install
npm start
```

## 使用方法

<div align="center">

### 命令列表

| 命令 | 说明 | 示例 |
|:---:|:---|:---|
| `connect` | 连接对端（自动请求屏幕） | `connect abc-123` |
| `peers` | 查看在线列表 | `peers` |
| `share` | 分享你的屏幕 | `share` |
| `stop` | 停止分享 | `stop` |
| `quit` | 退出程序 | `quit` |

</div>

### 浏览器功能

打开 `http://localhost:8080`：

- 🖱️ **鼠标控制** - 移动、点击、滚轮
- ⌨️ **键盘控制** - 按键、文字输入
- 💻 **Shell 终端** - 远程执行命令
- 📊 **状态监控** - FPS、延迟显示

## 架构设计

<div align="center">

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
│                    (信令服务器)                               │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
    ┌─────────────────┐             ┌─────────────────┐
    │    Client A     │             │    Client B     │
    │                 │             │                 │
    │  ┌───────────┐  │             │  ┌───────────┐  │
    │  │ ffmpeg    │  │  WebSocket  │  │ ffmpeg    │  │
    │  │ 屏幕捕获  │◄─┼─────────────┼─►│ 屏幕捕获  │  │
    │  └───────────┘  │             │  └───────────┘  │
    │  ┌───────────┐  │             │  ┌───────────┐  │
    │  │ Rust      │  │             │  │ Rust      │  │
    │  │ 输入控制  │◄─┼─────────────┼─►│ 输入控制  │  │
    │  └───────────┘  │             │  └───────────┘  │
    │  ┌───────────┐  │             │  ┌───────────┐  │
    │  │ 浏览器    │  │             │  │ 浏览器    │  │
    │  │ 显示远程  │  │             │  │ 显示远程  │  │
    │  └───────────┘  │             │  └───────────┘  │
    └─────────────────┘             └─────────────────┘
```

</div>

## 技术栈

<div align="center">

| 组件 | 技术 |
|:---:|:---|
| **语言** | TypeScript + Rust |
| **运行时** | Node.js |
| **屏幕捕获** | ffmpeg (GDI) |
| **输入控制** | Rust (Win32 API) |
| **传输** | WebSocket |
| **信令** | Cloudflare Workers |

</div>

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
│   └── src/main.rs
├── input-rs/              # Rust 输入控制
│   └── src/main.rs
├── .github/workflows/     # GitHub Actions
├── package.json
└── README.md
```

## 打包分发

```bash
# 编译 TypeScript
npm run build

# 打包成可执行文件
npm run package          # Windows
npm run package:linux    # Linux
npm run package:mac      # macOS
```

## GitHub Actions

推送到 GitHub 后，Actions 会自动构建多平台版本：

- ✅ Windows x64
- ✅ Linux x64
- ✅ macOS x64

## 开发路线

<div align="center">

### Phase 1 - 核心功能 ✅

- [x] 屏幕共享（60 FPS）
- [x] 远程控制（鼠标 + 键盘）
- [x] Shell 终端
- [x] 自动重连
- [x] 跨平台支持

### Phase 2 - 增强功能 🔧

- [ ] WebRTC P2P（更低延迟）
- [ ] 多显示器支持
- [ ] 剪贴板同步
- [ ] 文件传输

### Phase 3 - 高级功能 📋

- [ ] 音频传输
- [ ] 录屏功能
- [ ] 多用户支持
- [ ] 权限管理

### Phase 4 - 平台扩展 🚀

- [ ] GUI 桌面应用
- [ ] Android 客户端
- [ ] iOS 客户端
- [ ] Web 客户端

</div>

## 延迟分析

<div align="center">

| 来源 | 延迟 |
|:---:|:---:|
| ffmpeg 捕获 | ~16ms |
| JPEG 编码 | ~10ms |
| base64 编码 | ~5ms |
| WebSocket 传输 | ~50-100ms |
| 浏览器渲染 | ~16ms |
| **总计** | **~100-150ms** |

</div>

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/ctoox/xdesk?style=social)](https://github.com/ctoox/xdesk/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/ctoox/xdesk?style=social)](https://github.com/ctoox/xdesk/network/members)
[![GitHub issues](https://img.shields.io/github/issues/ctoox/xdesk)](https://github.com/ctoox/xdesk/issues)

</div>
