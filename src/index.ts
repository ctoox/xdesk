import * as readline from 'readline';
import { SignalClient } from './client';
import { SignalMessage } from './message';
import { ScreenViewer } from './viewer';
import { executeCommand } from './shell';
import { FFmpegCapture } from './ffmpeg-capture';
import { WebRTCPeer } from './webrtc';

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
  const capture = new FFmpegCapture(3440, 1440, 30);
  const webrtc = new WebRTCPeer(client);
  
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
          
          // Try WebRTC first
          webrtc.connect(targetPeer).catch(e => {
            console.log('[WebRTC] Failed, falling back to WebSocket');
          });
          
          capture.start((frame) => {
            if (webrtc.isConnected()) {
              // Send via WebRTC P2P
              webrtc.sendFrame(frame);
            } else {
              // Fallback to WebSocket
              client.send({
                type: 'screen',
                to: targetPeer,
                data: { frame: frame.toString('base64') }
              });
            }
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
        
      case 'offer':
        if (msg.id && msg.data?.sdp) {
          webrtc.handleOffer(msg.data.sdp, msg.id);
        }
        break;
        
      case 'answer':
        if (msg.data?.sdp) {
          webrtc.handleAnswer(msg.data.sdp);
        }
        break;
        
      case 'ice':
        if (msg.data?.candidate) {
          webrtc.handleIceCandidate(msg.data.candidate);
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
      console.log('Starting stream...');
      capture.start((frame) => {
        if (!targetPeer) return;
        if (webrtc.isConnected()) {
          webrtc.sendFrame(frame);
        } else {
          client.send({
            type: 'screen',
            to: targetPeer,
            data: { frame: frame.toString('base64') }
          });
        }
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
      capture.stop();
      webrtc.close();
      console.log('');
    }
  }

  capture.stop();
  webrtc.close();
  client.disconnect();
  rl.close();
}

async function runController(proxyUrl?: string): Promise<void> {
  const client = new SignalClient(SIGNAL_URL, proxyUrl);
  const viewer = new ScreenViewer(8080);
  const webrtc = new WebRTCPeer(client);
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

  // Handle WebRTC frames
  webrtc.onFrame((frame) => {
    if (!viewerStarted) {
      viewer.start();
      viewerStarted = true;
      console.log('Screen viewer: http://localhost:8080');
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
    if (msg.type === 'screen' && msg.data?.frame) {
      // WebSocket fallback
      if (!viewerStarted) {
        viewer.start();
        viewerStarted = true;
        console.log('Screen viewer: http://localhost:8080');
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
    if (msg.type === 'offer' && msg.id && msg.data?.sdp) {
      webrtc.handleOffer(msg.data.sdp, msg.id);
    }
    if (msg.type === 'answer' && msg.data?.sdp) {
      webrtc.handleAnswer(msg.data.sdp);
    }
    if (msg.type === 'ice' && msg.data?.candidate) {
      webrtc.handleIceCandidate(msg.data.candidate);
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
        if (!targetPeer) {
          console.log('No target. Use: connect <id>');
        } else {
          if (!viewerStarted) {
            viewer.start();
            viewerStarted = true;
            console.log('Screen viewer: http://localhost:8080');
          }
          console.log('Requesting screen...');
          client.send({ type: 'screen-request', to: targetPeer, data: { fps: 30 } });
        }
        break;
    }
  }

  if (viewerStarted) viewer.stop();
  webrtc.close();
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
