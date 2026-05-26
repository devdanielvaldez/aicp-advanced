import { checkbox } from '@inquirer/prompts';
import { OllamaClient } from '../ollama/client.js';
import { logger } from '../utils/logger.js';
import { loadConfig, saveConfig } from '../config/manager.js';

export async function selectModelsCommand() {
  const client = new OllamaClient();
  if (!(await client.isRunning())) {
    logger.error('Ollama not running');
    process.exit(1);
  }
  const models = await client.listLocalModels();
  if (models.length === 0) {
    logger.warn('No models installed');
    return;
  }
  const config = await loadConfig();
  const choices = models.map(m => ({
    name: `${m.name} (${m.details?.parameter_size || '?'})`,
    value: m.name,
    checked: config.selectedModels.includes(m.name),
  }));
  const selected = await checkbox({
    message: 'Select models for consensus (space to select)',
    choices,
    pageSize: 10,
  });
  config.selectedModels = selected;
  await saveConfig(config);
  logger.success(`Saved selection: ${selected.join(', ') || 'none'}`);
}
