import { spawn, ChildProcess } from 'child_process';

export class FFmpegCapture {
  private process: ChildProcess | null = null;
  private onFrameCallback: ((frame: Buffer) => void) | null = null;
  private capturing: boolean = false;
  private frameBuffer: Buffer = Buffer.alloc(0);

  constructor(
    private width: number = 3440,
    private height: number = 1440,
    private fps: number = 30,
    private quality: number = 5
  ) {}

  start(onFrame: (frame: Buffer) => void): void {
    if (this.capturing) return;
    this.capturing = true;
    this.onFrameCallback = onFrame;
    this.frameBuffer = Buffer.alloc(0);

    // Try AMD AMF hardware encoding first, fallback to MJPEG
    let args: string[];
    
    args = [
      '-f', 'gdigrab',
      '-framerate', String(this.fps),
      '-i', 'desktop',
      '-c:v', 'mjpeg',
      '-q:v', String(this.quality),
      '-f', 'mjpeg',
      'pipe:1'
    ];
    console.log('[FFmpeg] Using MJPEG encoding');

    // Find ffmpeg
    let ffmpegPath = 'ffmpeg';
    const paths = [
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Users\\ctooc\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe',
      process.env.FFMPEG_PATH || '',
      'ffmpeg'
    ];
    
    for (const p of paths) {
      if (p && require('fs').existsSync(p)) {
        ffmpegPath = p;
        break;
      }
    }

    console.log(`[FFmpeg] Using: ${ffmpegPath}`);
    console.log(`[FFmpeg] Capture: ${this.width}x${this.height} @ ${this.fps}fps`);

    this.process = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.frameBuffer = Buffer.concat([this.frameBuffer, data]);
      this.extractFrames();
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('error')) {
        console.error(`[FFmpeg] ${msg.trim()}`);
      }
    });

    this.process.on('close', (code) => {
      console.log(`[FFmpeg] Exited with code ${code}`);
      this.capturing = false;
    });

    this.process.on('error', (err) => {
      console.error(`[FFmpeg] Error: ${err.message}`);
      this.capturing = false;
    });
  }

  private extractFrames(): void {
    // Find JPEG frames (FF D8 ... FF D9)
    while (true) {
      const start = this.frameBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
      if (start === -1) {
        this.frameBuffer = Buffer.alloc(0);
        break;
      }

      const end = this.frameBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start + 2);
      if (end === -1) {
        this.frameBuffer = this.frameBuffer.slice(start);
        break;
      }

      const frame = this.frameBuffer.slice(start, end + 2);
      this.frameBuffer = this.frameBuffer.slice(end + 2);

      if (frame.length > 100 && this.onFrameCallback) {
        this.onFrameCallback(frame);
      }
    }
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
