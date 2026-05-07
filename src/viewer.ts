import * as http from 'http';

export type ShellCallback = (command: string) => void;
export type InputCallback = (action: string, data: any) => void;

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
  private onInput: InputCallback | null = null;
  private shellOutput: string = '';

  constructor(port: number = 8080) {
    this.port = port;
  }

  setShellCallback(callback: ShellCallback): void {
    this.onShell = callback;
  }

  setInputCallback(callback: InputCallback): void {
    this.onInput = callback;
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
        if (this.currentFrame) {
          res.write('data: ' + this.currentFrame + '\n\n');
        }
        req.on('close', () => { this.clients.delete(res); });
      } else if (req.url === '/input' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          try {
            const input = JSON.parse(body);
            if (this.onInput) {
              this.onInput(input.action, input);
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
      console.log('Viewer: http://localhost:' + this.port);
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
    
    // Push to SSE clients
    for (const client of this.clients) {
      try { 
        client.write('data: ' + frameBase64 + '\n\n'); 
      } catch (e) { 
        this.clients.delete(client); 
      }
    }
  }

  getCurrentFps(): number { return this.currentFps; }

  stop(): void {
    if (this.server) { this.server.close(); this.server = null; }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>xdesk - Remote Desktop</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f0f0f;
      color: #fff;
      height: 100vh;
      overflow: hidden;
    }
    .app { display: flex; flex-direction: column; height: 100vh; }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px; background: #1a1a1a; border-bottom: 1px solid #2a2a2a;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-icon {
      width: 28px; height: 28px;
      background: linear-gradient(135deg, #4f9cf7, #8b5cf6);
      border-radius: 6px; display: flex; align-items: center; justify-content: center;
    }
    .logo-text { font-size: 16px; font-weight: 600; }
    .logo-badge { font-size: 10px; padding: 2px 8px; background: #4f9cf7; color: white; border-radius: 20px; }
    .stats { display: flex; gap: 16px; align-items: center; }
    .stat { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #888; }
    .stat-value { font-weight: 600; color: #22c55e; font-family: monospace; }
    .stat-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .btns { display: flex; gap: 8px; }
    .btn { padding: 6px 12px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
    .btn-ghost { background: transparent; color: #888; border: 1px solid #333; }
    .btn-ghost:hover { background: #2a2a2a; color: #fff; }
    .main { flex: 1; display: flex; overflow: hidden; }
    .screen-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .screen-frame { position: relative; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.6); }
    #screen { display: block; max-width: 100%; max-height: calc(100vh - 100px); object-fit: contain; background: #000; min-width: 640px; min-height: 360px; }
    #overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: crosshair; }
    .screen-badge { position: absolute; top: 10px; left: 10px; padding: 4px 10px; background: rgba(0,0,0,0.6); border-radius: 20px; font-size: 11px; display: flex; align-items: center; gap: 6px; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; }
    .sidebar { width: 360px; background: #1a1a1a; border-left: 1px solid #2a2a2a; display: flex; flex-direction: column; }
    .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #2a2a2a; }
    .sidebar-title { font-size: 13px; font-weight: 600; }
    .terminal { flex: 1; display: flex; flex-direction: column; background: #111; margin: 10px; border-radius: 8px; border: 1px solid #2a2a2a; overflow: hidden; }
    .terminal-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #1a1a1a; border-bottom: 1px solid #2a2a2a; }
    .terminal-dots { display: flex; gap: 5px; }
    .terminal-dot { width: 8px; height: 8px; border-radius: 50%; }
    .terminal-dot.r { background: #ff5f57; }
    .terminal-dot.y { background: #febc2e; }
    .terminal-dot.g { background: #28c840; }
    .terminal-title { font-size: 11px; color: #666; font-family: monospace; }
    .terminal-output { flex: 1; padding: 12px; overflow-y: auto; font-family: monospace; font-size: 12px; line-height: 1.6; color: #888; white-space: pre-wrap; }
    .terminal-input { display: flex; align-items: center; padding: 10px 12px; background: #1a1a1a; border-top: 1px solid #2a2a2a; gap: 10px; }
    .prompt { color: #4f9cf7; font-family: monospace; font-size: 13px; font-weight: 600; }
    #cmd { flex: 1; background: transparent; border: none; color: #fff; font-family: monospace; font-size: 12px; outline: none; }
    #cmd::placeholder { color: #555; }
    .status-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 16px; background: #1a1a1a; border-top: 1px solid #2a2a2a; font-size: 11px; color: #555; }
    .status-left, .status-right { display: flex; gap: 16px; }
    .status-item { display: flex; align-items: center; gap: 4px; }
  </style>
</head>
<body>
  <div class="app">
    <header class="header">
      <div class="logo">
        <div class="logo-icon">🖥</div>
        <span class="logo-text">xdesk</span>
        <span class="logo-badge">Remote</span>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-dot"></div><span>FPS</span><span class="stat-value" id="fps">0</span></div>
        <div class="stat"><span>延迟</span><span class="stat-value" id="latency">0ms</span></div>
        <div class="stat"><span>分辨率</span><span class="stat-value" id="resolution">-</span></div>
      </div>
      <div class="btns">
        <button class="btn btn-ghost" onclick="toggleSidebar()">Terminal</button>
        <button class="btn btn-ghost" onclick="toggleFullscreen()">Fullscreen</button>
      </div>
    </header>
    <main class="main">
      <div class="screen-container">
        <div class="screen-frame">
          <img id="screen" src="" alt="Waiting for screen...">
          <div id="overlay"></div>
          <div class="screen-badge">
            <div class="badge-dot"></div>
            <span id="status-badge">Connected</span>
          </div>
        </div>
      </div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">Terminal</span>
          <button class="btn btn-ghost" onclick="toggleSidebar()">✕</button>
        </div>
        <div class="terminal">
          <div class="terminal-header">
            <div class="terminal-dots"><div class="terminal-dot r"></div><div class="terminal-dot y"></div><div class="terminal-dot g"></div></div>
            <span class="terminal-title">bash</span>
          </div>
          <div class="terminal-output" id="output"></div>
          <div class="terminal-input">
            <span class="prompt">$</span>
            <input type="text" id="cmd" placeholder="Command..." autocomplete="off">
          </div>
        </div>
      </aside>
    </main>
    <footer class="status-bar">
      <div class="status-left">
        <div class="status-item"><span>●</span><span id="conn-status">Connected</span></div>
        <div class="status-item"><span id="bandwidth">0 KB/s</span></div>
      </div>
      <div class="status-right">
        <div class="status-item"><span id="uptime">00:00:00</span></div>
        <div class="status-item">xdesk v1.0</div>
      </div>
    </footer>
  </div>
  <script>
    var img = document.getElementById('screen');
    var overlay = document.getElementById('overlay');
    var fpsEl = document.getElementById('fps');
    var latEl = document.getElementById('latency');
    var resEl = document.getElementById('resolution');
    var outEl = document.getElementById('output');
    var cmdEl = document.getElementById('cmd');
    var statusEl = document.getElementById('status-badge');
    var connEl = document.getElementById('conn-status');
    var bwEl = document.getElementById('bandwidth');
    var upEl = document.getElementById('uptime');
    var sidebar = document.getElementById('sidebar');
    var frames = 0, lastSec = Date.now(), lastFrame = Date.now();
    var lastOut = '', startTime = Date.now(), lastBw = Date.now(), bytes = 0;

    function sendInput(d) {
      fetch('/input', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d)});
    }

    function getCoords(e) {
      var r = overlay.getBoundingClientRect();
      var iw = img.naturalWidth || 1920, ih = img.naturalHeight || 1080;
      return {
        x: Math.max(0, Math.min(iw, Math.round((e.clientX-r.left)/r.width*iw))),
        y: Math.max(0, Math.min(ih, Math.round((e.clientY-r.top)/r.height*ih)))
      };
    }

    overlay.addEventListener('mousemove', function(e) {
      var p = getCoords(e);
      sendInput({action:'mousemove', x:p.x, y:p.y});
    });

    overlay.addEventListener('mousedown', function(e) {
      e.preventDefault();
      var p = getCoords(e);
      var b = e.button===0?'left':e.button===2?'right':'middle';
      sendInput({action:'mouseclick', x:p.x, y:p.y, button:b});
    });

    overlay.addEventListener('wheel', function(e) {
      e.preventDefault();
      sendInput({action:'mousescroll', x:0, y:0, direction:e.deltaY<0?'up':'down'});
    });

    overlay.addEventListener('contextmenu', function(e) { e.preventDefault(); });

    document.addEventListener('keydown', function(e) {
      if (e.target===cmdEl) return;
      e.preventDefault();
      sendInput({action:'keypress', key:e.key});
    });

    cmdEl.addEventListener('keydown', function(e) {
      if (e.key==='Enter') {
        var c = cmdEl.value.trim();
        if (c) {
          outEl.textContent += '$ '+c+'\\n';
          outEl.scrollTop = outEl.scrollHeight;
          fetch('/shell', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command:c})});
          cmdEl.value = '';
        }
      }
      e.stopPropagation();
    });

    setInterval(function() {
      fetch('/shell-output').then(function(r){return r.text();}).then(function(t) {
        if (t!==lastOut) { outEl.textContent=t; outEl.scrollTop=outEl.scrollHeight; lastOut=t; }
      }).catch(function(){});
    }, 300);

    // Use SSE for real-time updates
    function connect() {
      var es = new EventSource('/stream');
      es.onopen = function() {
        statusEl.textContent = 'Connected';
        connEl.textContent = 'Connected';
        document.querySelector('.badge-dot').style.background = '#22c55e';
      };
      es.onmessage = function(e) {
        var now = Date.now();
        latEl.textContent = Math.min(now-lastFrame, 999) + 'ms';
        lastFrame = now;
        img.src = 'data:image/jpeg;base64,' + e.data;
        bytes += e.data.length;
        frames++;
        if (now-lastSec >= 1000) {
          fpsEl.textContent = frames;
          frames = 0;
          lastSec = now;
        }
        if (img.naturalWidth) {
          resEl.textContent = img.naturalWidth + 'x' + img.naturalHeight;
        }
      };
      es.onerror = function() {
        statusEl.textContent = 'Reconnecting...';
        connEl.textContent = 'Reconnecting';
        document.querySelector('.badge-dot').style.background = '#f59e0b';
        es.close();
        setTimeout(connect, 2000);
      };
    }

    function updateStats() {
      var now = Date.now();
      var el = Math.floor((now-startTime)/1000);
      var h = String(Math.floor(el/3600)).padStart(2, '0');
      var m = String(Math.floor((el%3600)/60)).padStart(2, '0');
      var s = String(el%60).padStart(2, '0');
      upEl.textContent = h+':'+m+':'+s;
      var be = (now-lastBw)/1000;
      if (be >= 1) {
        bwEl.textContent = Math.round(bytes/be/1024) + ' KB/s';
        bytes = 0;
        lastBw = now;
      }
    }
    setInterval(updateStats, 1000);

    function toggleSidebar() {
      sidebar.style.display = sidebar.style.display==='none' ? 'flex' : 'none';
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    }

    // Start connection
    connect();
  </script>
</body>
</html>`;
  }
}
