import { logger } from '../../utils/logger.js';
import { getPool, updatePool } from '../../pools/manager.js';
import input from '@inquirer/input';
import { checkbox } from '@inquirer/prompts';
import { OllamaClient } from '../../ollama/client.js';

export async function editPoolCommand(name: string) {
  const pool = await getPool(name);
  if (!pool) {
    logger.error(`Pool "${name}" not found`);
    return;
  }
  const client = new OllamaClient();
  const installedModels = await client.listLocalModels();
  const modelNames = installedModels.map(m => m.name);

  const newDescription = await input({
    message: `Description (current: ${pool.description})`,
    default: pool.description,
  });
  const selectedModels = await checkbox({
    message: 'Select models for the pool:',
    choices: modelNames.map(m => ({ name: m, value: m, checked: pool.models.includes(m) })),
  });
  if (selectedModels.length === 0) {
    logger.error('Pool must have at least one model');
    return;
  }
  pool.description = newDescription;
  pool.models = selectedModels;
  await updatePool(pool);
  logger.success(`Pool "${name}" updated`);
  // TODO: system prompt regeneration will be added in Module 3 if description changed
}