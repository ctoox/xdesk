use std::io::{self, Read, Write, BufWriter};
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::Foundation::*;
use image::{ImageBuffer, Rgb, codecs::jpeg::JpegEncoder};

struct ScreenCapture {
    hdc: HDC,
    mem_dc: HDC,
    bmp: HBITMAP,
    width: i32,
    height: i32,
    scaled_w: i32,
    scaled_h: i32,
    quality: u8,
}

impl ScreenCapture {
    fn new(quality: u8, max_width: i32) -> Self {
        unsafe {
            let hdc = GetDC(HWND(0));
            let width = GetDeviceCaps(hdc, DESKTOPHORZRES);
            let height = GetDeviceCaps(hdc, DESKTOPVERTRES);
            
            // Scale down if too large
            let scale = if width > max_width {
                max_width as f32 / width as f32
            } else {
                1.0
            };
            let scaled_w = (width as f32 * scale) as i32;
            let scaled_h = (height as f32 * scale) as i32;
            
            let mem_dc = CreateCompatibleDC(hdc);
            let bmp = CreateCompatibleBitmap(hdc, width, height);
            SelectObject(mem_dc, bmp);
            eprintln!("Screen: {}x{} -> {}x{}", width, height, scaled_w, scaled_h);
            
            ScreenCapture { hdc, mem_dc, bmp, width, height, scaled_w, scaled_h, quality }
        }
    }

    fn capture(&mut self) -> Vec<u8> {
        unsafe {
            BitBlt(self.mem_dc, 0, 0, self.width, self.height, self.hdc, 0, 0, SRCCOPY);

            let mut bmp_info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: self.width,
                    biHeight: -self.height,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                bmiColors: [RGBQUAD::default(); 1],
            };

            let buf_size = (self.width * self.height * 4) as usize;
            let mut raw_buf = vec![0u8; buf_size];
            GetDIBits(self.mem_dc, self.bmp, 0, self.height as u32,
                Some(raw_buf.as_mut_ptr() as *mut _), &mut bmp_info, DIB_RGB_COLORS);

            // Scale and convert BGRA to RGB
            let mut rgb_buf = vec![0u8; (self.scaled_w * self.scaled_h * 3) as usize];
            let x_ratio = self.width as f32 / self.scaled_w as f32;
            let y_ratio = self.height as f32 / self.scaled_h as f32;

            for y in 0..self.scaled_h {
                for x in 0..self.scaled_w {
                    let src_x = (x as f32 * x_ratio) as i32;
                    let src_y = (y as f32 * y_ratio) as i32;
                    let src_idx = ((src_y * self.width + src_x) * 4) as usize;
                    let dst_idx = ((y * self.scaled_w + x) * 3) as usize;
                    
                    if src_idx + 2 < raw_buf.len() && dst_idx + 2 < rgb_buf.len() {
                        rgb_buf[dst_idx] = raw_buf[src_idx + 2];
                        rgb_buf[dst_idx + 1] = raw_buf[src_idx + 1];
                        rgb_buf[dst_idx + 2] = raw_buf[src_idx];
                    }
                }
            }

            let img = ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(
                self.scaled_w as u32, self.scaled_h as u32, rgb_buf
            ).unwrap();
            
            let mut jpeg_buf = Vec::new();
            let encoder = JpegEncoder::new_with_quality(&mut jpeg_buf, self.quality);
            let _ = img.write_with_encoder(encoder);
            jpeg_buf
        }
    }
}

impl Drop for ScreenCapture {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.mem_dc, self.bmp);
            DeleteObject(self.bmp);
            DeleteDC(self.mem_dc);
            ReleaseDC(HWND(0), self.hdc);
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let quality = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(50u8);
    let max_width = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(1920);

    let mut capture = ScreenCapture::new(quality, max_width);
    eprintln!("Capture ready: q={}, max_w={}", quality, max_width);

    let mut stdin = io::stdin();
    let mut stdout = BufWriter::new(io::stdout());

    let mut cmd_buf = [0u8; 1];
    loop {
        match stdin.read(&mut cmd_buf) {
            Ok(0) => break,
            Ok(_) => {
                match cmd_buf[0] {
                    1 => {
                        let jpeg = capture.capture();
                        let len = jpeg.len() as u32;
                        let _ = stdout.write_all(&len.to_be_bytes());
                        let _ = stdout.write_all(&jpeg);
                        let _ = stdout.flush();
                    }
                    0 => break,
                    _ => {}
                }
            }
            Err(_) => break,
        }
    }
}
