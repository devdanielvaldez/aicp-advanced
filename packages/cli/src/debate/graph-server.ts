import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import open from 'open';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HTML_PATH = path.join(__dirname, 'graph-viewer.html');

let httpServer: http.Server | null = null;
let wss: WebSocketServer | null = null;
let clients: Set<WebSocket> = new Set();

let htmlContent: string | null = null;
try {
    htmlContent = fs.readFileSync(HTML_PATH, 'utf-8');
} catch (err) {
    logger.error(`Could not read graph-viewer.html at ${HTML_PATH}`);
    htmlContent = '<html><body><h1>Error loading graph viewer</h1></body></html>';
}

export function startGraphServer(port = 8080): void {
    if (httpServer) return;
    httpServer = http.createServer((req, res) => {
        if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlContent);
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    wss = new WebSocketServer({ server: httpServer });
    wss.on('connection', (ws) => {
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
    });
    httpServer.listen(port, () => {
        logger.info(`Graph server started on http://localhost:${port}`);
        open(`http://localhost:${port}`).catch(() => {
            logger.warn(`Could not open browser automatically. Go to http://localhost:${port} manually`);
        });
    });
}

export function emitGraphEvent(event: any): void {
    if (!clients.size) return;
    const message = JSON.stringify(event);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

export function closeGraphServer(): void {
    if (wss) {
        wss.close();
        wss = null;
    }
    if (httpServer) {
        httpServer.close();
        httpServer = null;
    }
    clients.clear();
}