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
        if (this.currentFrame) res.write(`data: ${this.currentFrame}\n\n`);
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
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>xdesk - Remote Desktop</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0f0f0f;
      --bg-secondary: #1a1a1a;
      --bg-tertiary: #242424;
      --bg-hover: #2a2a2a;
      --text-primary: #ffffff;
      --text-secondary: #a0a0a0;
      --text-muted: #666666;
      --accent: #4f9cf7;
      --accent-hover: #3b82f6;
      --accent-glow: rgba(79, 156, 247, 0.2);
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
      --border: #2a2a2a;
      --shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
      --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.6);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      overflow: hidden;
    }

    .app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(20px);
      z-index: 100;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .logo-icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, var(--accent), #8b5cf6);
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }

    .logo-text {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }

    .logo-badge {
      font-size: 10px;
      padding: 2px 8px;
      background: var(--accent);
      color: white;
      border-radius: 20px;
      font-weight: 500;
    }

    .header-center {
      display: flex;
      align-items: center;
      gap: 24px;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .stat-value {
      font-weight: 600;
      color: var(--success);
      font-family: 'JetBrains Mono', monospace;
    }

    .stat-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: 'Inter', sans-serif;
    }

    .btn-primary {
      background: var(--accent);
      color: white;
    }

    .btn-primary:hover {
      background: var(--accent-hover);
      box-shadow: 0 0 20px var(--accent-glow);
    }

    .btn-ghost {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }

    .btn-ghost:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .btn-icon {
      width: 36px;
      height: 36px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Main Content */
    .main {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* Screen View */
    .screen-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--bg-primary);
    }

    .screen-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    .screen-frame {
      position: relative;
      max-width: 100%;
      max-height: 100%;
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-lg);
    }

    #screen {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 120px);
      object-fit: contain;
    }

    #overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      cursor: crosshair;
    }

    .screen-overlay {
      position: absolute;
      top: 12px;
      left: 12px;
      display: flex;
      gap: 8px;
    }

    .screen-badge {
      padding: 4px 12px;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      font-size: 11px;
      font-weight: 500;
      color: white;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .screen-badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--success);
    }

    /* Sidebar */
    .sidebar {
      width: 380px;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      transition: var(--transition);
    }

    .sidebar.collapsed {
      width: 0;
      overflow: hidden;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }

    .sidebar-title {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sidebar-tabs {
      display: flex;
      gap: 4px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
    }

    .sidebar-tab {
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      color: var(--text-secondary);
      background: transparent;
      border: none;
    }

    .sidebar-tab:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .sidebar-tab.active {
      background: var(--accent);
      color: white;
    }

    .sidebar-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Terminal */
    .terminal {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--bg-primary);
      margin: 12px;
      border-radius: var(--radius-md);
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .terminal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border);
    }

    .terminal-dots {
      display: flex;
      gap: 6px;
    }

    .terminal-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .terminal-dot.red { background: #ff5f57; }
    .terminal-dot.yellow { background: #febc2e; }
    .terminal-dot.green { background: #28c840; }

    .terminal-title {
      font-size: 12px;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }

    .terminal-output {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-all;
    }

    .terminal-output::-webkit-scrollbar {
      width: 6px;
    }

    .terminal-output::-webkit-scrollbar-track {
      background: transparent;
    }

    .terminal-output::-webkit-scrollbar-thumb {
      background: var(--bg-hover);
      border-radius: 3px;
    }

    .terminal-input {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border-top: 1px solid var(--border);
      gap: 12px;
    }

    .terminal-prompt {
      color: var(--accent);
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
    }

    #cmd {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      outline: none;
    }

    #cmd::placeholder {
      color: var(--text-muted);
    }

    /* Status Bar */
    .status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 20px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-muted);
    }

    .status-left, .status-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-icon {
      font-size: 14px;
    }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .fade-in {
      animation: fadeIn 0.3s ease-out;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .sidebar {
        width: 320px;
      }
    }

    @media (max-width: 768px) {
      .sidebar {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: 100%;
        max-width: 400px;
        z-index: 200;
        transform: translateX(100%);
        transition: transform 0.3s ease;
      }

      .sidebar.open {
        transform: translateX(0);
      }

      .header-center {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <div class="logo-icon">🖥</div>
          <span class="logo-text">xdesk</span>
          <span class="logo-badge">Remote</span>
        </div>
      </div>

      <div class="header-center">
        <div class="stat">
          <div class="stat-dot"></div>
          <span>FPS</span>
          <span class="stat-value" id="fps">0</span>
        </div>
        <div class="stat">
          <span>延迟</span>
          <span class="stat-value" id="latency">0ms</span>
        </div>
        <div class="stat">
          <span>分辨率</span>
          <span class="stat-value" id="resolution">-</span>
        </div>
      </div>

      <div class="header-right">
        <button class="btn btn-ghost btn-icon" onclick="toggleSidebar()" title="Toggle Terminal">
          ⌨️
        </button>
        <button class="btn btn-ghost btn-icon" onclick="toggleFullscreen()" title="Fullscreen">
          ⛶
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main">
      <!-- Screen View -->
      <div class="screen-container">
        <div class="screen-wrapper">
          <div class="screen-frame">
            <img id="screen" src="" alt="Waiting for connection...">
            <div id="overlay"></div>
            <div class="screen-overlay">
              <div class="screen-badge">
                <div class="screen-badge-dot"></div>
                <span id="status-badge">Connected</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title">
            💻 控制台
          </div>
          <button class="btn btn-ghost btn-icon" onclick="toggleSidebar()">✕</button>
        </div>

        <div class="sidebar-tabs">
          <button class="sidebar-tab active" onclick="switchTab('terminal')">终端</button>
          <button class="sidebar-tab" onclick="switchTab('settings')">设置</button>
        </div>

        <div class="sidebar-content">
          <!-- Terminal Tab -->
          <div id="tab-terminal" class="terminal">
            <div class="terminal-header">
              <div class="terminal-dots">
                <div class="terminal-dot red"></div>
                <div class="terminal-dot yellow"></div>
                <div class="terminal-dot green"></div>
              </div>
              <div class="terminal-title">bash</div>
            </div>
            <div class="terminal-output" id="output"></div>
            <div class="terminal-input">
              <span class="terminal-prompt">$</span>
              <input type="text" id="cmd" placeholder="输入命令..." autocomplete="off" spellcheck="false">
            </div>
          </div>

          <!-- Settings Tab -->
          <div id="tab-settings" style="display: none; padding: 20px;">
            <div style="color: var(--text-secondary); font-size: 14px;">
              <p style="margin-bottom: 16px;">设置功能开发中...</p>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Status Bar -->
    <footer class="status-bar">
      <div class="status-left">
        <div class="status-item">
          <span class="status-icon">●</span>
          <span id="connection-status">已连接</span>
        </div>
        <div class="status-item">
          <span class="status-icon">📊</span>
          <span id="bandwidth">0 KB/s</span>
        </div>
      </div>
      <div class="status-right">
        <div class="status-item">
          <span class="status-icon">⏱</span>
          <span id="uptime">00:00:00</span>
        </div>
        <div class="status-item">
          <span>© 2024 xdesk</span>
        </div>
      </div>
    </footer>
  </div>

  <script>
    // Elements
    const img = document.getElementById('screen');
    const overlay = document.getElementById('overlay');
    const fpsEl = document.getElementById('fps');
    const latencyEl = document.getElementById('latency');
    const resolutionEl = document.getElementById('resolution');
    const outputEl = document.getElementById('output');
    const cmdInput = document.getElementById('cmd');
    const statusBadge = document.getElementById('status-badge');
    const connectionStatus = document.getElementById('connection-status');
    const bandwidthEl = document.getElementById('bandwidth');
    const uptimeEl = document.getElementById('uptime');
    const sidebar = document.getElementById('sidebar');

    // State
    let frames = 0;
    let lastSec = Date.now();
    let lastFrame = Date.now();
    let lastOutput = '';
    let startTime = Date.now();
    let lastBandwidthCalc = Date.now();
    let bytesReceived = 0;

    // Input functions
    function sendInput(data) {
      fetch('/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }

    function getCoords(e) {
      const rect = overlay.getBoundingClientRect();
      const iw = img.naturalWidth || 1920;
      const ih = img.naturalHeight || 1080;
      const x = Math.round((e.clientX - rect.left) / rect.width * iw);
      const y = Math.round((e.clientY - rect.top) / rect.height * ih);
      return { x: Math.max(0, Math.min(iw, x)), y: Math.max(0, Math.min(ih, y)) };
    }

    // Mouse events
    overlay.addEventListener('mousemove', (e) => {
      const { x, y } = getCoords(e);
      sendInput({ action: 'mousemove', x, y });
    });

    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const { x, y } = getCoords(e);
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      sendInput({ action: 'mouseclick', x, y, button });
    });

    overlay.addEventListener('wheel', (e) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 'up' : 'down';
      sendInput({ action: 'mousescroll', x: 0, y: 0, direction });
    });

    overlay.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      if (e.target === cmdInput) return;
      e.preventDefault();
      sendInput({ action: 'keypress', key: e.key });
    });

    // Terminal input
    cmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = cmdInput.value.trim();
        if (cmd) {
          outputEl.textContent += '$ ' + cmd + '\n';
          outputEl.scrollTop = outputEl.scrollHeight;
          fetch('/shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd })
          });
          cmdInput.value = '';
        }
      }
      e.stopPropagation();
    });

    // Poll shell output
    setInterval(() => {
      fetch('/shell-output')
        .then(r => r.text())
        .then(t => {
          if (t !== lastOutput) {
            outputEl.textContent = t;
            outputEl.scrollTop = outputEl.scrollHeight;
            lastOutput = t;
          }
        })
        .catch(() => {});
    }, 300);

    // Update stats
    function updateStats() {
      const now = Date.now();
      
      // Uptime
      const elapsed = Math.floor((now - startTime) / 1000);
      const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
      const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
      const seconds = (elapsed % 60).toString().padStart(2, '0');
      uptimeEl.textContent = \`\${hours}:\${minutes}:\${seconds}\`;

      // Bandwidth
      const bwElapsed = (now - lastBandwidthCalc) / 1000;
      if (bwElapsed >= 1) {
        const bw = Math.round(bytesReceived / bwElapsed / 1024);
        bandwidthEl.textContent = \`\${bw} KB/s\`;
        bytesReceived = 0;
        lastBandwidthCalc = now;
      }
    }

    setInterval(updateStats, 1000);

    // UI functions
    function toggleSidebar() {
      sidebar.classList.toggle('collapsed');
      sidebar.classList.toggle('open');
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }

    function switchTab(tab) {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelector(\`[onclick="switchTab('\${tab}')"]\`).classList.add('active');
      
      document.getElementById('tab-terminal').style.display = tab === 'terminal' ? 'flex' : 'none';
      document.getElementById('tab-settings').style.display = tab === 'settings' ? 'block' : 'none';
    }

    // SSE connection
    function connect() {
      const es = new EventSource('/stream');
      
      es.onopen = () => {
        statusBadge.textContent = 'Connected';
        connectionStatus.textContent = '已连接';
        document.querySelector('.screen-badge-dot').style.background = 'var(--success)';
      };

      es.onmessage = (e) => {
        const now = Date.now();
        latencyEl.textContent = \`\${Math.min(now - lastFrame, 999)}ms\`;
        lastFrame = now;
        
        img.src = 'data:image/jpeg;base64,' + e.data;
        bytesReceived += e.data.length;
        
        frames++;
        if (now - lastSec >= 1000) {
          fpsEl.textContent = frames;
          frames = 0;
          lastSec = now;
        }

        // Update resolution
        if (img.naturalWidth && img.naturalHeight) {
          resolutionEl.textContent = \`\${img.naturalWidth}×\${img.naturalHeight}\`;
        }
      };

      es.onerror = () => {
        statusBadge.textContent = 'Reconnecting...';
        connectionStatus.textContent = '重连中...';
        document.querySelector('.screen-badge-dot').style.background = 'var(--warning)';
        es.close();
        setTimeout(connect, 2000);
      };
    }

    // Auto-fit screen
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        resolutionEl.textContent = \`\${img.naturalWidth}×\${img.naturalHeight}\`;
      }
    };

    // Start
    connect();
  </script>
</body>
</html>`;
  }
}
