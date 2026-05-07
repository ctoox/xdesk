import * as readline from 'readline';
import { SignalClient } from './client';
import { SignalMessage } from './message';
import { ScreenViewer } from './viewer';
import { executeCommand } from './shell';
import { FFmpegCapture } from './ffmpeg-capture';
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

async function main(proxyUrl?: string) {
  const client = new SignalClient(SIGNAL_URL, proxyUrl);
  const capture = new FFmpegCapture(0, 0, 15, 3);
  const viewer = new ScreenViewer(8080);
  const input = new InputController();
  
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
    console.log(`  Your ID: ${clientId}`);
    console.log('========================================');
    console.log('');
  }

  let targetPeer: string | null = null;
  let viewerStarted = false;
  let frameCount = 0;
  let lastFpsTime = Date.now();
  let currentFps = 0;

  // Start input controller
  input.start();

  // Handle incoming messages
  client.onMessage((msg: SignalMessage) => {
    // Screen frame received
    if (msg.type === 'screen' && msg.data?.frame) {
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

    // Screen request received - start sharing
    if (msg.type === 'screen-request' && msg.id) {
      console.log(`[SHARE] ${msg.id} requested screen`);
      targetPeer = msg.id;
      capture.start((frame) => {
        if (!targetPeer) return;
        client.send({
          type: 'screen',
          to: targetPeer,
          data: { frame: frame.toString('base64') }
        });
      });
    }

    // Input event received - execute locally
    if (msg.type === 'input' && msg.data) {
      const { action, x, y, button, key, text, direction } = msg.data;
      switch (action) {
        case 'mousemove':
          input.mouseMove(x, y);
          break;
        case 'mouseclick':
          input.mouseClick(x, y, button);
          break;
        case 'mousescroll':
          input.mouseScroll(x, y, direction);
          break;
        case 'keypress':
          input.keyPress(key);
          break;
        case 'typetext':
          input.typeText(text);
          break;
      }
    }

    // Shell output received
    if (msg.type === 'shell-output' && msg.data?.output) {
      viewer.appendShellOutput(msg.data.output);
    }

    // Shell command received - execute
    if (msg.type === 'shell' && msg.data?.command && msg.id) {
      console.log(`[SHELL] ${msg.data.command}`);
      executeCommand(msg.data.command).then(output => {
        client.send({ type: 'shell-output', to: msg.id!, data: { output } });
      });
    }
  });

  // Input callback from viewer (browser)
  viewer.setInputCallback((action: string, data: any) => {
    if (!targetPeer) return;
    client.send({
      type: 'input',
      to: targetPeer,
      data: { action, ...data }
    });
  });

  // Shell callback from viewer
  viewer.setShellCallback((command) => {
    if (!targetPeer) {
      viewer.appendShellOutput('Error: No peer connected\n');
      return;
    }
    console.log(`[SHELL] ${command}`);
    client.send({ type: 'shell', to: targetPeer, data: { command } });
  });

  console.log('Commands:');
  console.log('  connect <id>  - Connect to peer');
  console.log('  view          - View remote screen');
  console.log('  share         - Share your screen');
  console.log('  stop          - Stop sharing');
  console.log('  quit          - Exit');
  console.log('');

  while (true) {
    const inputCmd = await prompt('xdesk');
    const parts = inputCmd.trim().split(/\s+/);
    if (parts[0] === 'quit' || parts[0] === 'exit') break;

    switch (parts[0]) {
      case 'connect':
        if (parts.length < 2) {
          console.log('Usage: connect <peer-id>');
        } else {
          targetPeer = parts[1];
          console.log(`Connected to: ${targetPeer}`);
          client.send({ type: 'screen-request', to: targetPeer, data: { fps: 60 } });
          console.log('Requesting screen...');
        }
        break;

      case 'view':
        if (!targetPeer) {
          console.log('No peer. Use: connect <id>');
        } else {
          client.send({ type: 'screen-request', to: targetPeer, data: { fps: 60 } });
          console.log('Requesting screen...');
        }
        break;

      case 'share':
        console.log('Sharing your screen...');
        capture.start((frame) => {
          if (!targetPeer) return;
          client.send({
            type: 'screen',
            to: targetPeer,
            data: { frame: frame.toString('base64') }
          });
        });
        break;

      case 'stop':
        capture.stop();
        console.log('Stopped sharing');
        break;

      case 'peers':
        const peers = client.getPeers();
        if (peers.length === 0) {
          console.log('No peers online');
        } else {
          console.log('Online peers:');
          peers.forEach(p => console.log(`  ${p}`));
        }
        break;

      default:
        if (input) console.log('Unknown command');
    }
  }

  capture.stop();
  input.stop();
  if (viewerStarted) viewer.stop();
  client.disconnect();
  rl.close();
}

console.log('=== xdesk Remote Desktop ===');
console.log('');

const proxy = process.argv[2];
main(proxy).catch(console.error);
