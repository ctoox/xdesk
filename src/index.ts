import * as readline from 'readline';
import { SignalClient } from './client';
import { SignalMessage } from './message';
import { ScreenViewer } from './viewer';
import { executeCommand } from './shell';
import { FFmpegCapture } from './ffmpeg-capture';
import { InputController } from './input';
import { loadConfig } from './config';
import { formatId } from './id';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(prefix: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prefix + '> ', resolve);
  });
}

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);
  if (args[0]) config.proxy = args[0];
  
  const signalUrl = config.signal_server + '?room=' + config.room;
  
  console.log('');
  console.log('========================================');
  console.log('  xdesk - Remote Desktop');
  console.log('========================================');
  console.log('');

  const client = new SignalClient(signalUrl, config.proxy || undefined);
  const capture = new FFmpegCapture(0, 0, config.fps, config.quality);
  const viewer = new ScreenViewer(8080);
  const input = new InputController();
  
  try {
    await client.connect();
  } catch (e) {
    console.log('Failed to connect to: ' + signalUrl);
    rl.close();
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  const clientId = client.getClientId();
  
  if (clientId) {
    viewer.setMyId(clientId);
    console.log('========================================');
    console.log('  Your ID: ' + formatId(clientId));
    console.log('========================================');
    console.log('');
  }

  let targetPeer: string | null = null;
  let frameCount = 0;
  let lastFpsTime = Date.now();
  let currentFps = 0;

  input.start();

  // 设置浏览器连接回调
  viewer.setConnectCallback((peerId: string) => {
    targetPeer = peerId;
    console.log('[CONNECT] Connecting to: ' + formatId(peerId));
    client.send({ type: 'screen-request', to: targetPeer, data: { fps: config.fps } });
  });

  client.onMessage((msg: SignalMessage) => {
    if (msg.type === 'screen' && msg.data?.frame) {
      viewer.updateFrame(msg.data.frame);
      frameCount++;
      const now = Date.now();
      if (now - lastFpsTime >= 1000) {
        currentFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
        frameCount = 0;
        lastFpsTime = now;
        process.stdout.write('\r[FPS: ' + currentFps + '] ');
      }
    }

    if (msg.type === 'screen-request' && msg.id) {
      console.log('[SHARE] ' + formatId(msg.id) + ' requested screen');
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

    if (msg.type === 'input' && msg.data) {
      const { action, x, y, button, key, text, direction } = msg.data;
      switch (action) {
        case 'mousemove': input.mouseMove(x, y); break;
        case 'mouseclick': input.mouseClick(x, y, button); break;
        case 'mousedown': input.mouseDown(x, y, button); break;
        case 'mouseup': input.mouseUp(x, y, button); break;
        case 'mousescroll': input.mouseScroll(x, y, direction); break;
        case 'keypress': input.keyPress(key); break;
        case 'typetext': input.typeText(text); break;
      }
    }

    if (msg.type === 'shell-output' && msg.data?.output) {
      viewer.appendShellOutput(msg.data.output);
    }

    if (msg.type === 'shell' && msg.data?.command && msg.id) {
      console.log('[SHELL] ' + msg.data.command);
      executeCommand(msg.data.command).then(output => {
        client.send({ type: 'shell-output', to: msg.id!, data: { output } });
      });
    }
  });

  viewer.setInputCallback((action: string, data: any) => {
    if (!targetPeer) return;
    client.send({ type: 'input', to: targetPeer, data: { action, ...data } });
  });

  viewer.setShellCallback((command) => {
    if (!targetPeer) {
      viewer.appendShellOutput('Error: No peer connected\n');
      return;
    }
    console.log('[SHELL] ' + command);
    client.send({ type: 'shell', to: targetPeer, data: { command } });
  });

  // 启动 viewer 并打开浏览器
  viewer.start();
  viewer.openBrowser();

  console.log('Commands:');
  console.log('  connect <id>  - Connect to peer');
  console.log('  peers         - List online peers');
  console.log('  share         - Share your screen');
  console.log('  stop          - Stop sharing');
  console.log('  quit          - Exit');
  console.log('');
  console.log('Or use the web interface at http://localhost:8080');
  console.log('');

  while (true) {
    const inputCmd = await prompt('xdesk');
    const parts = inputCmd.trim().split(/\s+/);
    if (parts[0] === 'quit' || parts[0] === 'exit') break;

    switch (parts[0]) {
      case 'connect':
        if (parts.length < 2) {
          console.log('Usage: connect <id>');
        } else {
          const rawId = parts[1].replace(/[^0-9]/g, '');
          const peers = client.getPeers();
          const match = rawId.length < 9 
            ? peers.find(p => p.startsWith(rawId))
            : peers.find(p => p === rawId);
          
          if (match) {
            targetPeer = match;
            console.log('Connected to: ' + formatId(match));
            client.send({ type: 'screen-request', to: targetPeer, data: { fps: config.fps } });
          } else if (rawId.length >= 9) {
            targetPeer = rawId;
            console.log('Connecting to: ' + formatId(rawId));
            client.send({ type: 'screen-request', to: targetPeer, data: { fps: config.fps } });
          } else {
            console.log('No peer found matching: ' + rawId);
          }
        }
        break;

      case 'peers':
        const peers = client.getPeers();
        if (peers.length === 0) {
          console.log('No peers online');
        } else {
          console.log('Online peers:');
          peers.forEach(p => console.log('  ' + formatId(p)));
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

      case 'config':
        console.log(JSON.stringify(config, null, 2));
        break;

      default:
        if (inputCmd.trim()) console.log('Unknown command');
    }
  }

  capture.stop();
  input.stop();
  viewer.stop();
  client.disconnect();
  rl.close();
}

main().catch(console.error);
