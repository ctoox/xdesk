import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export class RustCapture {
  private process: ChildProcess | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private onFrameCallback: ((frame: Buffer) => void) | null = null;
  private capturing: boolean = false;

  constructor(private quality: number = 80) {}

  start(onFrame: (frame: Buffer) => void): void {
    if (this.capturing) return;
    this.capturing = true;
    this.onFrameCallback = onFrame;
    this.buffer = Buffer.alloc(0);
    
    const exePath = path.join(__dirname, '..', 'capture-rs', 'target', 'release', 'xdesk-capture.exe');
    
    this.process = spawn(exePath, [this.quality.toString()], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.processBuffer();
    });

    this.process.stderr?.on('data', (data) => {
      console.log(`[RUST] ${data.toString().trim()}`);
    });

    this.process.on('close', () => {
      console.log('[RUST] Process exited');
      this.capturing = false;
    });

    this.process.on('error', (err) => {
      console.error('[RUST] Error:', err.message);
      this.capturing = false;
    });

    setTimeout(() => this.captureLoop(), 100);
  }

  private processBuffer(): void {
    while (this.buffer.length >= 4) {
      const frameLen = this.buffer.readUInt32BE(0);
      if (this.buffer.length >= 4 + frameLen) {
        const frame = this.buffer.slice(4, 4 + frameLen);
        this.buffer = this.buffer.slice(4 + frameLen);
        
        if (this.onFrameCallback && frame.length > 0) {
          this.onFrameCallback(frame);
        }
      } else {
        break;
      }
    }
  }

  private captureLoop(): void {
    if (!this.process || !this.capturing) return;
    
    try {
      this.process.stdin?.write(Buffer.from([1]));
    } catch (e) {
      console.error('[RUST] Write error:', e);
      this.capturing = false;
      return;
    }
    
    setTimeout(() => this.captureLoop(), 33);
  }

  stop(): void {
    this.capturing = false;
    if (this.process) {
      try {
        this.process.stdin?.write(Buffer.from([0]));
      } catch (e) {}
      this.process.kill();
      this.process = null;
    }
  }
}
