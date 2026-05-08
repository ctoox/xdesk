# xdesk

轻量级远程桌面 - 60fps, 原画质

## 功能

- 实时屏幕共享
- 远程鼠标/键盘控制
- WebSocket 低延迟传输
- 鼠标校准
- 浏览器内终端
- F1-F24 功能键支持

## 快速开始

```bash
# 安装依赖
npm install

# 编译
npm run build

# 运行
node dist/index.js
```

打开浏览器访问 http://localhost:8080

## 配置

创建 `xdesk.json`:

```json
{
  "signal_server": "wss://xdesk.ctoocn.workers.dev/ws?room=test",
  "room": "default",
  "fps": 30,
  "quality": 5
}
```

## 命令

```
connect <id>      - 连接远程
peers             - 查看在线
share             - 共享屏幕
stop              - 停止共享
calibrate x y     - 设置鼠标偏移
calibrate-reset   - 重置偏移
quit              - 退出
```

## 技术栈

- TypeScript + Node.js
- Rust (输入控制)
- FFmpeg (屏幕捕获)
- WebSocket (实时通信)

## License

MIT
