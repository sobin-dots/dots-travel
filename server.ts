import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { handlePlivoStreamWebSocket } from './src/lib/streaming/plivo-stream-handler';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, req) => {
    console.log(`[WebSocketServer] Client connected at ${req.url}`);
    handlePlivoStreamWebSocket(ws);
  });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '', true);

    if (pathname === '/api/plivo/stream' || pathname === '/api/v1/telephony/stream') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (pathname?.startsWith('/_next')) {
      // Allow Next.js internal HMR WebSocket upgrade in development
      return;
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} [Next.js App Router + Plivo Stream WebSocketServer]`);
    console.log(`> Plivo Stream WebSocket URL: ws://localhost:${port}/api/plivo/stream`);
  });
});
