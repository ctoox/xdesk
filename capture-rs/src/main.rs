use std::io::{self, Read, Write};
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::Foundation::*;
use image::{ImageBuffer, Rgb, codecs::jpeg::JpegEncoder};

const SM_CXSCREEN: i32 = 0;
const SM_CYSCREEN: i32 = 1;

#[link(name = "user32")]
extern "system" {
    fn GetSystemMetrics(nIndex: i32) -> i32;
}

struct ScreenCapture {
    hdc: HDC,
    mem_dc: HDC,
    bmp: HBITMAP,
    width: i32,
    height: i32,
    quality: u8,
    scale: f32,
}

impl ScreenCapture {
    fn new(quality: u8, scale: f32) -> Self {
        unsafe {
            let hdc = GetDC(HWND(0));
            let width = GetSystemMetrics(SM_CXSCREEN);
            let height = GetSystemMetrics(SM_CYSCREEN);
            let mem_dc = CreateCompatibleDC(hdc);
            let bmp = CreateCompatibleBitmap(hdc, width, height);
            SelectObject(mem_dc, bmp);

            ScreenCapture { hdc, mem_dc, bmp, width, height, quality, scale }
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

            let mut raw_buf = vec![0u8; (self.width * self.height * 4) as usize];
            GetDIBits(self.mem_dc, self.bmp, 0, self.height as u32,
                Some(raw_buf.as_mut_ptr() as *mut _), &mut bmp_info, DIB_RGB_COLORS);

            let scaled_w = (self.width as f32 * self.scale) as u32;
            let scaled_h = (self.height as f32 * self.scale) as u32;
            let mut img = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(scaled_w, scaled_h);
            let x_ratio = self.width as f32 / scaled_w as f32;
            let y_ratio = self.height as f32 / scaled_h as f32;

            for y in 0..scaled_h {
                for x in 0..scaled_w {
                    let src_x = (x as f32 * x_ratio) as u32;
                    let src_y = (y as f32 * y_ratio) as u32;
                    let idx = ((src_y * self.width as u32 + src_x) * 4) as usize;
                    if idx + 2 < raw_buf.len() {
                        img.put_pixel(x, y, Rgb([raw_buf[idx + 2], raw_buf[idx + 1], raw_buf[idx]]));
                    }
                }
            }

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
    let quality = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(60u8);
    let scale = args.get(2).and_then(|s| s.parse::<f32>().ok()).unwrap_or(0.5);

    let mut capture = ScreenCapture::new(quality, scale);
    eprintln!("Capture: {:.0}x{:.0}, q={}, s={}", 
        capture.width as f32 * scale, capture.height as f32 * scale, quality, scale);

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut stdout = stdout.lock();

    loop {
        let mut cmd = [0u8; 1];
        if stdin.lock().read(&mut cmd).is_err() || cmd[0] == 0 {
            break;
        }

        if cmd[0] == 1 {
            let jpeg = capture.capture();
            let len = jpeg.len() as u32;
            let _ = stdout.write_all(&len.to_be_bytes());
            let _ = stdout.write_all(&jpeg);
            let _ = stdout.flush();
        } else if cmd[0] == 2 {
            let mut buf = [0u8; 1];
            if stdin.lock().read(&mut buf).is_ok() {
                capture.quality = buf[0];
            }
        }
    }
}
