// xdesk 信令服务器
// Cloudflare Worker + Durable Objects

// 生成 9 位数字 ID
function generateNumericId() {
  const id = 100000000 + Math.floor(Math.random() * 900000000);
  return id.toString();
}

export class Room {
  constructor(state, env) {
    this.state = state;
    this.clients = new Map(); // clientId -> WebSocket
    this.numericToUuid = new Map(); // numericId -> clientId (uuid)
    this.uuidToNumeric = new Map(); // clientId (uuid) -> numericId
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("xdesk signal server", {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    // 生成 UUID 和对应的 9 位数字 ID
    const clientId = crypto.randomUUID();
    let numericId = generateNumericId();
    
    // 确保数字 ID 唯一
    while (this.numericToUuid.has(numericId)) {
      numericId = generateNumericId();
    }
    
    // 建立映射
    this.numericToUuid.set(numericId, clientId);
    this.uuidToNumeric.set(clientId, numericId);
    this.clients.set(clientId, server);

    // 发送数字 ID 给客户端
    server.send(JSON.stringify({
      type: "id",
      id: numericId  // 发送 9 位数字 ID
    }));

    console.log(`Client connected: ${numericId} (uuid: ${clientId})`);

    // 处理消息
    server.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.error("Invalid JSON:", e);
        return;
      }

      // 如果消息中的 to 是数字 ID，转换为 UUID
      if (msg.to && this.numericToUuid.has(msg.to)) {
        msg.to = this.numericToUuid.get(msg.to);
      }

      // 添加发送者的数字 ID
      msg.id = numericId;

      // 转发消息
      if (msg.to) {
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

    server.addEventListener("close", () => {
      this.clients.delete(clientId);
      this.numericToUuid.delete(numericId);
      this.uuidToNumeric.delete(clientId);
      console.log(`Client disconnected: ${numericId}`);
    });

    server.addEventListener("error", () => {
      this.clients.delete(clientId);
      this.numericToUuid.delete(numericId);
      this.uuidToNumeric.delete(clientId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = url.searchParams.get("room") || "default";
    const id = env.ROOM.idFromName(room);
    const obj = env.ROOM.get(id);
    return obj.fetch(request);
  }
};
