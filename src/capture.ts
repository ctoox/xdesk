import screenshot from 'screenshot-desktop';
import sharp from 'sharp';

export class ScreenCapture {
  private fps: number = 30;
  private quality: number = 60;
  private scale: number = 0.5;
  private capturing: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private onFrameCallback: ((frame: Buffer, isKeyframe: boolean) => void) | null = null;
  private lastFrame: Buffer | null = null;
  private frameCount: number = 0;
  private keyframeInterval: number = 30; // Every 30 frames send full frame

  constructor(fps: number = 30, quality: number = 60, scale: number = 0.5) {
    this.fps = fps;
    this.quality = quality;
    this.scale = scale;
  }

  async captureOnce(): Promise<Buffer> {
    const imgBuffer = await screenshot({ format: 'png' });
    const info = await sharp(imgBuffer).metadata();
    const w = Math.floor((info.width || 1920) * this.scale);
    const h = Math.floor((info.height || 1080) * this.scale);
    
    return sharp(imgBuffer)
      .resize(w, h, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: this.quality, mozjpeg: true })
      .toBuffer();
  }

  async captureDiff(): Promise<{ frame: Buffer; isKeyframe: boolean }> {
    const current = await this.captureOnce();
    
    // Send keyframe every N frames
    if (this.frameCount % this.keyframeInterval === 0 || !this.lastFrame) {
      this.lastFrame = current;
      this.frameCount++;
      return { frame: current, isKeyframe: true };
    }
    
    // Compare frames - if too different, send keyframe
    const diff = await this.compareFrames(this.lastFrame, current);
    
    if (diff > 0.3) { // More than 30% changed
      this.lastFrame = current;
      this.frameCount++;
      return { frame: current, isKeyframe: true };
    }
    
    // Small change - send diff
    this.lastFrame = current;
    this.frameCount++;
    return { frame: current, isKeyframe: false };
  }

  private async compareFrames(prev: Buffer, curr: Buffer): Promise<number> {
    try {
      const prevRaw = await sharp(prev).raw().toBuffer();
      const currRaw = await sharp(curr).raw().toBuffer();
      
      if (prevRaw.length !== currRaw.length) return 1;
      
      let diffPixels = 0;
      const totalPixels = prevRaw.length / 3;
      
      for (let i = 0; i < prevRaw.length; i += 3) {
        const dr = Math.abs(prevRaw[i] - currRaw[i]);
        const dg = Math.abs(prevRaw[i+1] - currRaw[i+1]);
        const db = Math.abs(prevRaw[i+2] - currRaw[i+2]);
        if (dr + dg + db > 30) diffPixels++;
      }
      
      return diffPixels / totalPixels;
    } catch {
      return 1;
    }
  }

  startCapture(onFrame: (frame: Buffer, isKeyframe: boolean) => void): void {
    if (this.capturing) return;
    this.capturing = true;
    this.onFrameCallback = onFrame;
    this.frameCount = 0;
    
    const interval = 1000 / this.fps;
    
    const loop = async () => {
      if (!this.capturing) return;
      const start = Date.now();
      
      try {
        const { frame, isKeyframe } = await this.captureDiff();
        if (this.onFrameCallback) {
          this.onFrameCallback(frame, isKeyframe);
        }
      } catch (e) {}
      
      const elapsed = Date.now() - start;
      const delay = Math.max(1, interval - elapsed);
      this.intervalId = setTimeout(loop, delay);
    };
    
    loop();
    console.log(`Capture: ${this.fps}fps, ${this.quality}%, scale:${this.scale}`);
  }

  stopCapture(): void {
    this.capturing = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  setFps(fps: number) { this.fps = Math.min(60, Math.max(1, fps)); }
  setQuality(q: number) { this.quality = Math.min(100, Math.max(1, q)); }
  setScale(s: number) { this.scale = Math.min(1, Math.max(0.1, s)); }
  isCapturing(): boolean { return this.capturing; }
  getStats() { return { fps: this.fps, quality: this.quality, scale: this.scale }; }
}
