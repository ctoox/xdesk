import { spawn, ChildProcess } from 'child_process';
import { execSync } from 'child_process';

export class FFmpegCapture {
  private process: ChildProcess | null = null;
  private onFrameCallback: ((frame: Buffer) => void) | null = null;
  private capturing: boolean = false;
  private frameBuffer: Buffer = Buffer.alloc(0);
  private width: number;
  private height: number;

  constructor(
    width: number = 0,
    height: number = 0,
    private fps: number = 60,
    private quality: number = 3
  ) {
    if (width === 0 || height === 0) {
      const res = this.getScreenResolution();
      this.width = res.width;
      this.height = res.height;
    } else {
      this.width = width;
      this.height = height;
    }
  }

  private getScreenResolution(): { width: number; height: number } {
    try {
      // Get real resolution (ignoring DPI scaling)
      const result = execSync(
        'powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height"',
        { encoding: 'utf8' }
      );
      const lines = result.trim().split('\n');
      const width = parseInt(lines[0]) || 1920;
      const height = parseInt(lines[1]) || 1080;
      return { width, height };
    } catch (e) {
      // Fallback: use wmic
      try {
        const result = execSync(
          'wmic path Win32_VideoController get CurrentHorizontalResolution,CurrentVerticalResolution /value',
          { encoding: 'utf8' }
        );
        const lines = result.split('\n').filter(l => l.includes('='));
        const width = parseInt(lines[0]?.split('=')[1]) || 1920;
        const height = parseInt(lines[1]?.split('=')[1]) || 1080;
        return { width, height };
      } catch (e2) {
        return { width: 1920, height: 1080 };
      }
    }
  }

  start(onFrame: (frame: Buffer) => void): void {
    if (this.capturing) return;
    this.capturing = true;
    this.onFrameCallback = onFrame;
    this.frameBuffer = Buffer.alloc(0);

    // Don't use -video_size, let ffmpeg capture full screen
    const args = [
      '-f', 'gdigrab',
      '-framerate', String(this.fps),
      '-i', 'desktop',
      '-c:v', 'mjpeg',
      '-q:v', String(this.quality),
      '-f', 'mjpeg',
      'pipe:1'
    ];

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
    console.log(`[FFmpeg] Capture: ${this.width}x${this.height} @ ${this.fps}fps, quality ${this.quality}`);

    this.process = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.frameBuffer = Buffer.concat([this.frameBuffer, data]);
      this.extractFrames();
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      // Ignore ffmpeg logs
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

  getResolution(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
