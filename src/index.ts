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
  const capture = new ScreenCapture(30, 60, 0.5);
  
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
  let targetPeer: string | null = null;

  client.onMessage((msg: SignalMessage) => {
    switch (msg.type) {
      case 'screen-request':
        targetPeer = msg.id || null;
        if (targetPeer) {
          console.log(`[SCREEN] Request from ${targetPeer}`);
          capture.setFps(msg.data?.fps || 30);
          
          capture.startCapture((frame, isKeyframe) => {
            // Send frame as binary with header
            const header = Buffer.alloc(5);
            header.writeUInt8(isKeyframe ? 1 : 0, 0);  // 1 = keyframe, 0 = diff
            header.writeUInt32BE(frame.length, 1);
            
            const packet = Buffer.concat([header, frame]);
            client.send(packet as any);  // Will be sent as binary
            
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
  console.log('  fps <n> - Set FPS (1-60)');
  console.log('  quit    - Exit');
  console.log('');

  while (true) {
    const inputCmd = await prompt('agent');
    const parts = inputCmd.trim().split(/\s+/);
    if (parts[0] === 'quit' || parts[0] === 'exit') break;
    
    switch (parts[0]) {
      case 'stream':
        console.log('Starting stream...');
        capture.startCapture((frame, isKeyframe) => {
          if (!targetPeer) return;
          const header = Buffer.alloc(5);
          header.writeUInt8(isKeyframe ? 1 : 0, 0);
          header.writeUInt32BE(frame.length, 1);
          client.send(Buffer.concat([header, frame]) as any);
          
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
        console.log(`FPS: ${capture.getStats().fps}`);
        break;
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
      viewer.appendShellOutput('Error: No target\n');
      return;
    }
    console.log(`[SHELL] ${command}`);
    client.send({ type: 'shell', to: targetPeer, data: { command } });
  });

  // Handle binary frames
  client.onBinary((data: Buffer) => {
    if (data.length < 5) return;
    
    const isKeyframe = data.readUInt8(0) === 1;
    const frameLen = data.readUInt32BE(1);
    const frame = data.slice(5, 5 + frameLen);
    
    if (!viewerStarted) {
      viewer.start();
      viewerStarted = true;
      console.log('Screen viewer: http://localhost:8080');
      console.log('');
    }
    
    viewer.updateFrame(frame.toString('base64'));
    
    frameCount++;
    const now = Date.now();
    if (now - lastFpsTime >= 1000) {
      currentFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
      frameCount = 0;
      lastFpsTime = now;
      process.stdout.write(`\r[FPS: ${currentFps}] `);
    }
  });

  client.onMessage((msg: SignalMessage) => {
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
        else { console.log('Requesting screen...'); client.send({ type: 'screen-request', to: targetPeer, data: { fps: 30 } }); }
        break;
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
