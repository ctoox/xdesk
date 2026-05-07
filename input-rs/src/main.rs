use std::io::{self, BufRead, Write};
use windows::Win32::UI::Input::KeyboardAndMouse::*;

const SM_CXSCREEN: i32 = 0;
const SM_CYSCREEN: i32 = 1;

#[link(name = "user32")]
extern "system" {
    fn GetSystemMetrics(nIndex: i32) -> i32;
}

fn send_mouse_move(x: i32, y: i32) {
    unsafe {
        let screen_width = GetSystemMetrics(SM_CXSCREEN);
        let screen_height = GetSystemMetrics(SM_CYSCREEN);
        
        let normalized_x = (x as f64 / screen_width as f64 * 65535.0) as i32;
        let normalized_y = (y as f64 / screen_height as f64 * 65535.0) as i32;
        
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: normalized_x,
                    dy: normalized_y,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

fn send_mouse_click(x: i32, y: i32, button: &str) {
    send_mouse_move(x, y);
    
    unsafe {
        let (down_flag, up_flag) = match button {
            "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            _ => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
        };
        
        let down = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0, dy: 0, mouseData: 0,
                    dwFlags: down_flag, time: 0, dwExtraInfo: 0,
                },
            },
        };
        
        let up = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0, dy: 0, mouseData: 0,
                    dwFlags: up_flag, time: 0, dwExtraInfo: 0,
                },
            },
        };
        
        SendInput(&[down], std::mem::size_of::<INPUT>() as i32);
        SendInput(&[up], std::mem::size_of::<INPUT>() as i32);
    }
}

fn send_mouse_scroll(x: i32, y: i32, direction: &str) {
    send_mouse_move(x, y);
    
    unsafe {
        let delta: u32 = if direction == "up" { 120 } else { 65536 - 120 };
        
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0, dy: 0, mouseData: delta,
                    dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0,
                },
            },
        };
        
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

fn send_key_press(key: &str) {
    unsafe {
        let vk = match key.to_lowercase().as_str() {
            "enter" => VK_RETURN,
            "backspace" => VK_BACK,
            "tab" => VK_TAB,
            "escape" | "esc" => VK_ESCAPE,
            "delete" | "del" => VK_DELETE,
            "insert" => VK_INSERT,
            "home" => VK_HOME,
            "end" => VK_END,
            "pageup" => VK_PRIOR,
            "pagedown" => VK_NEXT,
            "up" => VK_UP,
            "down" => VK_DOWN,
            "left" => VK_LEFT,
            "right" => VK_RIGHT,
            "space" => VK_SPACE,
            "shift" => VK_SHIFT,
            "control" | "ctrl" => VK_CONTROL,
            "alt" => VK_MENU,
            "f1" => VK_F1, "f2" => VK_F2, "f3" => VK_F3, "f4" => VK_F4,
            "f5" => VK_F5, "f6" => VK_F6, "f7" => VK_F7, "f8" => VK_F8,
            "f9" => VK_F9, "f10" => VK_F10, "f11" => VK_F11, "f12" => VK_F12,
            "a" => VK_A, "b" => VK_B, "c" => VK_C, "d" => VK_D,
            "e" => VK_E, "f" => VK_F, "g" => VK_G, "h" => VK_H,
            "i" => VK_I, "j" => VK_J, "k" => VK_K, "l" => VK_L,
            "m" => VK_M, "n" => VK_N, "o" => VK_O, "p" => VK_P,
            "q" => VK_Q, "r" => VK_R, "s" => VK_S, "t" => VK_T,
            "u" => VK_U, "v" => VK_V, "w" => VK_W, "x" => VK_X,
            "y" => VK_Y, "z" => VK_Z,
            "0" => VK_0, "1" => VK_1, "2" => VK_2, "3" => VK_3,
            "4" => VK_4, "5" => VK_5, "6" => VK_6, "7" => VK_7,
            "8" => VK_8, "9" => VK_9,
            _ => return,
        };
        
        let down = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk, wScan: 0,
                    dwFlags: KEYEVENTF_EXTENDEDKEY, time: 0, dwExtraInfo: 0,
                },
            },
        };
        
        let up = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk, wScan: 0,
                    dwFlags: KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                    time: 0, dwExtraInfo: 0,
                },
            },
        };
        
        SendInput(&[down], std::mem::size_of::<INPUT>() as i32);
        SendInput(&[up], std::mem::size_of::<INPUT>() as i32);
    }
}

fn send_type_text(text: &str) {
    for c in text.chars() {
        unsafe {
            let input = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VK_0, wScan: c as u16,
                        dwFlags: KEYEVENTF_UNICODE, time: 0, dwExtraInfo: 0,
                    },
                },
            };
            
            let up = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VK_0, wScan: c as u16,
                        dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                        time: 0, dwExtraInfo: 0,
                    },
                },
            };
            
            SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
            SendInput(&[up], std::mem::size_of::<INPUT>() as i32);
        }
    }
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        let parts: Vec<&str> = line.trim().splitn(4, ' ').collect();
        if parts.is_empty() { continue; }

        match parts[0] {
            "mousemove" => {
                if parts.len() >= 3 {
                    if let (Ok(x), Ok(y)) = (parts[1].parse(), parts[2].parse()) {
                        send_mouse_move(x, y);
                    }
                }
            }
            "mouseclick" => {
                if parts.len() >= 3 {
                    let x: i32 = parts[1].parse().unwrap_or(0);
                    let y: i32 = parts[2].parse().unwrap_or(0);
                    let button = if parts.len() >= 4 { parts[3] } else { "left" };
                    send_mouse_click(x, y, button);
                }
            }
            "mousescroll" => {
                if parts.len() >= 3 {
                    let x: i32 = parts[1].parse().unwrap_or(0);
                    let y: i32 = parts[2].parse().unwrap_or(0);
                    let direction = if parts.len() >= 4 { parts[3] } else { "down" };
                    send_mouse_scroll(x, y, direction);
                }
            }
            "keypress" => {
                if parts.len() >= 2 {
                    send_key_press(parts[1]);
                }
            }
            "typetext" => {
                if parts.len() >= 2 {
                    send_type_text(parts[1]);
                }
            }
            "quit" => break,
            _ => {}
        }

        stdout.flush().ok();
    }
}
