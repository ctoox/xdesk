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
  'Meta': 'command',
  'CapsLock': 'capslock',
  'NumLock': 'numlock',
  'ScrollLock': 'scrolllock',
  'Pause': 'pause',
  'PrintScreen': 'printscreen',
  'ContextMenu': 'menu',
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

  private mapKey(key: string): string {
    if (KEY_MAP[key]) {
      return KEY_MAP[key];
    }
    if (key.length === 1) {
      return key.toLowerCase();
    }
    return key.toLowerCase();
  }

  moveMouse(x: number, y: number): void {
    try {
      robot.moveMouse(x, y);
    } catch (err) {
      console.error('Mouse move error:', err);
    }
  }

  mouseClick(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): void {
    try {
      robot.moveMouse(x, y);
      robot.mouseClick(button);
    } catch (err) {
      console.error('Mouse click error:', err);
    }
  }

  mouseDown(button: 'left' | 'right' | 'middle' = 'left'): void {
    try {
      robot.mouseToggle('down', button);
    } catch (err) {
      console.error('Mouse down error:', err);
    }
  }

  mouseUp(button: 'left' | 'right' | 'middle' = 'left'): void {
    try {
      robot.mouseToggle('up', button);
    } catch (err) {
      console.error('Mouse up error:', err);
    }
  }

  mouseDrag(x: number, y: number): void {
    try {
      robot.dragMouse(x, y);
    } catch (err) {
      console.error('Mouse drag error:', err);
    }
  }

  scrollMouse(x: number, y: number, direction: 'up' | 'down'): void {
    try {
      robot.moveMouse(x, y);
      robot.scrollMouse(0, direction === 'up' ? 3 : -3);
    } catch (err) {
      console.error('Mouse scroll error:', err);
    }
  }

  keyPress(key: string, modifiers: string[] = []): void {
    try {
      const mappedKey = this.mapKey(key);
      const mappedModifiers = modifiers.map(m => this.mapKey(m));
      if (mappedModifiers.length > 0) {
        robot.keyTap(mappedKey, mappedModifiers);
      } else {
        robot.keyTap(mappedKey);
      }
    } catch (err) {
      console.error(`Key press error (${key}):`, err.message);
    }
  }

  keyDown(key: string): void {
    try {
      robot.keyToggle(this.mapKey(key), 'down');
    } catch (err) {
      console.error(`Key down error (${key}):`, err.message);
    }
  }

  keyUp(key: string): void {
    try {
      robot.keyToggle(this.mapKey(key), 'up');
    } catch (err) {
      console.error(`Key up error (${key}):`, err.message);
    }
  }

  typeText(text: string): void {
    try {
      robot.typeString(text);
    } catch (err) {
      console.error('Type text error:', err);
    }
  }

  getScreenSize(): { width: number; height: number } {
    return { width: this.screenWidth, height: this.screenHeight };
  }
}
