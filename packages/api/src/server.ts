import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import modelsRouter from './routes/models.js';
import debateRouter, { setupDebateWebSocket } from './routes/debate.js';
import { logger } from './utils/logger.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

app.use('/api/models', modelsRouter);
app.use('/api/debate', debateRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

setupDebateWebSocket(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.success(`AICP API running on http://localhost:${PORT}`);
  logger.info(`WebSocket endpoint: ws://localhost:${PORT}`);
});