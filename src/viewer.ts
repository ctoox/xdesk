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
      console.log(`Screen viewer: http://localhost:${this.port}`);
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
      try { client.write(`data: ${frame}\n\n`); } catch (e) { this.clients.delete(client); }
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
    body { background: #1a1a1a; display: flex; height: 100vh; font-family: -apple-system, sans-serif; overflow: hidden; }
    .screen-area { flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; position: relative; }
    .header { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 8px 15px; background: rgba(0,0,0,0.7); z-index: 10; }
    .header h1 { color: #fff; font-size: 14px; }
    .stats { display: flex; gap: 10px; }
    .stat { color: #888; font-size: 11px; }
    .stat b { color: #4CAF50; }
    #screen { max-width: 100%; max-height: 100vh; display: block; }
    .sidebar { width: 400px; background: #1e1e1e; border-left: 1px solid #333; display: flex; flex-direction: column; }
    .sidebar-header { padding: 10px 15px; background: #252525; border-bottom: 1px solid #333; color: #fff; font-size: 13px; }
    #shell-output { flex: 1; overflow-y: auto; padding: 10px; font-family: 'Cascadia Code', Consolas, monospace; font-size: 13px; color: #d4d4d4; background: #1e1e1e; white-space: pre-wrap; word-break: break-all; }
    .input-area { display: flex; padding: 10px; background: #252525; border-top: 1px solid #333; }
    .prompt { color: #4CAF50; font-family: monospace; margin-right: 10px; line-height: 30px; }
    #cmd { flex: 1; background: #333; border: 1px solid #444; color: #fff; padding: 6px 10px; border-radius: 4px; font-family: monospace; font-size: 13px; }
    #cmd:focus { outline: none; border-color: #4CAF50; }
    .connected { color: #4CAF50; }
  </style>
</head>
<body>
  <div class="screen-area">
    <div class="header">
      <h1>xdesk</h1>
      <div class="stats">
        <span class="stat">FPS: <b id="fps">0</b></span>
        <span class="stat">延迟: <b id="latency">0</b>ms</span>
      </div>
    </div>
    <img id="screen" src="" alt="Waiting..." />
  </div>
  <div class="sidebar">
    <div class="sidebar-header">Shell</div>
    <div id="shell-output"></div>
    <div class="input-area">
      <span class="prompt">$</span>
      <input type="text" id="cmd" placeholder="Enter command..." />
    </div>
  </div>
  
  <script>
    const img = document.getElementById('screen');
    const fpsEl = document.getElementById('fps');
    const latEl = document.getElementById('latency');
    const out = document.getElementById('shell-output');
    const cmd = document.getElementById('cmd');
    
    let frames = 0, lastSec = Date.now(), lastFrame = Date.now(), lastOutput = '';
    
    cmd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const c = cmd.value.trim();
        if (!c) return;
        out.textContent += '$ ' + c + '\\n';
        out.scrollTop = out.scrollHeight;
        fetch('/shell', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command:c}) });
        cmd.value = '';
      }
      e.stopPropagation();
    });
    
    setInterval(() => {
      fetch('/shell-output').then(r => r.text()).then(t => {
        if (t !== lastOutput) { out.textContent = t; out.scrollTop = out.scrollHeight; lastOutput = t; }
      }).catch(() => {});
    }, 300);
    
    function connect() {
      const es = new EventSource('/stream');
      es.onopen = () => { document.title = 'xdesk - Connected'; };
      es.onmessage = (e) => {
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
