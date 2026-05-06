import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export class RustCapture {
  private process: ChildProcess | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private onFrameCallback: ((frame: Buffer) => void) | null = null;
  private frameResolve: ((frame: Buffer) => void) | null = null;

  constructor(
    private quality: number = 60,
    private scale: number = 0.5
  ) {}

  start(onFrame: (frame: Buffer) => void): void {
    this.onFrameCallback = onFrame;
    
    const exePath = path.join(__dirname, '..', 'capture-rs', 'target', 'release', 'xdesk-capture.exe');
    
    this.process = spawn(exePath, [this.quality.toString(), this.scale.toString()], {
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
    });

    // Start capture loop
    this.captureLoop();
  }

  private processBuffer(): void {
    while (this.buffer.length >= 4) {
      const frameLen = this.buffer.readUInt32BE(0);
      if (this.buffer.length >= 4 + frameLen) {
        const frame = this.buffer.slice(4, 4 + frameLen);
        this.buffer = this.buffer.slice(4 + frameLen);
        
        if (this.onFrameCallback) {
          this.onFrameCallback(frame);
        }
      } else {
        break;
      }
    }
  }

  private captureLoop(): void {
    if (!this.process || this.process.killed) return;
    
    // Send capture command
    this.process.stdin?.write(Buffer.from([1]));
    
    // Schedule next capture (30fps = ~33ms)
    setTimeout(() => this.captureLoop(), 33);
  }

  stop(): void {
    if (this.process) {
      this.process.stdin?.write(Buffer.from([0]));
      this.process.kill();
      this.process = null;
    }
  }

  setQuality(q: number): void {
    this.quality = q;
    if (this.process) {
      this.process.stdin?.write(Buffer.from([2, q]));
    }
  }

  setScale(s: number): void {
    this.scale = s;
    if (this.process) {
      const buf = Buffer.alloc(5);
      buf.writeUInt8(3, 0);
      buf.writeFloatBE(s, 1);
      this.process.stdin?.write(buf);
    }
  }
}
