import screenshot from 'screenshot-desktop';
import sharp from 'sharp';

export class ScreenCapture {
  private fps: number = 20;
  private quality: number = 70;
  private scale: number = 0.75;
  private capturing: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private onFrameCallback: ((frame: string) => void) | null = null;
  private lastFrameTime: number = 0;

  constructor(fps: number = 20, quality: number = 70, scale: number = 0.75) {
    this.fps = fps;
    this.quality = quality;
    this.scale = scale;
  }

  async captureOnce(): Promise<string> {
    try {
      const imgBuffer = await screenshot({ format: 'png' });
      
      const info = await sharp(imgBuffer).metadata();
      const targetWidth = Math.floor((info.width || 1920) * this.scale);
      const targetHeight = Math.floor((info.height || 1080) * this.scale);

      const compressed = await sharp(imgBuffer)
        .jpeg({ 
          quality: this.quality,
          mozjpeg: true
        })
        .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      return compressed.toString('base64');
    } catch (err) {
      console.error('Screen capture error:', err);
      throw err;
    }
  }

  startCapture(onFrame: (frame: string) => void): void {
    if (this.capturing) return;
    
    this.capturing = true;
    this.onFrameCallback = onFrame;
    
    const interval = 1000 / this.fps;
    
    const captureLoop = async () => {
      if (!this.capturing) return;
      
      const now = Date.now();
      const elapsed = now - this.lastFrameTime;
      
      if (elapsed >= interval) {
        this.lastFrameTime = now;
        try {
          const frame = await this.captureOnce();
          if (this.onFrameCallback) {
            this.onFrameCallback(frame);
          }
        } catch (err) {
          // Ignore capture errors
        }
      }
      
      if (this.capturing) {
        this.intervalId = setTimeout(captureLoop, Math.max(1, interval - elapsed));
      }
    };
    
    captureLoop();
    console.log(`Screen capture started at ${this.fps} FPS, quality: ${this.quality}%, scale: ${this.scale}`);
  }

  stopCapture(): void {
    this.capturing = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    console.log('Screen capture stopped');
  }

  setFps(fps: number): void {
    this.fps = Math.min(60, Math.max(1, fps));
    console.log(`FPS set to ${this.fps}`);
  }

  setQuality(quality: number): void {
    this.quality = Math.min(100, Math.max(1, quality));
    console.log(`Quality set to ${this.quality}%`);
  }

  setScale(scale: number): void {
    this.scale = Math.min(1, Math.max(0.1, scale));
    console.log(`Scale set to ${this.scale}`);
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  getStats(): { fps: number; quality: number; scale: number } {
    return { fps: this.fps, quality: this.quality, scale: this.scale };
  }
}
