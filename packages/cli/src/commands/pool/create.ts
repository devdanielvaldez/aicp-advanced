import { logger } from '../../utils/logger.js';
import { createPool, updatePool } from '../../pools/manager.js';
import { regeneratePoolSystemPrompt } from '../../pools/prompt-generator.js';
import input from '@inquirer/input';
import { checkbox } from '@inquirer/prompts';
import { OllamaClient } from '../../ollama/client.js';

export async function createPoolCommand() {
  const client = new OllamaClient();
  const isRunning = await client.isRunning();
  if (!isRunning) {
    logger.error('Ollama is not running. Start it with `ollama serve`.');
    return;
  }
  const models = await client.listLocalModels();
  if (models.length === 0) {
    logger.warn('No models installed. Please pull at least one model first.');
    return;
  }

  const name = await input({ message: 'Pool name (e.g., typescript-api):' });
  if (!name.trim()) {
    logger.error('Name cannot be empty');
    return;
  }
  const description = await input({ message: 'Pool description (specialty):' });
  if (!description.trim()) {
    logger.error('Description cannot be empty');
    return;
  }
  const selectedModels = await checkbox({
    message: 'Select models to include in the pool:',
    choices: models.map(m => ({ name: m.name, value: m.name })),
  });
  if (selectedModels.length === 0) {
    logger.error('You must select at least one model');
    return;
  }

  try {
    const pool = await createPool(name.trim(), description.trim(), selectedModels);
    logger.info('Generating system prompt...');
    const systemPrompt = await regeneratePoolSystemPrompt(client, pool);
    pool.systemPrompt = systemPrompt;
    await updatePool(pool);
    logger.success(`Pool "${pool.name}" created with system prompt.`);
  } catch (err: any) {
    logger.error(err.message);
  }
}