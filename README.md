# xdesk

轻量级远程桌面控制软件，类似 RustDesk。

## 功能

### ✅ 已实现

- **信令服务器** - WebSocket 信令，支持房间机制
- **屏幕捕获** - 实时屏幕截图，JPEG 压缩
- **屏幕共享** - 通过 HTTP 流媒体在浏览器查看
- **键鼠控制** - 远程鼠标移动、点击、键盘输入
- **自动重连** - 断线自动重连
- **代理支持** - 支持 HTTP 代理

### 🚧 开发中

- **WebRTC P2P** - 点对点连接，降低延迟
- **多显示器** - 多屏幕选择
- **剪贴板同步** - 双向剪贴板共享
- **文件传输** - 拖拽文件传输

### 📋 计划

- **音频传输** - 远程音频播放
- **端到端加密** - 安全加密通信
- **GUI 桌面应用** - Electron/Tauri 界面
- **移动端支持** - Android/iOS 客户端
- **录屏功能** - 远程会话录制
- **多用户** - 多人同时控制
- **权限管理** - 细粒度权限控制
- **自动更新** - 客户端自动更新

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                    信令服务器 (Cloudflare Workers)        │
│                    wss://xdesk.ctoocn.workers.dev        │
└─────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
    ┌─────────────────┐             ┌─────────────────┐
    │   Agent (被控端)  │             │ Controller (控制端)│
    │                 │             │                 │
    │  ┌───────────┐  │             │  ┌───────────┐  │
    │  │ 屏幕捕获  │  │             │  │ 浏览器 UI │  │
    │  │ screenshot│  │             │  │ 键鼠捕获  │  │
    │  └───────────┘  │             │  └───────────┘  │
    │  ┌───────────┐  │             │  ┌───────────┐  │
    │  │ 输入控制  │  │  WebSocket  │  │ 视频解码  │  │
    │  │ robotjs   │◄─┼─────────────┼─►│ 显示渲染  │  │
    │  └───────────┘  │             │  └───────────┘  │
    └─────────────────┘             └─────────────────┘
```

## 项目结构

```
xdesk/
├── src/
│   ├── index.ts      # 入口，命令行交互
│   ├── client.ts     # WebSocket 信令客户端
│   ├── message.ts    # 消息协议定义
│   ├── capture.ts    # 屏幕捕获模块
│   ├── input.ts      # 键鼠输入控制
│   └── viewer.ts     # HTTP 视图服务器
├── package.json
└── tsconfig.json
```

## 消息协议

```typescript
interface SignalMessage {
  type: 'id' | 'offer' | 'answer' | 'ice' | 'test' | 'mouse' | 'key' | 'screen' | 'screen-request';
  id?: string;      // 发送者 ID
  to?: string;      // 目标 ID
  data?: any;       // 消息数据
}
```

### 消息类型

| 类型 | 说明 | 数据 |
|------|------|------|
| `id` | 服务器分配 ID | `{ id: string }` |
| `test` | 测试消息 | `{ message: string }` |
| `mouse` | 鼠标事件 | `{ action, x, y, button }` |
| `key` | 键盘事件 | `{ action, key, modifiers }` |
| `screen` | 屏幕帧 | `{ frame: base64, timestamp }` |
| `screen-request` | 请求屏幕 | `{ fps: number }` |
| `offer` | WebRTC Offer | `{ sdp: string }` |
| `answer` | WebRTC Answer | `{ sdp: string }` |
| `ice` | ICE Candidate | `{ candidate: string }` |

## 使用方法

### 安装

```bash
git clone https://github.com/ctoox/xdesk.git
cd xdesk
npm install
```

### 启动 Agent (被控端)

```bash
npx ts-node src/index.ts agent
```

```
Agent ID: xxx-xxx-xxx
Commands:
  capture    - 测试截图
  stream     - 开始屏幕共享
  stop       - 停止共享
  fps <n>    - 设置帧率 (1-60)
  quality <n> - 设置质量 (1-100)
  scale <n>  - 设置缩放 (0.1-1.0)
```

### 启动 Controller (控制端)

```bash
npx ts-node src/index.ts controller
```

```
Commands:
  connect <id>  - 连接到 Agent
  view          - 开始查看远程屏幕
  mouse <x> <y> - 移动鼠标
  click <x> <y> - 点击
  key <key>     - 按键
  type <text>   - 输入文字
```

### 浏览器控制

打开 `http://localhost:8080`

- 鼠标移动 → 控制远程鼠标
- 鼠标点击 → 远程点击
- 键盘输入 → 远程输入
- 滚轮 → 远程滚动

## 技术栈

- **TypeScript** - 类型安全
- **Node.js** - 运行时
- **WebSocket** - 信令通信
- **screenshot-desktop** - 屏幕捕获
- **sharp** - 图像压缩
- **robotjs** - 键鼠输入控制
- **Cloudflare Workers** - 信令服务器

## 性能优化

### 当前配置

- FPS: 20
- 质量: 70%
- 缩放: 75%
- 编码: JPEG (mozjpeg)

### 优化建议

1. **降低延迟**
   - 使用 WebRTC P2P 直连
   - 减少图像压缩质量
   - 降低分辨率

2. **提高帧率**
   - 增加 FPS 设置
   - 使用硬件编码
   - 减少网络延迟

3. **减少带宽**
   - 降低缩放比例
   - 降低 JPEG 质量
   - 使用增量更新

## 部署

### 信令服务器

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署
cd xdesk-server
wrangler deploy
```

### 客户端

```bash
# 构建
npm run build

# 运行
node dist/index.js agent
node dist/index.js controller
```

## 开发路线

### Phase 1 - 核心功能 ✅

- [x] WebSocket 信令
- [x] 屏幕捕获
- [x] 屏幕共享
- [x] 键鼠控制

### Phase 2 - 增强功能

- [ ] WebRTC P2P
- [ ] 多显示器支持
- [ ] 剪贴板同步
- [ ] 文件传输
- [ ] 连接加密

### Phase 3 - 高级功能

- [ ] 音频传输
- [ ] 录屏功能
- [ ] 多用户支持
- [ ] 权限管理

### Phase 4 - 平台扩展

- [ ] GUI 桌面应用 (Electron/Tauri)
- [ ] Android 客户端
- [ ] iOS 客户端
- [ ] Web 客户端

### Phase 5 - 企业功能

- [ ] 用户系统
- [ ] 设备管理
- [ ] 会话记录
- [ ] 审计日志
- [ ] LDAP/SSO 集成

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
