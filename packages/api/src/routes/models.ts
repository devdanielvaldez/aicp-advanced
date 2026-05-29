import { Router } from 'express';
import { OllamaClient, loadConfig, saveConfig } from '@aicp/cli';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const client = new OllamaClient();
    const models = await client.listLocalModels();
    res.json({ models });
  } catch (err: any) {
    logger.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/select', async (req, res) => {
  const { models } = req.body;
  if (!Array.isArray(models)) {
    return res.status(400).json({ error: 'models must be an array' });
  }
  try {
    const config = await loadConfig();
    config.selectedModels = models;
    await saveConfig(config);
    res.json({ success: true, selectedModels: models });
  } catch (err: any) {
    logger.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/selected', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json({ selectedModels: config.selectedModels });
  } catch (err: any) {
    logger.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;