import * as http from 'http';

export class ScreenViewer {
  private server: http.Server | null = null;
  private port: number;
  private currentFrame: string | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private frameCount: number = 0;
  private startTime: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 0;
  private frameBuffer: string[] = [];

  constructor(port: number = 8080) {
    this.port = port;
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
      } else if (req.url === '/stats') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(this.getStats()));
      } else if (req.url === '/frame') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(this.currentFrame || '');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.server.listen(this.port, () => {
      console.log(`Screen viewer started at http://localhost:${this.port}`);
    });

    // Update FPS every second
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

  getStats(): any {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return {
      clients: this.clients.size,
      frames: this.frameCount,
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
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 10px;
      overflow: hidden;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      margin-bottom: 10px;
      padding: 0 10px;
    }
    h1 {
      color: #fff;
      font-size: 18px;
    }
    .stats {
      display: flex;
      gap: 15px;
      align-items: center;
    }
    .stat {
      color: #888;
      font-size: 13px;
      background: #2a2a2a;
      padding: 4px 10px;
      border-radius: 4px;
    }
    .stat .value {
      color: #4CAF50;
      font-weight: bold;
    }
    .controls {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .btn {
      background: #333;
      color: #fff;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn:hover { background: #444; }
    .btn.active { background: #4CAF50; }
    #screen-container {
      position: relative;
      width: 100%;
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    #screen-wrapper {
      position: relative;
      transform-origin: center center;
      transition: transform 0.2s ease;
    }
    #screen {
      max-width: 100%;
      max-height: calc(100vh - 80px);
      border: 2px solid #333;
      border-radius: 8px;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
      display: block;
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
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      color: #888;
      font-size: 12px;
      background: rgba(0,0,0,0.7);
      padding: 4px 12px;
      border-radius: 4px;
    }
    .status.connected { color: #4CAF50; }
    .status.error { color: #f44336; }
    .zoom-controls {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .zoom-btn {
      background: #333;
      color: #fff;
      border: none;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .zoom-btn:hover { background: #444; }
    .zoom-value {
      color: #fff;
      font-size: 13px;
      min-width: 45px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>xdesk Remote Screen</h1>
    <div class="stats">
      <div class="stat">FPS: <span class="value" id="fps">0</span></div>
      <div class="stat">延迟: <span class="value" id="latency">0</span>ms</div>
      <div class="stat">客户端: <span class="value" id="clients">0</span></div>
    </div>
    <div class="controls">
      <div class="zoom-controls">
        <button class="zoom-btn" onclick="zoomOut()">-</button>
        <span class="zoom-value" id="zoom">100%</span>
        <button class="zoom-btn" onclick="zoomIn()">+</button>
        <button class="btn" onclick="zoomFit()">适应</button>
        <button class="btn" onclick="zoomReset()">100%</button>
      </div>
    </div>
  </div>
  <div id="screen-container">
    <div id="screen-wrapper">
      <img id="screen" src="" alt="Waiting for screen..." />
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
    const clientsDisplay = document.getElementById('clients');
    const zoomDisplay = document.getElementById('zoom');
    const screenWrapper = document.getElementById('screen-wrapper');
    
    let frameCount = 0;
    let lastTime = Date.now();
    let lastFrameTime = Date.now();
    let currentZoom = 100;
    let fps = 0;
    
    // Zoom functions
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
      const containerWidth = container.clientWidth - 20;
      const containerHeight = container.clientHeight - 20;
      const imgWidth = img.naturalWidth || 1920;
      const imgHeight = img.naturalHeight || 1080;
      
      const scaleX = containerWidth / imgWidth;
      const scaleY = containerHeight / imgHeight;
      currentZoom = Math.round(Math.min(scaleX, scaleY) * 100);
      applyZoom();
    }
    
    function zoomReset() {
      currentZoom = 100;
      applyZoom();
    }
    
    function applyZoom() {
      screenWrapper.style.transform = \`scale(\${currentZoom / 100})\`;
      zoomDisplay.textContent = currentZoom + '%';
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          zoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          zoomOut();
        } else if (e.key === '0') {
          e.preventDefault();
          zoomReset();
        }
      }
    });
    
    // Mouse wheel zoom
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      }
    }, { passive: false });
    
    function connect() {
      const events = new EventSource('/stream');
      
      events.onopen = () => {
        status.textContent = 'Connected';
        status.className = 'status connected';
      };
      
      events.onmessage = (e) => {
        const now = Date.now();
        const latency = now - lastFrameTime;
        lastFrameTime = now;
        
        img.src = 'data:image/jpeg;base64,' + e.data;
        frameCount++;
        
        // Update latency
        latencyDisplay.textContent = Math.min(latency, 999);
        
        // Update FPS every second
        if (now - lastTime >= 1000) {
          fps = frameCount;
          fpsDisplay.textContent = fps;
          frameCount = 0;
          lastTime = now;
        }
      };
      
      events.onerror = () => {
        status.textContent = 'Disconnected, reconnecting...';
        status.className = 'status error';
        events.close();
        setTimeout(connect, 2000);
      };
    }
    
    // Fetch stats periodically
    setInterval(async () => {
      try {
        const res = await fetch('/stats');
        const stats = await res.json();
        clientsDisplay.textContent = stats.clients;
      } catch (e) {}
    }, 2000);
    
    // Mouse events - convert coordinates based on zoom
    overlay.addEventListener('mousemove', (e) => {
      const rect = overlay.getBoundingClientRect();
      const scaleX = img.naturalWidth / (rect.width * currentZoom / 100);
      const scaleY = img.naturalHeight / (rect.height * currentZoom / 100);
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      sendInput('mouse', { action: 'move', x, y });
    });
    
    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = overlay.getBoundingClientRect();
      const scaleX = img.naturalWidth / (rect.width * currentZoom / 100);
      const scaleY = img.naturalHeight / (rect.height * currentZoom / 100);
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      sendInput('mouse', { action: 'click', x, y, button });
    });
    
    overlay.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const direction = e.deltaY < 0 ? 'up' : 'down';
        sendInput('mouse', { action: 'scroll', direction });
      }
    });
    
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Keyboard events
    document.addEventListener('keydown', (e) => {
      // Don't capture if zoom shortcuts
      if (e.ctrlKey || e.metaKey) return;
      
      e.preventDefault();
      sendInput('key', { action: 'press', key: e.key, code: e.code });
    });
    
    function sendInput(type, data) {
      fetch('/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...data })
      }).catch(() => {});
    }
    
    // Auto fit on load
    img.onload = () => {
      if (currentZoom === 100) {
        zoomFit();
      }
    };
    
    connect();
  </script>
</body>
</html>`;
  }
}
