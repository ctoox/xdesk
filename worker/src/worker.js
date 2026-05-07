// xdesk 信令服务器
// Cloudflare Worker + Durable Objects

export class Room {
  constructor(state, env) {
    this.state = state;
    this.clients = new Map(); // clientId -> WebSocket
  }

  async fetch(request) {
    // 检查是否是 WebSocket 升级请求
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("xdesk signal server", {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    }

    // 创建 WebSocket 对
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // 接受连接
    server.accept();

    // 生成客户端 ID
    const clientId = crypto.randomUUID();
    this.clients.set(clientId, server);

    // 发送 ID 给客户端
    server.send(JSON.stringify({
      type: "id",
      id: clientId
    }));

    console.log(`Client connected: ${clientId} (total: ${this.clients.size})`);

    // 处理消息
    server.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.error("Invalid JSON:", e);
        return;
      }

      // 添加发送者 ID
      msg.id = clientId;

      // 转发消息
      if (msg.to) {
        // 发送给指定客户端
        const target = this.clients.get(msg.to);
        if (target) {
          try {
            target.send(JSON.stringify(msg));
          } catch (e) {
            console.error("Send failed:", e);
            this.clients.delete(msg.to);
          }
        } else {
          console.log(`Target not found: ${msg.to}`);
        }
      } else {
        // 广播给其他客户端
        for (const [id, ws] of this.clients) {
          if (id !== clientId) {
            try {
              ws.send(JSON.stringify(msg));
            } catch (e) {
              console.error("Broadcast failed:", e);
              this.clients.delete(id);
            }
          }
        }
      }
    });

    // 处理关闭
    server.addEventListener("close", (event) => {
      this.clients.delete(clientId);
      console.log(`Client disconnected: ${clientId} (total: ${this.clients.size})`);
    });

    // 处理错误
    server.addEventListener("error", (event) => {
      console.error(`Client error: ${clientId}`, event);
      this.clients.delete(clientId);
    });

    // 返回 WebSocket 响应
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
}

// Worker 入口
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 从 URL 获取 room 名称
    const room = url.searchParams.get("room") || "default";
    
    // 获取 Durable Object
    const id = env.ROOM.idFromName(room);
    const obj = env.ROOM.get(id);
    
    // 转发请求到 Durable Object
    return obj.fetch(request);
  }
};
