import * as http from 'http';

export class ScreenViewer {
  private server: http.Server | null = null;
  private port: number;
  private currentFrame: string | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private frameCount: number = 0;
  private startTime: number = 0;

  constructor(port: number = 8080) {
    this.port = port;
  }

  start(): void {
    this.startTime = Date.now();
    
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
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.server.listen(this.port, () => {
      console.log(`Screen viewer started at http://localhost:${this.port}`);
    });
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
      fps: Math.round(this.frameCount / elapsed),
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
      padding: 20px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      max-width: 1920px;
      margin-bottom: 10px;
    }
    h1 {
      color: #fff;
      font-size: 20px;
    }
    .stats {
      color: #888;
      font-size: 14px;
    }
    #screen-container {
      position: relative;
      width: 100%;
      max-width: 1920px;
    }
    #screen {
      width: 100%;
      border: 2px solid #333;
      border-radius: 8px;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
      cursor: crosshair;
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
      color: #888;
      margin-top: 10px;
      font-size: 14px;
    }
    .status.connected { color: #4CAF50; }
    .status.error { color: #f44336; }
    .controls {
      margin-top: 20px;
      display: flex;
      gap: 10px;
    }
    .btn {
      background: #333;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn:hover { background: #444; }
  </style>
</head>
<body>
  <div class="header">
    <h1>xdesk Remote Screen</h1>
    <div class="stats" id="stats">FPS: 0 | Clients: 0</div>
  </div>
  <div id="screen-container">
    <img id="screen" src="" alt="Waiting for screen..." />
    <div id="overlay"></div>
  </div>
  <div id="status" class="status">Connecting...</div>
  
  <script>
    const img = document.getElementById('screen');
    const overlay = document.getElementById('overlay');
    const status = document.getElementById('status');
    const stats = document.getElementById('stats');
    
    let frameCount = 0;
    let lastTime = Date.now();
    let ws = null;
    
    function connect() {
      const events = new EventSource('/stream');
      
      events.onopen = () => {
        status.textContent = 'Connected';
        status.className = 'status connected';
      };
      
      events.onmessage = (e) => {
        img.src = 'data:image/jpeg;base64,' + e.data;
        frameCount++;
        
        const now = Date.now();
        if (now - lastTime >= 1000) {
          stats.textContent = 'FPS: ' + frameCount;
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
    
    // Mouse events
    overlay.addEventListener('mousemove', (e) => {
      const rect = overlay.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) / rect.width * img.naturalWidth);
      const y = Math.round((e.clientY - rect.top) / rect.height * img.naturalHeight);
      sendInput('mouse', { action: 'move', x, y });
    });
    
    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = overlay.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) / rect.width * img.naturalWidth);
      const y = Math.round((e.clientY - rect.top) / rect.height * img.naturalHeight);
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      sendInput('mouse', { action: 'click', x, y, button });
    });
    
    overlay.addEventListener('wheel', (e) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 'up' : 'down';
      sendInput('mouse', { action: 'scroll', direction });
    });
    
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Keyboard events
    document.addEventListener('keydown', (e) => {
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
    
    connect();
  </script>
</body>
</html>`;
  }
}
