import * as readline from 'readline';
import { SignalClient } from './client';
import { SignalMessage } from './message';
import { ScreenCapture } from './capture';
import { ScreenViewer } from './viewer';
import { executeCommand } from './shell';

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
  
  try {
    await client.connect();
  } catch (e) {
    console.log('Failed to connect');
    rl.close();
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  const clientId = client.getClientId();
  if (clientId) {
    console.log('');
    console.log('========================================');
    console.log(`  Agent ID: ${clientId}`);
    console.log('========================================');
    console.log('');
  }

  let frameCount = 0;
  let lastFpsTime = Date.now();
  let currentFps = 0;

  client.onMessage((msg: SignalMessage) => {
    switch (msg.type) {
      case 'screen-request':
        const target = msg.id;
        if (target) {
          console.log(`[SCREEN] Request from ${target}`);
          capture.setFps(msg.data?.fps || 20);
          capture.startCapture((frame) => {
            client.send({ type: 'screen', to: target, data: { frame, timestamp: Date.now() } });
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
        
      case 'shell':
        if (msg.data?.command) {
          const senderId = msg.id;
          console.log(`[SHELL] ${msg.data.command}`);
          executeCommand(msg.data.command).then(output => {
            if (senderId) {
              client.send({ type: 'shell-output', to: senderId, data: { output } });
            }
          });
        }
        break;
    }
  });

  console.log('Commands:');
  console.log('  stream  - Start screen sharing');
  console.log('  stop    - Stop sharing');
  console.log('  quit    - Exit');
  console.log('');

  while (true) {
    const inputCmd = await prompt('agent');
    if (inputCmd.trim() === 'quit' || inputCmd.trim() === 'exit') break;
    
    if (inputCmd.trim() === 'stream') {
      console.log('Starting screen stream...');
      capture.startCapture((frame) => {
        client.getPeers().forEach(peer => {
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
    } else if (inputCmd.trim() === 'stop') {
      capture.stopCapture();
      console.log('');
    }
  }

  capture.stopCapture();
  client.disconnect();
  rl.close();
}

async function runController(proxyUrl?: string): Promise<void> {
  const client = new SignalClient(SIGNAL_URL, proxyUrl);
  const viewer = new ScreenViewer(8080);
  let viewerStarted = false;
  
  try {
    await client.connect();
  } catch (e) {
    console.log('Failed to connect');
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

  viewer.setShellCallback((command) => {
    if (!targetPeer) {
      viewer.appendShellOutput('Error: No target connected\n');
      return;
    }
    console.log(`[SHELL] ${command}`);
    client.send({ type: 'shell', to: targetPeer, data: { command } });
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
    if (msg.type === 'shell-output' && msg.data?.output) {
      viewer.appendShellOutput(msg.data.output);
    }
  });

  console.log('Commands:');
  console.log('  connect <id>  - Connect to agent');
  console.log('  view          - Start viewing');
  console.log('  quit          - Exit');
  console.log('');

  while (true) {
    const input = await prompt('ctrl');
    const parts = input.trim().split(/\s+/);
    if (parts[0] === 'quit' || parts[0] === 'exit') break;
    
    switch (parts[0]) {
      case 'connect':
        if (parts.length < 2) console.log('Usage: connect <agent-id>');
        else { targetPeer = parts[1]; console.log(`Target: ${targetPeer}`); }
        break;
      case 'view':
        if (!targetPeer) console.log('No target. Use: connect <id>');
        else { console.log('Requesting screen...'); client.send({ type: 'screen-request', to: targetPeer, data: { fps: 20 } }); }
        break;
      default:
        if (input.trim()) console.log('Unknown command');
    }
  }

  if (viewerStarted) viewer.stop();
  client.disconnect();
  rl.close();
}

console.log('=== xdesk Remote Desktop Client ===');
console.log('');

const mode = process.argv[2];
const proxy = process.argv[3];

if (mode === 'agent') runAgent(proxy).catch(console.error);
else if (mode === 'controller') runController(proxy).catch(console.error);
else {
  console.log('Usage:');
  console.log('  npm run agent       - Start as agent');
  console.log('  npm run controller  - Start as controller');
  rl.close();
}
