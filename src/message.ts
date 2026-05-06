export interface SignalMessage {
  type: 'id' | 'offer' | 'answer' | 'ice' | 'test' | 'mouse' | 'key' | 'screen' | 'screen-request' | 'screen-info' | 'shell';
  id?: string;
  to?: string;
  data?: any;
}

export function createIdMessage(id: string): SignalMessage {
  return { type: 'id', id };
}

export function createTestMessage(to: string, message: string): SignalMessage {
  return { type: 'test', to, data: { message } };
}

export function createMouseMoveMessage(to: string, x: number, y: number): SignalMessage {
  return { type: 'mouse', to, data: { action: 'move', x, y } };
}

export function createMouseClickMessage(to: string, x: number, y: number, button: string = 'left'): SignalMessage {
  return { type: 'mouse', to, data: { action: 'click', x, y, button } };
}

export function createMouseDownMessage(to: string, button: string = 'left'): SignalMessage {
  return { type: 'mouse', to, data: { action: 'down', button } };
}

export function createMouseUpMessage(to: string, button: string = 'left'): SignalMessage {
  return { type: 'mouse', to, data: { action: 'up', button } };
}

export function createMouseDragMessage(to: string, x: number, y: number): SignalMessage {
  return { type: 'mouse', to, data: { action: 'drag', x, y } };
}

export function createScrollMessage(to: string, x: number, y: number, direction: string): SignalMessage {
  return { type: 'mouse', to, data: { action: 'scroll', x, y, direction } };
}

export function createKeyEventMessage(to: string, key: number, action: string = 'press'): SignalMessage {
  return { type: 'key', to, data: { key, action } };
}

export function createKeyComboMessage(to: string, key: string, modifiers: string[]): SignalMessage {
  return { type: 'key', to, data: { action: 'combo', key, modifiers } };
}

export function createTypeTextMessage(to: string, text: string): SignalMessage {
  return { type: 'key', to, data: { action: 'type', text } };
}

export function createScreenFrame(to: string, frame: string, quality: number = 80): SignalMessage {
  return { 
    type: 'screen', 
    to, 
    data: { 
      frame,
      quality,
      timestamp: Date.now()
    } 
  };
}

export function createScreenRequest(to: string, fps: number = 10): SignalMessage {
  return { 
    type: 'screen-request', 
    to, 
    data: { fps } 
  };
}

export function createScreenInfo(to: string, width: number, height: number): SignalMessage {
  return {
    type: 'screen-info',
    to,
    data: { width, height }
  };
}
