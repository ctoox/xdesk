import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export class FFmpegCapture {
  private process: ChildProcess | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private onFrameCallback: ((frame: Buffer) => void) | null = null;
  private capturing: boolean = false;

  constructor(
    private width: number = 3440,
    private height: number = 1440,
    private fps: number = 30
  ) {}

  start(onFrame: (frame: Buffer) => void): void {
    if (this.capturing) return;
    this.capturing = true;
    this.onFrameCallback = onFrame;
    this.buffer = Buffer.alloc(0);

    // Use ffmpeg with GDI capture and hardware encoding
    const args = [
      '-f', 'gdigrab',           // Windows screen capture
      '-framerate', String(this.fps),
      '-video_size', `${this.width}x${this.height}`,
      '-i', 'desktop',           // Capture desktop
      '-c:v', 'mjpeg',           // Use MJPEG for speed
      '-q:v', '5',               // Quality (1-31, lower=better)
      '-f', 'mjpeg',             // Output format
      'pipe:1'                   // Output to stdout
    ];

    // Try to find ffmpeg
    const ffmpegPath = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
    
    this.process = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    let frameBuffer = Buffer.alloc(0);
    let frameStart = -1;

    this.process.stdout?.on('data', (data: Buffer) => {
      frameBuffer = Buffer.concat([frameBuffer, data]);
      
      // Find JPEG frames (FF D8 start, FF D9 end)
      for (let i = 0; i < frameBuffer.length - 1; i++) {
        if (frameBuffer[i] === 0xFF && frameBuffer[i + 1] === 0xD8) {
          frameStart = i;
        }
        if (frameStart >= 0 && frameBuffer[i] === 0xFF && frameBuffer[i + 1] === 0xD9) {
          const frame = frameBuffer.slice(frameStart, i + 2);
          frameStart = -1;
          
          if (this.onFrameCallback && frame.length > 100) {
            this.onFrameCallback(frame);
          }
          
          frameBuffer = frameBuffer.slice(i + 2);
          i = -1;
        }
      }
    });

    this.process.stderr?.on('data', (data) => {
      // ffmpeg logs to stderr, ignore unless error
    });

    this.process.on('close', () => {
      console.log('[FFmpeg] Process exited');
      this.capturing = false;
    });

    this.process.on('error', (err) => {
      console.error('[FFmpeg] Error:', err.message);
      this.capturing = false;
    });
  }

  stop(): void {
    this.capturing = false;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isCapturing(): boolean {
    return this.capturing;
  }
}
