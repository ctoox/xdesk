import * as http from 'http';
import { exec } from 'child_process';

export type ShellCallback = (command: string) => void;
export type InputCallback = (action: string, data: any) => void;
export type ConnectCallback = (peerId: string) => void;

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
  private onConnect: ConnectCallback | null = null;
  private shellOutput: string = '';
  private myId: string = '';
  private captureWidth: number = 1920;
  private captureHeight: number = 1080;

  constructor(port: number = 8080) {
    this.port = port;
  }

  setShellCallback(callback: ShellCallback): void {
    this.onShell = callback;
  }

  setInputCallback(callback: InputCallback): void {
    this.onInput = callback;
  }

  setConnectCallback(callback: ConnectCallback): void {
    this.onConnect = callback;
  }

  setMyId(id: string): void {
    this.myId = id;
  }

  setCaptureSize(width: number, height: number): void {
    this.captureWidth = width;
    this.captureHeight = height;
  }

  appendShellOutput(data: string): void {
    this.shellOutput += data;
    if (this.shellOutput.length > 100000) {
      this.shellOutput = this.shellOutput.slice(-100000);
    }
  }

  openBrowser(): void {
    const url = 'http://localhost:' + this.port;
    const platform = process.platform;
    let cmd: string;
    
    if (platform === 'win32') {
      cmd = 'start ' + url;
    } else if (platform === 'darwin') {
      cmd = 'open ' + url;
    } else {
      cmd = 'xdg-open ' + url;
    }
    
    exec(cmd, (err) => {
      if (err) {
        console.log('Open browser manually: ' + url);
      }
    });
  }

  start(): void {
    this.startTime = Date.now();
    this.lastFpsUpdate = Date.now();
    
    this.server = http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getHtml());
      } else if (req.url === '/api/id') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ id: this.myId, width: this.captureWidth, height: this.captureHeight }));
      } else if (req.url === '/api/connect' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          try {
            const { peerId } = JSON.parse(body);
            if (this.onConnect && peerId) {
              this.onConnect(peerId);
            }
          } catch (e) {}
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        });
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
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f0f0f; color: #fff; height: 100vh; overflow: hidden; }
    .app { display: flex; flex-direction: column; height: 100vh; }
    
    /* 连接页面 */
    .connect-page {
      display: flex; align-items: center; justify-content: center;
      height: 100vh; background: linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%);
    }
    .connect-card {
      background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px;
      padding: 40px; width: 400px; text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .connect-logo {
      width: 60px; height: 60px; margin: 0 auto 20px;
      background: linear-gradient(135deg, #4f9cf7, #8b5cf6);
      border-radius: 16px; display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    .connect-title { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .connect-subtitle { font-size: 14px; color: #888; margin-bottom: 32px; }
    .my-id-section { margin-bottom: 32px; }
    .my-id-label { font-size: 12px; color: #666; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .my-id-value {
      font-size: 32px; font-weight: 700; font-family: monospace; color: #4f9cf7;
      letter-spacing: 4px; padding: 16px; background: #0f0f0f; border-radius: 12px;
      border: 1px solid #2a2a2a;
    }
    .connect-input-section { margin-bottom: 24px; }
    .connect-input-label { font-size: 12px; color: #666; margin-bottom: 8px; text-align: left; }
    .connect-input-row { display: flex; gap: 8px; }
    #connect-id {
      flex: 1; padding: 14px 16px; background: #0f0f0f; border: 1px solid #2a2a2a;
      border-radius: 10px; color: #fff; font-size: 18px; font-family: monospace;
      letter-spacing: 2px; outline: none;
    }
    #connect-id:focus { border-color: #4f9cf7; }
    #connect-id::placeholder { color: #444; letter-spacing: 1px; }
    .btn-connect {
      padding: 14px 24px; background: linear-gradient(135deg, #4f9cf7, #8b5cf6);
      border: none; border-radius: 10px; color: #fff; font-size: 16px; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
    }
    .btn-connect:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(79, 156, 247, 0.3); }
    .btn-connect:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .connect-hint { font-size: 12px; color: #555; margin-top: 16px; }
    
    /* 远程桌面页面 */
    .remote-page { display: none; flex-direction: column; height: 100vh; }
    .remote-page.active { display: flex; }
    .connect-page.hidden { display: none; }
    
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px; background: #1a1a1a; border-bottom: 1px solid #2a2a2a;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .btn-back { background: transparent; border: none; color: #888; cursor: pointer; font-size: 18px; padding: 4px 8px; }
    .btn-back:hover { color: #fff; }
    .peer-info { font-size: 13px; color: #888; }
    .peer-info span { color: #4f9cf7; font-family: monospace; }
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
    #screen { display: block; max-width: 100%; max-height: calc(100vh - 100px); object-fit: contain; background: #000; }
    #overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: crosshair; }
    .screen-badge { position: absolute; top: 10px; left: 10px; padding: 4px 10px; background: rgba(0,0,0,0.6); border-radius: 20px; font-size: 11px; display: flex; align-items: center; gap: 6px; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; }
    .sidebar { width: 320px; background: #1a1a1a; border-left: 1px solid #2a2a2a; display: flex; flex-direction: column; }
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
    .coord-display { font-family: monospace; color: #4f9cf7; }
  </style>
</head>
<body>
  <!-- 连接页面 -->
  <div class="connect-page" id="connectPage">
    <div class="connect-card">
      <div class="connect-logo">🖥</div>
      <div class="connect-title">xdesk</div>
      <div class="connect-subtitle">Remote Desktop</div>
      
      <div class="my-id-section">
        <div class="my-id-label">Your ID</div>
        <div class="my-id-value" id="myId">Loading...</div>
      </div>
      
      <div class="connect-input-section">
        <div class="connect-input-label">Remote ID</div>
        <div class="connect-input-row">
          <input type="text" id="connect-id" placeholder="123-456-789" maxlength="11" autocomplete="off">
          <button class="btn-connect" id="btnConnect" onclick="doConnect()">Connect</button>
        </div>
      </div>
      
      <div class="connect-hint">Enter 9-digit ID to connect</div>
    </div>
  </div>

  <!-- 远程桌面页面 -->
  <div class="remote-page" id="remotePage">
    <header class="header">
      <div class="header-left">
        <button class="btn-back" onclick="disconnect()">←</button>
        <div class="peer-info">Connected to: <span id="peerId">-</span></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-dot"></div><span>FPS</span><span class="stat-value" id="fps">0</span></div>
        <div class="stat"><span>延迟</span><span class="stat-value" id="latency">0ms</span></div>
        <div class="stat"><span>分辨率</span><span class="stat-value" id="resolution">-</span></div>
        <div class="stat"><span>坐标</span><span class="stat-value coord-display" id="coords">0,0</span></div>
      </div>
      <div class="btns">
        <button class="btn btn-ghost" onclick="toggleSidebar()">Terminal</button>
        <button class="btn btn-ghost" onclick="toggleFullscreen()">Fullscreen</button>
      </div>
    </header>
    <main class="main">
      <div class="screen-container">
        <div class="screen-frame">
          <img id="screen" src="" alt="Waiting...">
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
    var coordsEl = document.getElementById('coords');
    var outEl = document.getElementById('output');
    var cmdEl = document.getElementById('cmd');
    var statusEl = document.getElementById('status-badge');
    var connEl = document.getElementById('conn-status');
    var bwEl = document.getElementById('bandwidth');
    var upEl = document.getElementById('uptime');
    var sidebar = document.getElementById('sidebar');
    var connectPage = document.getElementById('connectPage');
    var remotePage = document.getElementById('remotePage');
    var myIdEl = document.getElementById('myId');
    var peerIdEl = document.getElementById('peerId');
    var connectIdEl = document.getElementById('connect-id');
    var frames = 0, lastSec = Date.now(), lastFrame = Date.now();
    var lastOut = '', startTime = Date.now(), lastBw = Date.now(), bytes = 0;
    var remoteWidth = 1920, remoteHeight = 1080;

    // 获取我的 ID 和分辨率
    fetch('/api/id').then(function(r) { return r.json(); }).then(function(d) {
      myIdEl.textContent = formatId(d.id);
      if (d.width && d.height) {
        remoteWidth = d.width;
        remoteHeight = d.height;
        console.log('Capture resolution: ' + remoteWidth + 'x' + remoteHeight);
      }
    });

    // 格式化 ID
    function formatId(id) {
      if (id && id.length >= 9) {
        return id.substring(0,3) + '-' + id.substring(3,6) + '-' + id.substring(6,9);
      }
      return id || '...';
    }

    // 连接
    function doConnect() {
      var id = connectIdEl.value.replace(/[^0-9]/g, '');
      if (id.length < 9) {
        alert('Please enter 9-digit ID');
        return;
      }
      
      fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: id })
      });
      
      peerIdEl.textContent = formatId(id);
      connectPage.classList.add('hidden');
      remotePage.classList.add('active');
    }

    // 断开连接
    function disconnect() {
      connectPage.classList.remove('hidden');
      remotePage.classList.remove('active');
    }

    // Enter 键连接
    connectIdEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doConnect();
    });

    // 自动格式化输入
    connectIdEl.addEventListener('input', function(e) {
      var v = this.value.replace(/[^0-9]/g, '');
      if (v.length > 9) v = v.substring(0, 9);
      if (v.length > 6) v = v.substring(0,3) + '-' + v.substring(3,6) + '-' + v.substring(6);
      else if (v.length > 3) v = v.substring(0,3) + '-' + v.substring(3);
      this.value = v;
    });

    img.onload = function() {
      // 使用实际捕获分辨率，而不是图像尺寸
      // remoteWidth 和 remoteHeight 已经在 setCaptureSize 中设置
      resEl.textContent = remoteWidth + 'x' + remoteHeight;
    };

    function getCoords(e) {
      var rect = overlay.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var mouseY = e.clientY - rect.top;
      var overlayW = rect.width;
      var overlayH = rect.height;
      
      // 图像在 overlay 中的实际显示尺寸和偏移
      var imgAspect = remoteWidth / remoteHeight;
      var overlayAspect = overlayW / overlayH;
      var displayW, displayH, offsetX, offsetY;
      
      if (imgAspect > overlayAspect) {
        displayW = overlayW;
        displayH = overlayW / imgAspect;
        offsetX = 0;
        offsetY = (overlayH - displayH) / 2;
      } else {
        displayH = overlayH;
        displayW = overlayH * imgAspect;
        offsetX = (overlayW - displayW) / 2;
        offsetY = 0;
      }
      
      // 鼠标相对于图像的位置 (0 到 1)
      var relX = (mouseX - offsetX) / displayW;
      var relY = (mouseY - offsetY) / displayH;
      
      // 限制在 0-1 范围
      relX = Math.max(0, Math.min(1, relX));
      relY = Math.max(0, Math.min(1, relY));
      
      // 映射到远程屏幕坐标
      var x = Math.round(relX * remoteWidth);
      var y = Math.round(relY * remoteHeight);
      
      // 调试日志（每10次输出一次）
      if (Math.random() < 0.1) {
        console.log('Mouse:', mouseX.toFixed(0), mouseY.toFixed(0),
                    'Display:', displayW.toFixed(0), displayH.toFixed(0),
                    'Offset:', offsetX.toFixed(0), offsetY.toFixed(0),
                    'Rel:', relX.toFixed(3), relY.toFixed(3),
                    'Remote:', x, y);
      }
      
      coordsEl.textContent = x + ',' + y;
      return { x: x, y: y };
    }

    function sendInput(d) {
      fetch('/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    }

    overlay.addEventListener('mousemove', function(e) { var p = getCoords(e); sendInput({ action: 'mousemove', x: p.x, y: p.y }); });
    overlay.addEventListener('mousedown', function(e) { e.preventDefault(); var p = getCoords(e); sendInput({ action: 'mouseclick', x: p.x, y: p.y, button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle' }); });
    overlay.addEventListener('wheel', function(e) { e.preventDefault(); sendInput({ action: 'mousescroll', x: 0, y: 0, direction: e.deltaY < 0 ? 'up' : 'down' }); });
    overlay.addEventListener('contextmenu', function(e) { e.preventDefault(); });

    document.addEventListener('keydown', function(e) {
      if (e.target === cmdEl || e.target === connectIdEl) return;
      e.preventDefault();
      sendInput({ action: 'keypress', key: e.key });
    });

    cmdEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var c = cmdEl.value.trim();
        if (c) {
          outEl.textContent += '$ ' + c + '\\n';
          outEl.scrollTop = outEl.scrollHeight;
          fetch('/shell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: c }) });
          cmdEl.value = '';
        }
      }
      e.stopPropagation();
    });

    setInterval(function() {
      fetch('/shell-output').then(function(r) { return r.text(); }).then(function(t) {
        if (t !== lastOut) { outEl.textContent = t; outEl.scrollTop = outEl.scrollHeight; lastOut = t; }
      }).catch(function() {});
    }, 300);

    var pendingFrame = null;
    function renderFrame() {
      if (pendingFrame) {
        var now = Date.now();
        latEl.textContent = Math.min(now - lastFrame, 999) + 'ms';
        lastFrame = now;
        img.src = 'data:image/jpeg;base64,' + pendingFrame;
        bytes += pendingFrame.length;
        frames++;
        if (now - lastSec >= 1000) { fpsEl.textContent = frames; frames = 0; lastSec = now; }
        pendingFrame = null;
      }
      requestAnimationFrame(renderFrame);
    }
    requestAnimationFrame(renderFrame);

    function connect() {
      var es = new EventSource('/stream');
      es.onopen = function() { statusEl.textContent = 'Connected'; connEl.textContent = 'Connected'; };
      es.onmessage = function(e) { pendingFrame = e.data; };
      es.onerror = function() { statusEl.textContent = 'Reconnecting...'; es.close(); setTimeout(connect, 2000); };
    }
    connect();

    function updateStats() {
      var now = Date.now();
      var el = Math.floor((now - startTime) / 1000);
      upEl.textContent = String(Math.floor(el/3600)).padStart(2,'0') + ':' + String(Math.floor((el%3600)/60)).padStart(2,'0') + ':' + String(el%60).padStart(2,'0');
      var be = (now - lastBw) / 1000;
      if (be >= 1) { bwEl.textContent = Math.round(bytes/be/1024) + ' KB/s'; bytes = 0; lastBw = now; }
    }
    setInterval(updateStats, 1000);

    function toggleSidebar() { sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none'; }
    function toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
  </script>
</body>
</html>`;
  }
}
