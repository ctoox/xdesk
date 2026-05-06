import { exec } from 'child_process';
import * as os from 'os';

const isWindows = os.platform() === 'win32';

export class InputController {
  private screenWidth: number;
  private screenHeight: number;

  constructor() {
    if (isWindows) {
      this.screenWidth = 1920;
      this.screenHeight = 1080;
      try {
        const result = require('child_process').execSync(
          'powershell -command "(Get-CimInstance Win32_VideoController).CurrentHorizontalResolution,(Get-CimInstance Win32_VideoController).CurrentVerticalResolution"',
          { encoding: 'utf8' }
        ).trim().split('\n');
        if (result.length >= 2) {
          this.screenWidth = parseInt(result[0]) || 1920;
          this.screenHeight = parseInt(result[1]) || 1080;
        }
      } catch (e) {}
    } else {
      try {
        const robot = require('robotjs');
        const size = robot.getScreenSize();
        this.screenWidth = size.width;
        this.screenHeight = size.height;
      } catch (e) {
        this.screenWidth = 1920;
        this.screenHeight = 1080;
      }
    }
    console.log(`Screen size: ${this.screenWidth}x${this.screenHeight}`);
  }

  moveMouse(x: number, y: number): void {
    if (isWindows) {
      try {
        exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})"`);
      } catch (e) {}
    } else {
      try {
        require('robotjs').moveMouse(x, y);
      } catch (e) {}
    }
  }

  mouseClick(x: number, y: number, button: string = 'left'): void {
    this.moveMouse(x, y);
    setTimeout(() => {
      if (isWindows) {
        const btn = button === 'right' ? 'right' : 'left';
        try {
          exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{${btn}}')"`);
        } catch (e) {}
      } else {
        try {
          require('robotjs').mouseClick(button as any);
        } catch (e) {}
      }
    }, 10);
  }

  scrollMouse(direction: string): void {
    if (isWindows) {
      const delta = direction === 'up' ? 120 : -120;
      try {
        exec(`powershell -command "Add-Type @'\\nusing System;\\nusing System.Runtime.InteropServices;\\npublic class Mouse {\\n  [DllImport(\"user32.dll\")]\\n  public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, IntPtr dwExtraInfo);\\n}\\n'@; [Mouse]::mouse_event(0x0800, 0, 0, ${delta}, [IntPtr]::Zero)"`);
      } catch (e) {}
    } else {
      try {
        require('robotjs').scrollMouse(0, direction === 'up' ? 3 : -3);
      } catch (e) {}
    }
  }

  keyPress(key: string): void {
    if (isWindows) {
      const keyMap: { [key: string]: string } = {
        'Enter': '{ENTER}',
        'Backspace': '{BACKSPACE}',
        'Tab': '{TAB}',
        'Escape': '{ESC}',
        'Delete': '{DELETE}',
        'ArrowUp': '{UP}',
        'ArrowDown': '{DOWN}',
        'ArrowLeft': '{LEFT}',
        'ArrowRight': '{RIGHT}',
        'Home': '{HOME}',
        'End': '{END}',
        'PageUp': '{PGUP}',
        'PageDown': '{PGDN}',
        'Insert': '{INSERT}',
        'F1': '{F1}',
        'F2': '{F2}',
        'F3': '{F3}',
        'F4': '{F4}',
        'F5': '{F5}',
        'F6': '{F6}',
        'F7': '{F7}',
        'F8': '{F8}',
        'F9': '{F9}',
        'F10': '{F10}',
        'F11': '{F11}',
        'F12': '{F12}',
        ' ': ' ',
      };
      
      let sendKey = keyMap[key] || key;
      
      if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') {
        return;
      }
      
      sendKey = sendKey.replace(/'/g, "''");
      
      try {
        exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKey}')"`);
      } catch (e) {}
    } else {
      try {
        const robot = require('robotjs');
        const keyMap: { [key: string]: string } = {
          'Enter': 'enter',
          'Backspace': 'backspace',
          'Tab': 'tab',
          'Escape': 'escape',
          'ArrowUp': 'up',
          'ArrowDown': 'down',
          'ArrowLeft': 'left',
          'ArrowRight': 'right',
          ' ': 'space',
        };
        robot.keyTap(keyMap[key] || key.toLowerCase());
      } catch (e) {}
    }
  }

  typeText(text: string): void {
    if (isWindows) {
      const escaped = text.replace(/([+^%~(){}[\]])/g, '{$1}');
      try {
        exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`);
      } catch (e) {}
    } else {
      try {
        require('robotjs').typeString(text);
      } catch (e) {}
    }
  }

  getScreenSize(): { width: number; height: number } {
    return { width: this.screenWidth, height: this.screenHeight };
  }
}
