import * as http from 'http';

export type InputCallback = (type: string, data: any) => void;
export type ShellCallback = (command: string) => void;

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
  private onShell: ShellCallback | null = null;
  private shellOutput: string = '';

  constructor(port: number = 8080) {
    this.port = port;
  }

  setInputCallback(callback: InputCallback): void {
    this.onInput = callback;
  }

  setShellCallback(callback: ShellCallback): void {
    this.onShell = callback;
  }

  appendShellOutput(data: string): void {
    this.shellOutput += data;
    if (this.shellOutput.length > 50000) {
      this.shellOutput = this.shellOutput.slice(-50000);
    }
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
      } else if (req.url === '/shell' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          try {
            const { command } = JSON.parse(body);
            if (this.onShell && command) {
              this.onShell(command);
            }
          } catch (e) {}
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        });
      } else if (req.url === '/shell-output') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(this.shellOutput);
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
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: #222;
      border-bottom: 1px solid #333;
      flex-shrink: 0;
    }
    h1 { color: #fff; font-size: 15px; }
    .stats { display: flex; gap: 10px; align-items: center; }
    .stat { color: #888; font-size: 11px; background: #333; padding: 2px 8px; border-radius: 3px; }
    .stat .value { color: #4CAF50; font-weight: bold; }
    .controls { display: flex; gap: 5px; align-items: center; }
    .btn { background: #444; color: #fff; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; }
    .btn:hover { background: #555; }
    .btn.active { background: #4CAF50; }
    .zoom-controls { display: flex; align-items: center; gap: 3px; }
    .zoom-btn { background: #444; color: #fff; border: none; width: 22px; height: 22px; border-radius: 3px; cursor: pointer; font-size: 13px; }
    .zoom-btn:hover { background: #555; }
    .zoom-value { color: #fff; font-size: 11px; min-width: 35px; text-align: center; }
    .main { flex: 1; display: flex; overflow: hidden; }
    #screen-container {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      position: relative;
    }
    #screen-wrapper {
      position: relative;
      transform-origin: center center;
    }
    #screen {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 40px);
      user-select: none;
    }
    #overlay {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      cursor: crosshair;
    }
    .sidebar {
      width: 350px;
      background: #1e1e1e;
      border-left: 1px solid #333;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .sidebar-header {
      padding: 8px 12px;
      background: #252525;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sidebar-header h2 { color: #fff; font-size: 13px; }
    .sidebar-toggle { cursor: pointer; color: #888; font-size: 18px; }
    .sidebar-toggle:hover { color: #fff; }
    #shell-output {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 12px;
      color: #d4d4d4;
      background: #1e1e1e;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .shell-input {
      display: flex;
      padding: 8px;
      background: #252525;
      border-top: 1px solid #333;
    }
    .shell-input span { color: #4CAF50; font-family: monospace; margin-right: 8px; line-height: 28px; }
    #shell-cmd {
      flex: 1;
      background: #333;
      border: 1px solid #444;
      color: #fff;
      padding: 4px 8px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 12px;
    }
    #shell-cmd:focus { outline: none; border-color: #4CAF50; }
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
    .collapsed .sidebar { width: 0; overflow: hidden; }
    .collapsed .sidebar-header, .collapsed .shell-input, .collapsed #shell-output { display: none; }
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
      <button class="btn" onclick="toggleShell()">Shell</button>
    </div>
  </div>
  <div class="main" id="main">
    <div id="screen-container">
      <div id="screen-wrapper">
        <img id="screen" src="" alt="Waiting..." />
        <div id="overlay"></div>
      </div>
    </div>
    <div class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <h2>Shell</h2>
        <span class="sidebar-toggle" onclick="toggleShell()">×</span>
      </div>
      <div id="shell-output"></div>
      <div class="shell-input">
        <span>$</span>
        <input type="text" id="shell-cmd" placeholder="Enter command..." onkeydown="if(event.key==='Enter')sendShell()" />
      </div>
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
    const shellOutput = document.getElementById('shell-output');
    const shellCmd = document.getElementById('shell-cmd');
    const main = document.getElementById('main');
    
    let frameCount = 0;
    let lastTime = Date.now();
    let lastFrameTime = Date.now();
    let currentZoom = 100;
    let shellVisible = true;
    let lastShellOutput = '';
    
    function toggleShell() {
      shellVisible = !shellVisible;
      main.classList.toggle('collapsed', !shellVisible);
    }
    
    function zoomIn() { currentZoom = Math.min(200, currentZoom + 10); applyZoom(); }
    function zoomOut() { currentZoom = Math.max(25, currentZoom - 10); applyZoom(); }
    function zoomFit() {
      const c = document.getElementById('screen-container');
      const cw = c.clientWidth - 10;
      const ch = c.clientHeight - 10;
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
      const x = Math.round((e.clientX - rect.left) / rect.width * iw);
      const y = Math.round((e.clientY - rect.top) / rect.height * ih);
      return { x: Math.max(0, Math.min(iw, x)), y: Math.max(0, Math.min(ih, y)) };
    }
    
    function sendInput(data) {
      fetch('/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(() => {});
    }
    
    function sendShell() {
      const cmd = shellCmd.value.trim();
      if (!cmd) return;
      shellOutput.textContent += '$ ' + cmd + '\\n';
      shellOutput.scrollTop = shellOutput.scrollHeight;
      fetch('/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      }).catch(() => {});
      shellCmd.value = '';
    }
    
    function pollShellOutput() {
      fetch('/shell-output')
        .then(r => r.text())
        .then(text => {
          if (text !== lastShellOutput) {
            shellOutput.textContent = text;
            shellOutput.scrollTop = shellOutput.scrollHeight;
            lastShellOutput = text;
          }
        })
        .catch(() => {});
    }
    setInterval(pollShellOutput, 500);
    
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
      sendInput({ type: 'mouse', action: 'scroll', direction: e.deltaY < 0 ? 'up' : 'down' });
    });
    
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    
    document.addEventListener('keydown', (e) => {
      if (e.target === shellCmd) return;
      e.preventDefault();
      sendInput({ type: 'key', action: 'press', key: e.key });
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
        else if (e.key === '-') { e.preventDefault(); zoomOut(); }
        else if (e.key === '0') { e.preventDefault(); zoomFit(); }
      }
    });
    
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.deltaY < 0 ? zoomIn() : zoomOut(); }
    }, { passive: false });
    
    function connect() {
      const events = new EventSource('/stream');
      events.onopen = () => { status.textContent = 'Connected'; status.className = 'status connected'; };
      events.onmessage = (e) => {
        const now = Date.now();
        latencyDisplay.textContent = Math.min(now - lastFrameTime, 999);
        lastFrameTime = now;
        img.src = 'data:image/jpeg;base64,' + e.data;
        frameCount++;
        if (now - lastTime >= 1000) { fpsDisplay.textContent = frameCount; frameCount = 0; lastTime = now; }
      };
      events.onerror = () => { status.textContent = 'Disconnected...'; status.className = 'status error'; events.close(); setTimeout(connect, 2000); };
    }
    
    img.onload = () => { if (currentZoom === 100) zoomFit(); };
    connect();
  </script>
</body>
</html>`;
  }
}
