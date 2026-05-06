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
    quality: u8,
}

impl ScreenCapture {
    fn new(quality: u8) -> Self {
        unsafe {
            let hdc = GetDC(HWND(0));
            
            // Get real screen size (ignoring DPI scaling)
            let width = GetDeviceCaps(hdc, DESKTOPHORZRES);
            let height = GetDeviceCaps(hdc, DESKTOPVERTRES);
            
            let mem_dc = CreateCompatibleDC(hdc);
            let bmp = CreateCompatibleBitmap(hdc, width, height);
            SelectObject(mem_dc, bmp);
            eprintln!("Screen: {}x{}", width, height);
            
            ScreenCapture { hdc, mem_dc, bmp, width, height, quality }
        }
    }

    fn capture(&mut self) -> Vec<u8> {
        unsafe {
            // Capture full screen
            BitBlt(self.mem_dc, 0, 0, self.width, self.height, self.hdc, 0, 0, SRCCOPY);

            let mut bmp_info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: self.width,
                    biHeight: -self.height, // Top-down
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

            // Convert BGRA to RGB
            let mut rgb_buf = vec![0u8; (self.width * self.height * 3) as usize];
            for i in 0..(self.width * self.height) as usize {
                rgb_buf[i * 3] = raw_buf[i * 4 + 2];     // R
                rgb_buf[i * 3 + 1] = raw_buf[i * 4 + 1]; // G
                rgb_buf[i * 3 + 2] = raw_buf[i * 4];     // B
            }

            // Encode JPEG
            let img = ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(
                self.width as u32, self.height as u32, rgb_buf
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
    let quality = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(70u8);

    let mut capture = ScreenCapture::new(quality);
    eprintln!("Capture ready: q={}", quality);

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
