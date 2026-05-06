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
    html, body { height: 100%; overflow: hidden; background: #000; }
    body { display: flex; font-family: -apple-system, sans-serif; }
    .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; background: #1e1e1e; border-bottom: 1px solid #333; height: 32px; flex-shrink: 0; }
    .toolbar span { color: #888; font-size: 11px; }
    .toolbar b { color: #4CAF50; }
    .view { flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; background: #111; }
    #screen { width: 100%; height: 100%; object-fit: contain; }
    .sidebar { width: 300px; background: #1a1a1a; border-left: 1px solid #333; display: flex; flex-direction: column; flex-shrink: 0; }
    .sidebar-h { padding: 6px 10px; background: #252525; color: #ccc; font-size: 11px; border-bottom: 1px solid #333; }
    #out { flex: 1; overflow-y: auto; padding: 6px; font-family: Consolas, monospace; font-size: 11px; color: #d4d4d4; white-space: pre-wrap; }
    .input-bar { display: flex; padding: 6px; background: #252525; border-top: 1px solid #333; }
    .prompt { color: #4CAF50; font-family: monospace; margin-right: 6px; line-height: 22px; }
    #cmd { flex: 1; background: #333; border: 1px solid #444; color: #fff; padding: 3px 8px; border-radius: 3px; font-family: monospace; font-size: 11px; }
    #cmd:focus { outline: none; border-color: #4CAF50; }
  </style>
</head>
<body>
  <div class="main">
    <div class="toolbar">
      <span>xdesk</span>
      <span>FPS: <b id="fps">0</b> | 延迟: <b id="lat">0</b>ms</span>
    </div>
    <div class="view">
      <img id="screen" src="" alt="" />
    </div>
  </div>
  <div class="sidebar">
    <div class="sidebar-h">Shell</div>
    <div id="out"></div>
    <div class="input-bar">
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
      es.onopen = () => { document.title = 'xdesk'; };
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
