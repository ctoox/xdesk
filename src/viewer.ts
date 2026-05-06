import * as http from 'http';

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
  private onShell: ShellCallback | null = null;
  private shellOutput: string = '';

  constructor(port: number = 8080) {
    this.port = port;
  }

  setShellCallback(callback: ShellCallback): void {
    this.onShell = callback;
  }

  appendShellOutput(data: string): void {
    this.shellOutput += data;
    if (this.shellOutput.length > 100000) {
      this.shellOutput = this.shellOutput.slice(-100000);
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
        if (this.currentFrame) res.write(`data: ${this.currentFrame}\n\n`);
        req.on('close', () => { this.clients.delete(res); });
      } else if (req.url === '/shell' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          try {
            const { command } = JSON.parse(body);
            if (this.onShell && command) this.onShell(command);
          } catch (e) {}
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        });
      } else if (req.url === '/shell-output') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(this.shellOutput);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.server.listen(this.port, () => {
      console.log(`Viewer: http://localhost:${this.port}`);
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

  updateFrame(frameBase64: string): void {
    this.currentFrame = frameBase64;
    this.frameCount++;
    for (const client of this.clients) {
      try { client.write(`data: ${frameBase64}\n\n`); } catch (e) { this.clients.delete(client); }
    }
  }

  getCurrentFps(): number { return this.currentFps; }

  stop(): void {
    if (this.server) { this.server.close(); this.server = null; }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>xdesk</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; display: flex; height: 100vh; font-family: -apple-system, sans-serif; overflow: hidden; }
    .main { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; }
    .header { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #1a1a1a; border-bottom: 1px solid #333; flex-shrink: 0; }
    .header span { color: #888; font-size: 12px; }
    .header b { color: #4CAF50; }
    .screen-container { flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; padding: 4px; }
    #screen { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }
    .sidebar { width: 320px; background: #1a1a1a; border-left: 1px solid #333; display: flex; flex-direction: column; flex-shrink: 0; }
    .sidebar-h { padding: 8px 12px; background: #222; color: #fff; font-size: 12px; border-bottom: 1px solid #333; }
    #out { flex: 1; overflow-y: auto; padding: 8px; font-family: 'Cascadia Code', Consolas, monospace; font-size: 11px; color: #d4d4d4; white-space: pre-wrap; }
    .input { display: flex; padding: 8px; background: #222; border-top: 1px solid #333; }
    .prompt { color: #4CAF50; font-family: monospace; margin-right: 6px; line-height: 24px; font-size: 12px; }
    #cmd { flex: 1; background: #333; border: 1px solid #444; color: #fff; padding: 4px 8px; border-radius: 3px; font-family: monospace; font-size: 12px; }
    #cmd:focus { outline: none; border-color: #4CAF50; }
  </style>
</head>
<body>
  <div class="main">
    <div class="header">
      <span>xdesk</span>
      <span>FPS: <b id="fps">0</b> | 延迟: <b id="lat">0</b>ms</span>
    </div>
    <div class="screen-container">
      <img id="screen" src="" alt="Waiting..." />
    </div>
  </div>
  <div class="sidebar">
    <div class="sidebar-h">Shell</div>
    <div id="out"></div>
    <div class="input">
      <span class="prompt">$</span>
      <input type="text" id="cmd" placeholder="Command..." />
    </div>
  </div>
  <script>
    const img = document.getElementById('screen');
    const fpsEl = document.getElementById('fps');
    const latEl = document.getElementById('lat');
    const out = document.getElementById('out');
    const cmd = document.getElementById('cmd');
    let frames = 0, lastSec = Date.now(), lastFrame = Date.now(), lastOut = '';
    
    cmd.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const c = cmd.value.trim();
        if (c) {
          out.textContent += '$ ' + c + '\\n';
          out.scrollTop = out.scrollHeight;
          fetch('/shell', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command:c}) });
          cmd.value = '';
        }
      }
      e.stopPropagation();
    });
    
    setInterval(() => {
      fetch('/shell-output').then(r => r.text()).then(t => {
        if (t !== lastOut) { out.textContent = t; out.scrollTop = out.scrollHeight; lastOut = t; }
      }).catch(() => {});
    }, 300);
    
    function connect() {
      const es = new EventSource('/stream');
      es.onopen = () => { document.title = 'xdesk - Connected'; };
      es.onmessage = e => {
        const now = Date.now();
        latEl.textContent = Math.min(now - lastFrame, 999);
        lastFrame = now;
        img.src = 'data:image/jpeg;base64,' + e.data;
        frames++;
        if (now - lastSec >= 1000) { fpsEl.textContent = frames; frames = 0; lastSec = now; }
      };
      es.onerror = () => { es.close(); setTimeout(connect, 2000); };
    }
    connect();
  </script>
</body>
</html>`;
  }
}
