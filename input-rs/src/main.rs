use std::io::{self, BufRead, Write};
use windows::Win32::UI::Input::KeyboardAndMouse::*;

const SM_XVIRTUALSCREEN: i32 = 76;
const SM_YVIRTUALSCREEN: i32 = 77;
const SM_CXVIRTUALSCREEN: i32 = 78;
const SM_CYVIRTUALSCREEN: i32 = 79;

#[link(name = "user32")]
extern "system" {
    fn GetSystemMetrics(nIndex: i32) -> i32;
}

static mut OFFSET_X: i32 = 0;
static mut OFFSET_Y: i32 = 0;

fn mouse_move_to(x: i32, y: i32) {
    unsafe {
        let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        
        // 应用校准偏移
        let x = x + OFFSET_X;
        let y = y + OFFSET_Y;
        
        let nx = ((x - vx) as i64 * 65535 / vw as i64) as i32;
        let ny = ((y - vy) as i64 * 65535 / vh as i64) as i32;
        
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: nx,
                    dy: ny,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

fn mouse_down(x: i32, y: i32, button: &str) {
    mouse_move_to(x, y);
    
    unsafe {
        let flag = match button {
            "right" => MOUSEEVENTF_RIGHTDOWN,
            "middle" => MOUSEEVENTF_MIDDLEDOWN,
            _ => MOUSEEVENTF_LEFTDOWN,
        };
        
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0, dy: 0, mouseData: 0,
                    dwFlags: flag, time: 0, dwExtraInfo: 0,
                },
            },
        };
        
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

fn mouse_up(x: i32, y: i32, button: &str) {
    mouse_move_to(x, y);
    
    unsafe {
        let flag = match button {
            "right" => MOUSEEVENTF_RIGHTUP,
            "middle" => MOUSEEVENTF_MIDDLEUP,
            _ => MOUSEEVENTF_LEFTUP,
        };
        
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0, dy: 0, mouseData: 0,
                    dwFlags: flag, time: 0, dwExtraInfo: 0,
                },
            },
        };
        
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

fn mouse_click(x: i32, y: i32, button: &str) {
    mouse_move_to(x, y);
    
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

fn mouse_scroll(x: i32, y: i32, direction: &str) {
    mouse_move_to(x, y);
    
    unsafe {
        let delta: i32 = if direction == "up" { 120 } else { -120 };
        
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0, dy: 0, mouseData: delta as u32,
                    dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0,
                },
            },
        };
        
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

fn key_press(key: &str) {
    unsafe {
        let vk = match key.to_lowercase().as_str() {
            "enter" | "return" => VK_RETURN,
            "backspace" => VK_BACK,
            "tab" => VK_TAB,
            "escape" | "esc" => VK_ESCAPE,
            "delete" | "del" => VK_DELETE,
            "insert" => VK_INSERT,
            "home" => VK_HOME,
            "end" => VK_END,
            "pageup" | "page up" => VK_PRIOR,
            "pagedown" | "page down" => VK_NEXT,
            "up" | "arrowup" => VK_UP,
            "down" | "arrowdown" => VK_DOWN,
            "left" | "arrowleft" => VK_LEFT,
            "right" | "arrowright" => VK_RIGHT,
            " " | "space" => VK_SPACE,
            "shift" => VK_SHIFT,
            "control" | "ctrl" => VK_CONTROL,
            "alt" | "menu" => VK_MENU,
            "meta" | "win" | "super" => VK_LWIN,
            "f1" => VK_F1, "f2" => VK_F2, "f3" => VK_F3, "f4" => VK_F4,
            "f5" => VK_F5, "f6" => VK_F6, "f7" => VK_F7, "f8" => VK_F8,
            "f9" => VK_F9, "f10" => VK_F10, "f11" => VK_F11, "f12" => VK_F12,
            "f13" => VK_F13, "f14" => VK_F14, "f15" => VK_F15, "f16" => VK_F16,
            "f17" => VK_F17, "f18" => VK_F18, "f19" => VK_F19, "f20" => VK_F20,
            "f21" => VK_F21, "f22" => VK_F22, "f23" => VK_F23, "f24" => VK_F24,
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
            "num0" => VK_NUMPAD0, "num1" => VK_NUMPAD1, "num2" => VK_NUMPAD2,
            "num3" => VK_NUMPAD3, "num4" => VK_NUMPAD4, "num5" => VK_NUMPAD5,
            "num6" => VK_NUMPAD6, "num7" => VK_NUMPAD7, "num8" => VK_NUMPAD8,
            "num9" => VK_NUMPAD9,
            "numlock" => VK_NUMLOCK,
            "capslock" => VK_CAPITAL,
            "scrolllock" => VK_SCROLL,
            "printscreen" | "prtsc" => VK_SNAPSHOT,
            "pause" => VK_PAUSE,
            "apps" => VK_APPS,
            "+" | "=" => VK_OEM_PLUS,
            "-" => VK_OEM_MINUS,
            "," => VK_OEM_COMMA,
            "." => VK_OEM_PERIOD,
            "/" => VK_OEM_2,
            ";" => VK_OEM_1,
            "'" => VK_OEM_7,
            "[" => VK_OEM_4,
            "]" => VK_OEM_6,
            "\\" => VK_OEM_5,
            "`" => VK_OEM_3,
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

fn type_text(text: &str) {
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

        let parts: Vec<&str> = line.trim().splitn(5, ' ').collect();
        if parts.is_empty() { continue; }

        match parts[0] {
            "mousemove" => {
                if parts.len() >= 3 {
                    if let (Ok(x), Ok(y)) = (parts[1].parse(), parts[2].parse()) {
                        mouse_move_to(x, y);
                    }
                }
            }
            "mouseclick" => {
                if parts.len() >= 3 {
                    let x: i32 = parts[1].parse().unwrap_or(0);
                    let y: i32 = parts[2].parse().unwrap_or(0);
                    let button = if parts.len() >= 4 { parts[3] } else { "left" };
                    mouse_click(x, y, button);
                }
            }
            "mousedown" => {
                if parts.len() >= 3 {
                    let x: i32 = parts[1].parse().unwrap_or(0);
                    let y: i32 = parts[2].parse().unwrap_or(0);
                    let button = if parts.len() >= 4 { parts[3] } else { "left" };
                    mouse_down(x, y, button);
                }
            }
            "mouseup" => {
                if parts.len() >= 3 {
                    let x: i32 = parts[1].parse().unwrap_or(0);
                    let y: i32 = parts[2].parse().unwrap_or(0);
                    let button = if parts.len() >= 4 { parts[3] } else { "left" };
                    mouse_up(x, y, button);
                }
            }
            "mousescroll" => {
                if parts.len() >= 3 {
                    let x: i32 = parts[1].parse().unwrap_or(0);
                    let y: i32 = parts[2].parse().unwrap_or(0);
                    let direction = if parts.len() >= 4 { parts[3] } else { "down" };
                    mouse_scroll(x, y, direction);
                }
            }
            "keypress" | "key" => {
                if parts.len() >= 2 {
                    key_press(parts[1]);
                }
            }
            "typetext" | "type" => {
                if parts.len() >= 2 {
                    type_text(parts[1]);
                }
            }
            "calibrate" => {
                if parts.len() >= 3 {
                    unsafe {
                        OFFSET_X = parts[1].parse().unwrap_or(0);
                        OFFSET_Y = parts[2].parse().unwrap_or(0);
                        eprintln!("[CALIBRATE] offset=({}, {})", OFFSET_X, OFFSET_Y);
                    }
                }
            }
            "quit" => break,
            _ => {}
        }

        stdout.flush().ok();
    }
}
