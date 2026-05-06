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
        req.on('close', () => { this.clients.delete(res); });
      } else if (req.url === '/input' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          try {
            const input = JSON.parse(body);
            console.log('[INPUT]', input.type, input.action, input.key || '');
            if (this.onInput) {
              this.onInput(input.type, input);
            }
          } catch (e) { console.error('[INPUT ERROR]', e); }
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
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end(this.shellOutput);
      } else if (req.url === '/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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

  getCurrentFps(): number { return this.currentFps; }

  getStats(): any {
    return { clients: this.clients.size, fps: this.currentFps, uptime: Math.round((Date.now() - this.startTime) / 1000) };
  }

  stop(): void {
    if (this.server) { this.server.close(); this.server = null; }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>xdesk - Remote Screen</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a1a; display: flex; flex-direction: column; height: 100vh; font-family: -apple-system, sans-serif; overflow: hidden; }
    .header { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #222; border-bottom: 1px solid #333; flex-shrink: 0; }
    h1 { color: #fff; font-size: 15px; }
    .stats { display: flex; gap: 10px; align-items: center; }
    .stat { color: #888; font-size: 11px; background: #333; padding: 2px 8px; border-radius: 3px; }
    .stat .value { color: #4CAF50; font-weight: bold; }
    .controls { display: flex; gap: 5px; align-items: center; }
    .btn { background: #444; color: #fff; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; }
    .btn:hover { background: #555; }
    .zoom-controls { display: flex; align-items: center; gap: 3px; }
    .zoom-btn { background: #444; color: #fff; border: none; width: 22px; height: 22px; border-radius: 3px; cursor: pointer; font-size: 13px; }
    .zoom-btn:hover { background: #555; }
    .zoom-value { color: #fff; font-size: 11px; min-width: 35px; text-align: center; }
    .main { flex: 1; display: flex; overflow: hidden; }
    #screen-container { flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; position: relative; }
    #screen-wrapper { position: relative; transform-origin: center center; }
    #screen { display: block; max-width: 100%; max-height: calc(100vh - 40px); user-select: none; }
    #overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: crosshair; }
    .sidebar { width: 350px; background: #1e1e1e; border-left: 1px solid #333; display: flex; flex-direction: column; flex-shrink: 0; }
    .sidebar-header { padding: 8px 12px; background: #252525; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
    .sidebar-header h2 { color: #fff; font-size: 13px; }
    #shell-output { flex: 1; overflow-y: auto; padding: 8px; font-family: monospace; font-size: 12px; color: #d4d4d4; background: #1e1e1e; white-space: pre-wrap; }
    .shell-input { display: flex; padding: 8px; background: #252525; border-top: 1px solid #333; }
    .shell-input span { color: #4CAF50; font-family: monospace; margin-right: 8px; line-height: 28px; }
    #shell-cmd { flex: 1; background: #333; border: 1px solid #444; color: #fff; padding: 4px 8px; border-radius: 3px; font-family: monospace; font-size: 12px; }
    #shell-cmd:focus { outline: none; border-color: #4CAF50; }
    .collapsed .sidebar { width: 0; overflow: hidden; }
    .status { position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%); color: #888; font-size: 11px; background: rgba(0,0,0,0.8); padding: 3px 10px; border-radius: 3px; z-index: 10; }
    .status.connected { color: #4CAF50; }
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
        <span style="cursor:pointer;color:#888" onclick="toggleShell()">×</span>
      </div>
      <div id="shell-output"></div>
      <div class="shell-input">
        <span>$</span>
        <input type="text" id="shell-cmd" placeholder="Enter command..." />
      </div>
    </div>
  </div>
  <div id="status" class="status">Connecting...</div>
  
  <script>
    const img = document.getElementById('screen');
    const overlay = document.getElementById('overlay');
    const statusEl = document.getElementById('status');
    const fpsEl = document.getElementById('fps');
    const latencyEl = document.getElementById('latency');
    const zoomEl = document.getElementById('zoom');
    const wrapper = document.getElementById('screen-wrapper');
    const shellOut = document.getElementById('shell-output');
    const shellIn = document.getElementById('shell-cmd');
    const mainEl = document.getElementById('main');
    
    let frames = 0, lastSec = Date.now(), lastFrame = Date.now(), zoom = 100, shellOn = true;
    
    function toggleShell() { shellOn = !shellOn; mainEl.classList.toggle('collapsed', !shellOn); }
    function zoomIn() { zoom = Math.min(200, zoom + 10); applyZoom(); }
    function zoomOut() { zoom = Math.max(25, zoom - 10); applyZoom(); }
    function zoomFit() {
      const c = document.getElementById('screen-container');
      zoom = Math.round(Math.min((c.clientWidth-10)/(img.naturalWidth||1920), (c.clientHeight-10)/(img.naturalHeight||1080)) * 100);
      applyZoom();
    }
    function applyZoom() { wrapper.style.transform = 'scale('+(zoom/100)+')'; zoomEl.textContent = zoom+'%'; }
    
    function getCoords(e) {
      const r = overlay.getBoundingClientRect();
      return { x: Math.max(0, Math.round((e.clientX-r.left)/r.width*(img.naturalWidth||1920))), y: Math.max(0, Math.round((e.clientY-r.top)/r.height*(img.naturalHeight||1080))) };
    }
    
    function send(data) { fetch('/input', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }).catch(()=>{}); }
    
    function sendShell() {
      const cmd = shellIn.value.trim();
      if (!cmd) return;
      shellOut.textContent += '$ ' + cmd + '\\n';
      shellOut.scrollTop = shellOut.scrollHeight;
      fetch('/shell', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command:cmd}) }).catch(()=>{});
      shellIn.value = '';
    }
    
    shellIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { sendShell(); e.preventDefault(); }
      e.stopPropagation();
    });
    
    setInterval(() => {
      fetch('/shell-output').then(r=>r.text()).then(t => {
        if (t !== shellOut._last) { shellOut.textContent = t; shellOut.scrollTop = shellOut.scrollHeight; shellOut._last = t; }
      }).catch(()=>{});
    }, 500);
    
    overlay.addEventListener('mousemove', (e) => { const p = getCoords(e); send({type:'mouse',action:'move',x:p.x,y:p.y}); });
    overlay.addEventListener('mousedown', (e) => { e.preventDefault(); const p = getCoords(e); send({type:'mouse',action:'click',x:p.x,y:p.y,button:e.button===0?'left':e.button===2?'right':'middle'}); });
    overlay.addEventListener('wheel', (e) => { e.preventDefault(); send({type:'mouse',action:'scroll',direction:e.deltaY<0?'up':'down'}); });
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    
    document.addEventListener('keydown', (e) => {
      if (e.target === shellIn) return;
      e.preventDefault();
      send({type:'key',action:'press',key:e.key});
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key==='='||e.key==='+') { e.preventDefault(); zoomIn(); }
        else if (e.key==='-') { e.preventDefault(); zoomOut(); }
        else if (e.key==='0') { e.preventDefault(); zoomFit(); }
      }
    });
    
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey||e.metaKey) { e.preventDefault(); e.deltaY<0?zoomIn():zoomOut(); }
    }, {passive:false});
    
    function connect() {
      const es = new EventSource('/stream');
      es.onopen = () => { statusEl.textContent='Connected'; statusEl.className='status connected'; };
      es.onmessage = (e) => {
        const now = Date.now();
        latencyEl.textContent = Math.min(now-lastFrame, 999);
        lastFrame = now;
        img.src = 'data:image/jpeg;base64,' + e.data;
        frames++;
        if (now-lastSec>=1000) { fpsEl.textContent=frames; frames=0; lastSec=now; }
      };
      es.onerror = () => { statusEl.textContent='Disconnected...'; statusEl.className='status'; es.close(); setTimeout(connect, 2000); };
    }
    
    img.onload = () => { if (zoom===100) zoomFit(); };
    connect();
  </script>
</body>
</html>`;
  }
}
