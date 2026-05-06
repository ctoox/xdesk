import * as readline from 'readline';
import { SignalClient } from './client';
import { SignalMessage } from './message';
import { ScreenCapture } from './capture';
import { InputController } from './input';

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
          });
        }
        break;
        
      case 'mouse':
        if (msg.data) {
          const { action, x, y, button, direction } = msg.data;
          switch (action) {
            case 'move':
              input.moveMouse(x, y);
              break;
            case 'click':
              input.mouseClick(x, y, button || 'left');
              break;
            case 'down':
              input.mouseDown(button || 'left');
              break;
            case 'up':
              input.mouseUp(button || 'left');
              break;
            case 'drag':
              input.mouseDrag(x, y);
              break;
            case 'scroll':
              const scrollX = x || screenSize.width / 2;
              const scrollY = y || screenSize.height / 2;
              input.scrollMouse(scrollX, scrollY, direction || 'down');
              break;
          }
        }
        break;
        
      case 'key':
        if (msg.data) {
          const { action, key, code, modifiers, text } = msg.data;
          switch (action) {
            case 'press':
              input.keyPress(key);
              break;
            case 'down':
              input.keyDown(key);
              break;
            case 'up':
              input.keyUp(key);
              break;
            case 'combo':
              input.keyPress(key, modifiers || []);
              break;
            case 'type':
              input.typeText(text || '');
              break;
          }
        }
        break;
    }
  });

  console.log('');
  console.log('Commands:');
  console.log('  peers              - List online peers');
  console.log('  send <id> <msg>    - Send message');
  console.log('  capture            - Test screenshot');
  console.log('  stream             - Start screen sharing');
  console.log('  stop               - Stop sharing');
  console.log('  fps <n>            - Set FPS (1-60)');
  console.log('  quality <n>        - Set quality (1-100)');
  console.log('  scale <n>          - Set scale (0.1-1.0)');
  console.log('  quit               - Exit');
  console.log('');

  while (true) {
    const input = await prompt('agent');
    const parts = input.trim().split(/\s+/);
    
    if (parts[0] === 'quit' || parts[0] === 'exit') break;
    
    switch (parts[0]) {
      case 'peers':
        const peers = client.getPeers();
        if (peers.length === 0) {
          console.log('No peers online');
        } else {
          peers.forEach(p => console.log(`  ${p}`));
        }
        break;
      case 'send':
        if (parts.length < 3) {
          console.log('Usage: send <id> <message>');
        } else {
          client.sendTest(parts[1], parts.slice(2).join(' '));
          console.log(`Sent to ${parts[1]}`);
        }
        break;
      case 'capture':
        try {
          console.log('Capturing screen...');
          const frame = await capture.captureOnce();
          console.log(`Captured! Size: ${Math.round(frame.length / 1024)} KB`);
        } catch (e) {
          console.error('Capture failed:', e);
        }
        break;
      case 'stream':
        console.log('Starting screen stream...');
        capture.startCapture((frame) => {
          const peers = client.getPeers();
          peers.forEach(peer => {
            client.send({
              type: 'screen',
              to: peer,
              data: { frame, timestamp: Date.now() }
            });
          });
        });
        break;
      case 'stop':
        capture.stopCapture();
        break;
      case 'fps':
        if (parts[1]) capture.setFps(parseInt(parts[1]));
        else console.log(`Current FPS: ${capture.getStats().fps}`);
        break;
      case 'quality':
        if (parts[1]) capture.setQuality(parseInt(parts[1]));
        else console.log(`Current quality: ${capture.getStats().quality}%`);
        break;
      case 'scale':
        if (parts[1]) capture.setScale(parseFloat(parts[1]));
        else console.log(`Current scale: ${capture.getStats().scale}`);
        break;
      default:
        if (input.trim()) console.log('Unknown command');
    }
  }

  capture.stopCapture();
  client.disconnect();
  rl.close();
}

async function runController(proxyUrl?: string): Promise<void> {
  const client = new SignalClient(SIGNAL_URL, proxyUrl);
  
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
  let viewerStarted = false;

  client.onMessage((msg: SignalMessage) => {
    if (msg.type === 'screen' && msg.data?.frame) {
      if (!viewerStarted) {
        // Start viewer on first frame
        console.log('Starting screen viewer...');
        console.log('Open http://localhost:8080 in your browser');
        viewerStarted = true;
      }
    }
  });

  console.log('Commands:');
  console.log('  connect <id>       - Connect to agent');
  console.log('  peers              - List online peers');
  console.log('  view               - Start viewing remote screen');
  console.log('  mouse <x> <y>      - Move mouse');
  console.log('  click <x> <y>      - Click at position');
  console.log('  key <key>          - Press key');
  console.log('  type <text>        - Type text');
  console.log('  test <message>     - Send test message');
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
          console.log(`Target set to: ${targetPeer}`);
        }
        break;
      case 'peers':
        const peers = client.getPeers();
        if (peers.length === 0) {
          console.log('No peers online');
        } else {
          peers.forEach(p => console.log(`  ${p}`));
        }
        break;
      case 'view':
        if (!targetPeer) {
          console.log('No target. Use: connect <id>');
        } else {
          console.log(`Requesting screen from ${targetPeer}...`);
          client.send({
            type: 'screen-request',
            to: targetPeer,
            data: { fps: 20 }
          });
          // Start viewer
          const { ScreenViewer } = require('./viewer');
          const viewer = new ScreenViewer(8080);
          viewer.start();
          
          client.onMessage((msg: SignalMessage) => {
            if (msg.type === 'screen' && msg.data?.frame) {
              viewer.updateFrame(msg.data.frame);
            }
          });
        }
        break;
      case 'mouse':
        if (!targetPeer) {
          console.log('No target. Use: connect <id>');
        } else if (parts.length < 3) {
          console.log('Usage: mouse <x> <y>');
        } else {
          client.sendMouseMove(targetPeer, parseInt(parts[1]), parseInt(parts[2]));
        }
        break;
      case 'click':
        if (!targetPeer) {
          console.log('No target. Use: connect <id>');
        } else if (parts.length < 3) {
          console.log('Usage: click <x> <y>');
        } else {
          client.sendMouseClick(targetPeer, parseInt(parts[1]), parseInt(parts[2]));
        }
        break;
      case 'key':
        if (!targetPeer) {
          console.log('No target. Use: connect <id>');
        } else if (parts.length < 2) {
          console.log('Usage: key <key>');
        } else {
          client.send({ type: 'key', to: targetPeer, data: { action: 'press', key: parts[1] } });
        }
        break;
      case 'type':
        if (!targetPeer) {
          console.log('No target. Use: connect <id>');
        } else if (parts.length < 2) {
          console.log('Usage: type <text>');
        } else {
          client.send({ type: 'key', to: targetPeer, data: { action: 'type', text: parts.slice(1).join(' ') } });
        }
        break;
      case 'test':
        if (!targetPeer) {
          console.log('No target. Use: connect <id>');
        } else {
          client.sendTest(targetPeer, parts.length > 1 ? parts.slice(1).join(' ') : 'hello');
          console.log('Test message sent');
        }
        break;
      default:
        if (input.trim()) console.log('Unknown command');
    }
  }

  client.disconnect();
  rl.close();
}

// Main
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
  console.log('  npm run agent       - Start as agent (被控端)');
  console.log('  npm run controller  - Start as controller (控制端)');
  rl.close();
}
