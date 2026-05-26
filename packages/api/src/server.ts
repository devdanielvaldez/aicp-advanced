import express from 'express';
import client from 'prom-client';
import { ReputationManager, BFTAdaptiveConsensus } from '@aicp/core';

const app = express();
app.use(express.json());

const register = new client.Registry();
const httpRequests = new client.Counter({ name: 'http_requests_total', help: 'Total requests', registers: [register] });
app.use((req, res, next) => { httpRequests.inc(); next(); });

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.post('/consensus', async (req, res) => {
  const { prompt, models } = req.body;
  // TODO: Implement consensus logic using core
  res.json({ result: 'consensus answer (stub)' });
});

app.listen(3000, () => console.log('API listening on 3000'));
