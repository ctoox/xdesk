import * as http from 'http';

export type InputCallback = (type: string, data: any) => void;

export class ScreenViewer {
  private server: http.Server | null = null;
  private port: number;
  private currentFrame: string | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private frameCount: number = 0;
  private startTime: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 0;
  private onInput: InputCallback | null = null;

  constructor(port: number = 8080) {
    this.port = port;
  }

  setInputCallback(callback: InputCallback): void {
    this.onInput = callback;
  }

  start(): void {
    this.startTime = Date.now();
    this.lastFpsUpdate = Date.now();
    
    this.server = http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getHtml());
      } else if (req.url === '/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        
        this.clients.add(res);
        
        if (this.currentFrame) {
          res.write(`data: ${this.currentFrame}\n\n`);
        }
        
        req.on('close', () => {
          this.clients.delete(res);
        });
      } else if (req.url === '/input' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          try {
            const input = JSON.parse(body);
            if (this.onInput) {
              this.onInput(input.type, input);
            }
          } catch (e) {}
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        });
      } else if (req.url === '/stats') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(this.getStats()));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.server.listen(this.port, () => {
      console.log(`Screen viewer started at http://localhost:${this.port}`);
    });

    setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.lastFpsUpdate) / 1000;
      if (elapsed > 0) {
        this.currentFps = Math.round(this.frameCount / elapsed);
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }
    }, 1000);
  }

  updateFrame(frame: string): void {
    this.currentFrame = frame;
    this.frameCount++;
    
    for (const client of this.clients) {
      try {
        client.write(`data: ${frame}\n\n`);
      } catch (e) {
        this.clients.delete(client);
      }
    }
  }

  getCurrentFps(): number {
    return this.currentFps;
  }

  getStats(): any {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return {
      clients: this.clients.size,
      fps: this.currentFps,
      uptime: Math.round(elapsed)
    };
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>xdesk - Remote Screen</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: #1a1a1a; 
      display: flex; 
      flex-direction: column;
      align-items: center; 
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      padding: 8px 15px;
      background: #222;
      flex-shrink: 0;
    }
    h1 {
      color: #fff;
      font-size: 16px;
    }
    .stats {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .stat {
      color: #888;
      font-size: 12px;
      background: #333;
      padding: 3px 8px;
      border-radius: 3px;
    }
    .stat .value {
      color: #4CAF50;
      font-weight: bold;
    }
    .controls {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .btn {
      background: #444;
      color: #fff;
      border: none;
      padding: 4px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    .btn:hover { background: #555; }
    .zoom-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .zoom-btn {
      background: #444;
      color: #fff;
      border: none;
      width: 24px;
      height: 24px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 14px;
    }
    .zoom-btn:hover { background: #555; }
    .zoom-value {
      color: #fff;
      font-size: 12px;
      min-width: 40px;
      text-align: center;
    }
    #screen-container {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      width: 100%;
      position: relative;
    }
    #screen-wrapper {
      position: relative;
      transform-origin: center center;
    }
    #screen {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 45px);
      user-select: none;
      -webkit-user-drag: none;
    }
    #overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      cursor: crosshair;
    }
    .status {
      position: fixed;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
      color: #888;
      font-size: 11px;
      background: rgba(0,0,0,0.8);
      padding: 3px 10px;
      border-radius: 3px;
      z-index: 10;
    }
    .status.connected { color: #4CAF50; }
    .status.error { color: #f44336; }
  </style>
</head>
<body>
  <div class="header">
    <h1>xdesk</h1>
    <div class="stats">
      <div class="stat">FPS: <span class="value" id="fps">0</span></div>
      <div class="stat">延迟: <span class="value" id="latency">0</span>ms</div>
    </div>
    <div class="controls">
      <div class="zoom-controls">
        <button class="zoom-btn" onclick="zoomOut()">-</button>
        <span class="zoom-value" id="zoom">100%</span>
        <button class="zoom-btn" onclick="zoomIn()">+</button>
        <button class="btn" onclick="zoomFit()">适应</button>
      </div>
    </div>
  </div>
  <div id="screen-container">
    <div id="screen-wrapper">
      <img id="screen" src="" alt="Waiting..." />
      <div id="overlay"></div>
    </div>
  </div>
  <div id="status" class="status">Connecting...</div>
  
  <script>
    const img = document.getElementById('screen');
    const overlay = document.getElementById('overlay');
    const status = document.getElementById('status');
    const fpsDisplay = document.getElementById('fps');
    const latencyDisplay = document.getElementById('latency');
    const zoomDisplay = document.getElementById('zoom');
    const screenWrapper = document.getElementById('screen-wrapper');
    
    let frameCount = 0;
    let lastTime = Date.now();
    let lastFrameTime = Date.now();
    let currentZoom = 100;
    
    function zoomIn() {
      currentZoom = Math.min(200, currentZoom + 10);
      applyZoom();
    }
    
    function zoomOut() {
      currentZoom = Math.max(25, currentZoom - 10);
      applyZoom();
    }
    
    function zoomFit() {
      const container = document.getElementById('screen-container');
      const cw = container.clientWidth - 10;
      const ch = container.clientHeight - 10;
      const iw = img.naturalWidth || 1920;
      const ih = img.naturalHeight || 1080;
      currentZoom = Math.round(Math.min(cw / iw, ch / ih) * 100);
      applyZoom();
    }
    
    function applyZoom() {
      screenWrapper.style.transform = 'scale(' + (currentZoom / 100) + ')';
      zoomDisplay.textContent = currentZoom + '%';
    }
    
    function getCoords(e) {
      const rect = overlay.getBoundingClientRect();
      const iw = img.naturalWidth || 1920;
      const ih = img.naturalHeight || 1080;
      const displayW = rect.width * currentZoom / 100;
      const displayH = rect.height * currentZoom / 100;
      const x = Math.round((e.clientX - rect.left) / displayW * iw);
      const y = Math.round((e.clientY - rect.top) / displayH * ih);
      return { x: Math.max(0, Math.min(iw, x)), y: Math.max(0, Math.min(ih, y)) };
    }
    
    function sendInput(data) {
      fetch('/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(() => {});
    }
    
    // Mouse events
    overlay.addEventListener('mousemove', (e) => {
      const { x, y } = getCoords(e);
      sendInput({ type: 'mouse', action: 'move', x, y });
    });
    
    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const { x, y } = getCoords(e);
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      sendInput({ type: 'mouse', action: 'click', x, y, button });
    });
    
    overlay.addEventListener('wheel', (e) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 'up' : 'down';
      sendInput({ type: 'mouse', action: 'scroll', direction });
    });
    
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Keyboard events
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      sendInput({ type: 'key', action: 'press', key: e.key });
    });
    
    // Zoom shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
        else if (e.key === '-') { e.preventDefault(); zoomOut(); }
        else if (e.key === '0') { e.preventDefault(); zoomFit(); }
      }
    });
    
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.deltaY < 0 ? zoomIn() : zoomOut();
      }
    }, { passive: false });
    
    function connect() {
      const events = new EventSource('/stream');
      events.onopen = () => {
        status.textContent = 'Connected - Click to control remote';
        status.className = 'status connected';
      };
      events.onmessage = (e) => {
        const now = Date.now();
        latencyDisplay.textContent = Math.min(now - lastFrameTime, 999);
        lastFrameTime = now;
        img.src = 'data:image/jpeg;base64,' + e.data;
        frameCount++;
        if (now - lastTime >= 1000) {
          fpsDisplay.textContent = frameCount;
          frameCount = 0;
          lastTime = now;
        }
      };
      events.onerror = () => {
        status.textContent = 'Disconnected...';
        status.className = 'status error';
        events.close();
        setTimeout(connect, 2000);
      };
    }
    
    img.onload = () => { if (currentZoom === 100) zoomFit(); };
    connect();
  </script>
</body>
</html>`;
  }
}
