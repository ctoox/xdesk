import WebSocket from 'ws';

const url = 'wss://xdesk.ctoocn.workers.dev/ws?room=test';

console.log('Testing WebSocket connection (direct, no proxy)...');
console.log('URL:', url);

const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('SUCCESS: Connected!');
  ws.send(JSON.stringify({ type: 'test', data: { message: 'hello from node' } }));
});

ws.on('message', (data) => {
  console.log('RECEIVED:', data.toString());
});

ws.on('error', (err) => {
  console.error('ERROR:', err.message);
});

ws.on('close', (code, reason) => {
  console.log('CLOSED:', code, reason.toString());
});

setTimeout(() => {
  console.log('TIMEOUT');
  ws.terminate();
  process.exit(1);
}, 10000);
