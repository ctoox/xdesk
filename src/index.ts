import * as readline from 'readline';
import { SignalClient } from './client';
import { SignalMessage } from './message';
import { ScreenCapture } from './capture';
import { InputController } from './input';
import { ScreenViewer } from './viewer';
import { ShellManager, executeCommand } from './shell';

const SIGNAL_URL = 'wss://xdesk.ctoocn.workers.dev/ws?room=test';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(prefix: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(`${prefix}> `, resolve);
  });
}

async function runAgent(proxyUrl?: string): Promise<void> {
  const client = new SignalClient(SIGNAL_URL, proxyUrl);
  const capture = new ScreenCapture(20, 70, 0.75);
  const input = new InputController();
  
  try {
    await client.connect();
  } catch (e) {
    console.log('Failed to connect to signal server');
    rl.close();
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  const clientId = client.getClientId();
  if (clientId) {
    console.log('');
    console.log('========================================');
    console.log(`  Agent ID: ${clientId}`);
    console.log('  Share this ID with controller');
    console.log('========================================');
    console.log('');
  }

  const screenSize = input.getScreenSize();
  console.log(`Screen: ${screenSize.width}x${screenSize.height}`);

  let frameCount = 0;
  let lastFpsTime = Date.now();
  let currentFps = 0;

  client.onMessage((msg: SignalMessage) => {
    switch (msg.type) {
      case 'screen-request':
        const target = msg.id;
        if (target) {
          console.log(`[SCREEN] Request from ${target}`);
          const fps = msg.data?.fps || 20;
          capture.setFps(fps);
          capture.startCapture((frame) => {
            client.send({
              type: 'screen',
              to: target,
              data: { frame, timestamp: Date.now() }
            });
            frameCount++;
            const now = Date.now();
            if (now - lastFpsTime >= 1000) {
              currentFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
              frameCount = 0;
              lastFpsTime = now;
              process.stdout.write(`\r[FPS: ${currentFps}] `);
            }
          });
        }
        break;
        
      case 'mouse':
        if (msg.data) {
          const { action, x, y, button, direction } = msg.data;
          switch (action) {
            case 'move': input.moveMouse(x, y); break;
            case 'click': input.mouseClick(x, y, button || 'left'); break;
            case 'scroll': input.scrollMouse(direction || 'down'); break;
          }
        }
        break;
        
      case 'key':
        if (msg.data) {
          const { action, key, text } = msg.data;
          switch (action) {
            case 'press': input.keyPress(key); break;
            case 'type': input.typeText(text || ''); break;
          }
        }
        break;

      case 'shell':
        if (msg.data?.command) {
          executeCommand(msg.data.command).then(output => {
            client.send({
              type: 'test',
              to: msg.id!,
              data: { message: output }
            });
          });
        }
        break;
    }
  });

  console.log('');
  console.log('Commands:');
  console.log('  peers              - List online peers');
  console.log('  stream             - Start screen sharing');
  console.log('  stop               - Stop sharing');
  console.log('  fps <n>            - Set FPS (1-60)');
  console.log('  quit               - Exit');
  console.log('');

  while (true) {
    const inputCmd = await prompt('agent');
    const parts = inputCmd.trim().split(/\s+/);
    
    if (parts[0] === 'quit' || parts[0] === 'exit') break;
    
    switch (parts[0]) {
      case 'peers':
        const peers = client.getPeers();
        if (peers.length === 0) console.log('No peers online');
        else peers.forEach(p => console.log(`  ${p}`));
        break;
      case 'stream':
        console.log('Starting screen stream...');
        capture.startCapture((frame) => {
          const peers = client.getPeers();
          peers.forEach(peer => {
            client.send({ type: 'screen', to: peer, data: { frame, timestamp: Date.now() } });
          });
          frameCount++;
          const now = Date.now();
          if (now - lastFpsTime >= 1000) {
            currentFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
            frameCount = 0;
            lastFpsTime = now;
            process.stdout.write(`\r[FPS: ${currentFps}] `);
          }
        });
        break;
      case 'stop':
        capture.stopCapture();
        console.log('');
        break;
      case 'fps':
        if (parts[1]) capture.setFps(parseInt(parts[1]));
        else console.log(`Current FPS: ${capture.getStats().fps}`);
        break;
      default:
        if (inputCmd.trim()) console.log('Unknown command');
    }
  }

  capture.stopCapture();
  client.disconnect();
  rl.close();
}

async function runController(proxyUrl?: string): Promise<void> {
  const client = new SignalClient(SIGNAL_URL, proxyUrl);
  const viewer = new ScreenViewer(8080);
  const shell = new ShellManager();
  let viewerStarted = false;
  
  try {
    await client.connect();
  } catch (e) {
    console.log('Failed to connect to signal server');
    rl.close();
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  const clientId = client.getClientId();
  if (clientId) {
    console.log('');
    console.log('========================================');
    console.log(`  Controller ID: ${clientId}`);
    console.log('========================================');
    console.log('');
  }

  let targetPeer: string | null = null;
  let frameCount = 0;
  let lastFpsTime = Date.now();
  let currentFps = 0;

  viewer.setInputCallback((type, data) => {
    if (!targetPeer) return;
    if (type === 'mouse') {
      client.send({ type: 'mouse', to: targetPeer, data });
    } else if (type === 'key') {
      client.send({ type: 'key', to: targetPeer, data });
    }
  });

  viewer.setShellCallback((command) => {
    if (!targetPeer) {
      viewer.appendShellOutput('Error: No target connected\n');
      return;
    }
    client.send({ type: 'shell', to: targetPeer, data: { command } });
  });

  shell.start((data) => {
    viewer.appendShellOutput(data);
  });

  client.onMessage((msg: SignalMessage) => {
    if (msg.type === 'screen' && msg.data?.frame) {
      if (!viewerStarted) {
        viewer.start();
        viewerStarted = true;
        console.log('Screen viewer: http://localhost:8080');
        console.log('');
      }
      
      viewer.updateFrame(msg.data.frame);
      frameCount++;
      
      const now = Date.now();
      if (now - lastFpsTime >= 1000) {
        currentFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
        frameCount = 0;
        lastFpsTime = now;
        process.stdout.write(`\r[FPS: ${currentFps}] `);
      }
    }
  });

  console.log('Commands:');
  console.log('  connect <id>       - Connect to agent');
  console.log('  peers              - List online peers');
  console.log('  view               - Start viewing');
  console.log('  shell              - Toggle shell panel');
  console.log('  quit               - Exit');
  console.log('');

  while (true) {
    const input = await prompt('ctrl');
    const parts = input.trim().split(/\s+/);
    
    if (parts[0] === 'quit' || parts[0] === 'exit') break;
    
    switch (parts[0]) {
      case 'connect':
        if (parts.length < 2) {
          console.log('Usage: connect <agent-id>');
        } else {
          targetPeer = parts[1];
          console.log(`Target: ${targetPeer}`);
        }
        break;
      case 'peers':
        const peers = client.getPeers();
        if (peers.length === 0) console.log('No peers online');
        else peers.forEach(p => console.log(`  ${p}`));
        break;
      case 'view':
        if (!targetPeer) {
          console.log('No target. Use: connect <id>');
        } else {
          console.log(`Requesting screen...`);
          client.send({ type: 'screen-request', to: targetPeer, data: { fps: 20 } });
        }
        break;
      case 'shell':
        console.log('Shell: Use the web UI shell panel');
        break;
      case 'test':
        if (!targetPeer) {
          console.log('No target. Use: connect <id>');
        } else {
          client.sendTest(targetPeer, parts.length > 1 ? parts.slice(1).join(' ') : 'hello');
        }
        break;
      default:
        if (input.trim()) console.log('Unknown command');
    }
  }

  shell.stop();
  if (viewerStarted) viewer.stop();
  client.disconnect();
  rl.close();
}

console.log('=== xdesk Remote Desktop Client ===');
console.log('');

const mode = process.argv[2];
const proxy = process.argv[3];

if (mode === 'agent') {
  runAgent(proxy).catch(console.error);
} else if (mode === 'controller') {
  runController(proxy).catch(console.error);
} else {
  console.log('Usage:');
  console.log('  npm run agent       - Start as agent');
  console.log('  npm run controller  - Start as controller');
  rl.close();
}
