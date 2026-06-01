import { logger } from '../../utils/logger.js';
import { getPool, updatePool, listPools } from '../../pools/manager.js';
import { regeneratePoolSystemPrompt } from '../../pools/prompt-generator.js';
import select from '@inquirer/select';
import { OllamaClient } from '../../ollama/client.js';

export async function regeneratePromptCommand() {
  const pools = await listPools();
  if (pools.length === 0) {
    logger.error('No pools available.');
    return;
  }

  const poolName = await select({
    message: 'Select a pool to regenerate its system prompt:',
    choices: pools.map(p => ({ name: p.name, value: p.name })),
    pageSize: 10,
  });

  const pool = await getPool(poolName);
  if (!pool) {
    logger.error(`Pool "${poolName}" not found`);
    return;
  }
  const client = new OllamaClient();
  if (!(await client.isRunning())) {
    logger.error('Ollama is not running. Start it with `ollama serve`.');
    return;
  }
  if (pool.models.length === 0) {
    logger.error('Pool has no models to generate prompt');
    return;
  }
  logger.info('Regenerating system prompt...');
  try {
    await regeneratePoolSystemPrompt(client, pool);
    await updatePool(pool);
    logger.success(`System prompt regenerated for pool "${poolName}"`);
  } catch (err: any) {
    logger.error(`Failed to regenerate prompt: ${err.message}`);
  }
}