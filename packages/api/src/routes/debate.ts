import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { handleDebateStream } from '../websocket/debateStream.js';
import { logger } from '../utils/logger.js';

const router = Router();

export function setupDebateWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const prompt = url.searchParams.get('prompt');
    const rounds = parseInt(url.searchParams.get('rounds') || '2');
    const interactive = url.searchParams.get('interactive') === 'true';
    const graph = url.searchParams.get('graph') === 'true';
    const turbo = url.searchParams.get('turbo') === 'true';
    const selfEval = url.searchParams.get('selfEval') === 'true';
    const memory = url.searchParams.get('memory') === 'true';

    if (!prompt) {
      ws.close(1008, 'Missing prompt');
      return;
    }

    logger.info(`New debate stream: prompt="${prompt.substring(0, 50)}..."`);
    handleDebateStream(ws, prompt, { rounds, interactive, graph, turbo, selfEval, memory });
  });
}

router.post('/', (req, res) => {
  res.status(501).json({ error: 'Use WebSocket connection instead' });
});

export default router;