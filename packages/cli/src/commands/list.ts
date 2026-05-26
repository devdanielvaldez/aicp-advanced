import { OllamaClient } from '../ollama/client.js';
import { logger } from '../utils/logger.js';
import ora from 'ora';

export async function listModelsCommand() {
  const client = new OllamaClient();
  const spinner = ora('Connecting to Ollama...').start();
  const ok = await client.isRunning();
  if (!ok) {
    spinner.fail('Ollama not running');
    logger.error('Run `ollama serve` first');
    process.exit(1);
  }
  spinner.succeed('Connected');
  spinner.start('Fetching models...');
  const models = await client.listLocalModels();
  spinner.succeed(`Found ${models.length} models`);
  if (models.length === 0) {
    logger.warn('No models installed');
  } else {
    logger.title('Installed Models');
    const data = models.map(m => ({
      Name: m.name,
      Size: (m.size / 1e9).toFixed(2) + ' GB',
      Params: m.details?.parameter_size || '?',
      Quant: m.details?.quantization_level || '?',
    }));
    logger.table(data);
  }
}
