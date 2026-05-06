# xdesk

轻量级远程桌面控制软件，60 FPS，原画质，支持 Windows/Linux/macOS。

## 特性

- **60 FPS** 流畅远程桌面
- **原画质** 自动检测分辨率
- **Shell 终端** 远程执行命令
- **自动重连** 断线自动恢复
- **跨平台** Windows/Linux/macOS
- **零配置** 无需安装，直接运行

## 快速开始

### 下载

从 [Releases](https://github.com/ctoox/xdesk/releases) 下载对应平台的版本。

### 安装依赖

```bash
# 安装 ffmpeg
# Windows
winget install Gyan.FFmpeg

# macOS
brew install ffmpeg

# Linux (Ubuntu/Debian)
sudo apt install ffmpeg
```

### 运行

```bash
# 直接运行
./xdesk

# 或者从源码运行
npm install
npm start
```

### 使用

```
# 两台机器都运行 xdesk

# 机器 A
xdesk> connect <机器B的ID>
# 自动显示对方屏幕

# 机器 B  
xdesk> connect <机器A的ID>
# 也可以看到机器 A 的屏幕
```

### 命令

| 命令 | 说明 |
|------|------|
| `connect <id>` | 连接对端（自动请求屏幕） |
| `peers` | 查看在线列表 |
| `share` | 分享你的屏幕 |
| `stop` | 停止分享 |
| `quit` | 退出程序 |

## 从源码构建

### 安装依赖

```bash
git clone https://github.com/ctoox/xdesk.git
cd xdesk
npm install
```

### 运行

```bash
npm start
```

### 打包

```bash
# 编译 TypeScript
npm run build

# 打包成可执行文件
npm run package
```

## GitHub Actions 自动构建

推送到 GitHub 后，Actions 会自动构建多平台版本：

- Windows x64
- Linux x64
- macOS x64
- macOS ARM64

### 手动触发构建

1. 进入 GitHub 仓库页面
2. 点击 Actions 标签
3. 选择 "Build and Release"
4. 点击 "Run workflow"

### 发布新版本

```bash
# 创建标签
git tag v1.0.0
git push origin v1.0.0

# Actions 会自动构建并创建 Release
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
   │ Client A │            │ Client B │
   │         │            │         │
   │ ffmpeg  │ ←WebSocket→ │ ffmpeg  │
   │ 捕获屏幕 │            │ 捕获屏幕 │
   │         │            │         │
   │ 浏览器   │            │ 浏览器   │
   │ 显示远程 │            │ 显示远程 │
   └─────────┘            └─────────┘
```

## 技术栈

- **TypeScript** - 类型安全
- **Node.js** - 运行时
- **ffmpeg** - 屏幕捕获 + MJPEG 编码
- **WebSocket** - 数据传输
- **Cloudflare Workers** - 信令服务器

## 性能

| 指标 | 数值 |
|------|------|
| 帧率 | 60 FPS |
| 分辨率 | 自动检测（支持 4K） |
| 延迟 | ~100-150ms |
| 编码 | MJPEG |

## 项目结构

```
xdesk/
├── src/
│   ├── index.ts          # 入口
│   ├── client.ts         # WebSocket 客户端
│   ├── message.ts        # 消息协议
│   ├── ffmpeg-capture.ts # 屏幕捕获
│   ├── shell.ts          # Shell 执行
│   └── viewer.ts         # 浏览器视图
├── .github/workflows/    # GitHub Actions
├── package.json
└── README.md
```

## 开发路线

- [x] 屏幕共享（60 FPS）
- [x] Shell 终端
- [x] 自动重连
- [x] 跨平台支持
- [ ] 键鼠控制
- [ ] WebRTC P2P（更低延迟）
- [ ] 多显示器
- [ ] 剪贴板同步
- [ ] 文件传输
- [ ] 音频传输
- [ ] GUI 界面

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
