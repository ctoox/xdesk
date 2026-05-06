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
          console.log(`Using proxy: ${this.proxyUrl}`);
        } catch (e) {
          console.warn('Failed to load proxy agent, connecting directly');
        }
      }

      this.ws = new WebSocket(this.url, options);

      this.ws.on('open', () => {
        console.log('Connected to signal server');
        this.reconnectDelay = 3000;
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg: SignalMessage = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      });

      this.ws.on('close', () => {
        console.log('Disconnected');
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
    });
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
        console.log(`[MESSAGE] from ${msg.id}: ${msg.data?.message || 'no data'}`);
        break;
      case 'mouse':
      case 'key':
      case 'screen':
      case 'screen-request':
      case 'screen-info':
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
      const fullMsg = {
        ...msg,
        id: this.clientId || undefined
      };
      this.ws.send(JSON.stringify(fullMsg));
    }
  }

  sendTest(to: string, message: string): void {
    this.send({ type: 'test', to, data: { message } });
  }

  sendMouseMove(to: string, x: number, y: number): void {
    this.send({ type: 'mouse', to, data: { action: 'move', x, y } });
  }

  sendMouseClick(to: string, x: number, y: number, button: string = 'left'): void {
    this.send({ type: 'mouse', to, data: { action: 'click', x, y, button } });
  }

  sendKeyDown(to: string, key: string): void {
    this.send({ type: 'key', to, data: { action: 'down', key } });
  }

  sendKeyUp(to: string, key: string): void {
    this.send({ type: 'key', to, data: { action: 'up', key } });
  }

  sendKeyPress(to: string, key: string): void {
    this.send({ type: 'key', to, data: { action: 'press', key } });
  }

  sendTypeText(to: string, text: string): void {
    this.send({ type: 'key', to, data: { action: 'type', text } });
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
    if (this.ws) {
      this.ws.close();
    }
  }
}
