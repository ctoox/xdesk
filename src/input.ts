const robot = require('robotjs');

const KEY_MAP: { [key: string]: string } = {
  'Enter': 'enter',
  'Backspace': 'backspace',
  'Tab': 'tab',
  'Escape': 'escape',
  'Delete': 'delete',
  'Insert': 'insert',
  'Home': 'home',
  'End': 'end',
  'PageUp': 'pageup',
  'PageDown': 'pagedown',
  'ArrowUp': 'up',
  'ArrowDown': 'down',
  'ArrowLeft': 'left',
  'ArrowRight': 'right',
  'Control': 'control',
  'Shift': 'shift',
  'Alt': 'alt',
  'Meta': 'win',
  'CapsLock': 'capslock',
  ' ': 'space',
  'F1': 'f1',
  'F2': 'f2',
  'F3': 'f3',
  'F4': 'f4',
  'F5': 'f5',
  'F6': 'f6',
  'F7': 'f7',
  'F8': 'f8',
  'F9': 'f9',
  'F10': 'f10',
  'F11': 'f11',
  'F12': 'f12',
};

export class InputController {
  private screenWidth: number;
  private screenHeight: number;

  constructor() {
    const size = robot.getScreenSize();
    this.screenWidth = size.width;
    this.screenHeight = size.height;
    console.log(`Screen size: ${this.screenWidth}x${this.screenHeight}`);
  }

  private mapKey(key: string): string | null {
    if (KEY_MAP[key]) {
      return KEY_MAP[key];
    }
    if (key.length === 1) {
      return key.toLowerCase();
    }
    const lower = key.toLowerCase();
    if (KEY_MAP[lower]) {
      return KEY_MAP[lower];
    }
    return null;
  }

  moveMouse(x: number, y: number): void {
    try {
      robot.moveMouse(x, y);
    } catch (err) {}
  }

  mouseClick(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): void {
    try {
      robot.moveMouse(x, y);
      robot.mouseClick(button);
    } catch (err) {}
  }

  mouseDown(button: 'left' | 'right' | 'middle' = 'left'): void {
    try {
      robot.mouseToggle('down', button);
    } catch (err) {}
  }

  mouseUp(button: 'left' | 'right' | 'middle' = 'left'): void {
    try {
      robot.mouseToggle('up', button);
    } catch (err) {}
  }

  mouseDrag(x: number, y: number): void {
    try {
      robot.dragMouse(x, y);
    } catch (err) {}
  }

  scrollMouse(x: number, y: number, direction: 'up' | 'down'): void {
    try {
      robot.scrollMouse(0, direction === 'up' ? 3 : -3);
    } catch (err) {}
  }

  keyPress(key: string, modifiers: string[] = []): void {
    try {
      const mappedKey = this.mapKey(key);
      if (!mappedKey) {
        console.log(`Unknown key: ${key}`);
        return;
      }
      const mappedModifiers = modifiers.map(m => this.mapKey(m)).filter(Boolean) as string[];
      if (mappedModifiers.length > 0) {
        robot.keyTap(mappedKey, mappedModifiers);
      } else {
        robot.keyTap(mappedKey);
      }
    } catch (err) {
      console.log(`Key error: ${key} -> ${this.mapKey(key)}`);
    }
  }

  keyDown(key: string): void {
    try {
      const mappedKey = this.mapKey(key);
      if (mappedKey) robot.keyToggle(mappedKey, 'down');
    } catch (err) {}
  }

  keyUp(key: string): void {
    try {
      const mappedKey = this.mapKey(key);
      if (mappedKey) robot.keyToggle(mappedKey, 'up');
    } catch (err) {}
  }

  typeText(text: string): void {
    try {
      robot.typeString(text);
    } catch (err) {}
  }

  getScreenSize(): { width: number; height: number } {
    return { width: this.screenWidth, height: this.screenHeight };
  }
}
