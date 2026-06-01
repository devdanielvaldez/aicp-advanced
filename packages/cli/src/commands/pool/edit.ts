import { logger } from '../../utils/logger.js';
import { getPool, updatePool, listPools } from '../../pools/manager.js';
import { regeneratePoolSystemPrompt } from '../../pools/prompt-generator.js';
import select from '@inquirer/select';
import input from '@inquirer/input';
import { checkbox, confirm } from '@inquirer/prompts';
import { OllamaClient } from '../../ollama/client.js';

export async function editPoolCommand() {
  const pools = await listPools();
  if (pools.length === 0) {
    logger.error('No pools available.');
    return;
  }

  const poolName = await select({
    message: 'Select a pool to edit:',
    choices: pools.map(p => ({ name: p.name, value: p.name })),
    pageSize: 10,
  });

  const pool = await getPool(poolName);
  if (!pool) {
    logger.error(`Pool "${poolName}" not found`);
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
  const descriptionChanged = newDescription !== pool.description;
  const modelsChanged = JSON.stringify(selectedModels) !== JSON.stringify(pool.models);

  pool.description = newDescription;
  pool.models = selectedModels;

  let promptRegenerated = false;
  if (descriptionChanged) {
    logger.info('Description changed. Regenerating system prompt...');
    try {
      await regeneratePoolSystemPrompt(client, pool);
      promptRegenerated = true;
    } catch (err: any) {
      logger.error(`Failed to regenerate system prompt: ${err.message}`);
    }
  } else if (modelsChanged && pool.models.length > 0 && !pool.systemPrompt) {
    try {
      await regeneratePoolSystemPrompt(client, pool);
      promptRegenerated = true;
    } catch (err: any) {
      logger.error(`Failed to generate system prompt: ${err.message}`);
    }
  }

  if (!promptRegenerated && pool.systemPrompt) {
    const regenerate = await confirm({
      message: 'Regenerate system prompt anyway?',
      default: false,
    });
    if (regenerate) {
      try {
        await regeneratePoolSystemPrompt(client, pool);
      } catch (err: any) {
        logger.error(`Failed to regenerate system prompt: ${err.message}`);
      }
    }
  }

  await updatePool(pool);
  logger.success(`Pool "${pool.name}" updated`);
}