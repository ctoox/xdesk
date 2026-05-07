import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export class InputController {
  private process: ChildProcess | null = null;

  start(): void {
    if (this.process) return;

    const exePath = path.join(__dirname, '..', 'input-rs', 'target', 'release', 'xdesk-input.exe');
    
    this.process = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
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
    this.send(`mousemove ${x} ${y}`);
  }

  mouseClick(x: number, y: number, button: string = 'left'): void {
    this.send(`mouseclick ${x} ${y} ${button}`);
  }

  mouseScroll(x: number, y: number, direction: string = 'down'): void {
    this.send(`mousescroll ${x} ${y} ${direction}`);
  }

  keyPress(key: string): void {
    this.send(`keypress ${key}`);
  }

  typeText(text: string): void {
    this.send(`typetext ${text}`);
  }

  stop(): void {
    if (this.process) {
      this.send('quit');
      this.process.kill();
      this.process = null;
    }
  }
}
