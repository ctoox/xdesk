# xdesk 信令服务器

基于 Cloudflare Workers + Durable Objects 的信令服务器。

## 快速部署

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 部署

```bash
cd worker
wrangler deploy
```

部署成功后会显示：
```
Published xdesk-signal (x.x.x)
  https://xdesk-signal.your-account.workers.dev
```

### 4. 使用

在 xdesk 客户端创建配置文件 `xdesk.json`：

```json
{
  "signal_server": "wss://xdesk-signal.your-account.workers.dev/ws",
  "room": "myroom"
}
```

或直接修改代码中的默认地址。

## 自定义域名（可选）

1. 在 Cloudflare 添加域名
2. 修改 `wrangler.toml`：

```toml
routes = [
  { pattern = "signal.yourdomain.com", zone_name = "yourdomain.com" }
]
```

3. 重新部署

## 本地开发

```bash
# 安装依赖
npm install

# 本地运行
wrangler dev
```

## 费用

Cloudflare Workers 免费额度：
- 每天 100,000 次请求
- 10ms CPU 时间/请求
- Durable Objects: 1GB 存储

对于个人使用完全免费。

## 架构

```
┌─────────────────────────────────────────┐
│         Cloudflare Workers              │
│         (全球边缘节点)                   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │     Durable Object (Room)       │   │
│  │                                 │   │
│  │  clients: Map<id, WebSocket>    │   │
│  │                                 │   │
│  │  - 接收消息                      │   │
│  │  - 添加发送者 ID                │   │
│  │  - 转发/广播                    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## 消息协议

```json
{
  "type": "id | offer | answer | ice | test | input | screen | shell",
  "id": "sender-id",
  "to": "target-id",
  "data": {}
}
```

## 调试

查看 Worker 日志：
```bash
wrangler tail
```
