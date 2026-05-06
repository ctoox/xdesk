const robot = require('robotjs');

export class InputController {
  private screenWidth: number;
  private screenHeight: number;

  constructor() {
    const size = robot.getScreenSize();
    this.screenWidth = size.width;
    this.screenHeight = size.height;
    console.log(`Screen size: ${this.screenWidth}x${this.screenHeight}`);
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
      robot.scrollMouse(0, direction === 'up' ? 5 : -5);
    } catch (err) {
      console.error('Mouse scroll error:', err);
    }
  }

  keyPress(key: string, modifiers: string[] = []): void {
    try {
      if (modifiers.length > 0) {
        robot.keyTap(key, modifiers);
      } else {
        robot.keyTap(key);
      }
    } catch (err) {
      console.error('Key press error:', err);
    }
  }

  keyDown(key: string): void {
    try {
      robot.keyToggle(key, 'down');
    } catch (err) {
      console.error('Key down error:', err);
    }
  }

  keyUp(key: string): void {
    try {
      robot.keyToggle(key, 'up');
    } catch (err) {
      console.error('Key up error:', err);
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
