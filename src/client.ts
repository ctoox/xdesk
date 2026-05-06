import WebSocket from 'ws';
import { SignalMessage } from './message';

export class SignalClient {
  private ws: WebSocket | null = null;
  private url: string;
  private proxyUrl: string | null;
  private clientId: string | null = null;
  private peers: Set<string> = new Set();
  private reconnectDelay: number = 3000;
  private maxReconnectDelay: number = 30000;
  private shouldReconnect: boolean = true;
  private onMessageCallback: ((msg: SignalMessage) => void) | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(url: string, proxyUrl?: string) {
    this.url = url;
    this.proxyUrl = proxyUrl || null;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to ${this.url}...`);
      
      const options: WebSocket.ClientOptions = {};
      
      if (this.proxyUrl) {
        try {
          const { HttpsProxyAgent } = require('https-proxy-agent');
          options.agent = new HttpsProxyAgent(this.proxyUrl);
        } catch (e) {}
      }

      this.ws = new WebSocket(this.url, options);

      this.ws.on('open', () => {
        console.log('Connected to signal server');
        this.reconnectDelay = 3000;
        
        // Start heartbeat
        this.startHeartbeat();
        
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg: SignalMessage = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (e) {}
      });

      this.ws.on('close', () => {
        console.log('Disconnected');
        this.stopHeartbeat();
        this.clientId = null;
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err: Error) => {
        console.error('WebSocket error:', err.message);
        if (this.clientId === null) {
          reject(err);
        }
      });

      this.ws.on('pong', () => {
        // Connection is alive
      });
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    console.log(`Reconnecting in ${this.reconnectDelay / 1000}s...`);
    setTimeout(() => {
      this.connect().catch(() => {});
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  private handleMessage(msg: SignalMessage): void {
    if (msg.id && msg.type !== 'id') {
      this.peers.add(msg.id);
    }

    switch (msg.type) {
      case 'id':
        if (msg.id) {
          this.clientId = msg.id;
          console.log(`Client ID: ${msg.id}`);
        }
        break;
      case 'test':
        console.log(`[MESSAGE] from ${msg.id}: ${msg.data?.message || ''}`);
        break;
      default:
        break;
    }

    if (this.onMessageCallback) {
      this.onMessageCallback(msg);
    }
  }

  send(msg: SignalMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, id: this.clientId || undefined }));
    }
  }

  sendTest(to: string, message: string): void {
    this.send({ type: 'test', to, data: { message } });
  }

  onMessage(callback: (msg: SignalMessage) => void): void {
    this.onMessageCallback = callback;
  }

  getClientId(): string | null {
    return this.clientId;
  }

  getPeers(): string[] {
    return Array.from(this.peers);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }
}
