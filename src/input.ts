import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class InputController {
  private process: ChildProcess | null = null;

  start(): void {
    if (this.process) return;

    const possiblePaths = [
      path.join(__dirname, '..', 'bin', 'xdesk-input.exe'),
      path.join(__dirname, '..', 'input-rs', 'target', 'release', 'xdesk-input.exe'),
      path.join(__dirname, '..', 'bin', 'xdesk-input'),
      path.join(__dirname, '..', 'input-rs', 'target', 'release', 'xdesk-input'),
    ];

    let exePath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        exePath = p;
        break;
      }
    }

    if (!exePath) {
      console.log('[INPUT] xdesk-input binary not found, input control disabled');
      return;
    }

    console.log('[INPUT] Using: ' + exePath);
    
    this.process = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    this.process.stderr?.on('data', (data) => {
      console.log(data.toString().trim());
    });

    this.process.on('error', (err) => {
      console.error('[INPUT] Error:', err.message);
    });

    this.process.on('close', () => {
      console.log('[INPUT] Process exited');
      this.process = null;
    });
  }

  private send(command: string): void {
    if (this.process?.stdin) {
      this.process.stdin.write(command + '\n');
    }
  }

  mouseMove(x: number, y: number): void {
    this.send('mousemove ' + x + ' ' + y);
  }

  mouseClick(x: number, y: number, button: string = 'left'): void {
    this.send('mouseclick ' + x + ' ' + y + ' ' + button);
  }

  mouseScroll(x: number, y: number, direction: string = 'down'): void {
    this.send('mousescroll ' + x + ' ' + y + ' ' + direction);
  }

  keyPress(key: string): void {
    this.send('keypress ' + key);
  }

  typeText(text: string): void {
    this.send('typetext ' + text);
  }

  calibrate(offsetX: number, offsetY: number): void {
    this.send('calibrate ' + offsetX + ' ' + offsetY);
  }

  stop(): void {
    if (this.process) {
      this.send('quit');
      this.process.kill();
      this.process = null;
    }
  }
}
