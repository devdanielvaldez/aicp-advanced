import { logger } from '../../utils/logger.js';
import { getPool, listPools } from '../../pools/manager.js';
import select from '@inquirer/select';
import chalk from 'chalk';

export async function showPoolCommand() {
  const pools = await listPools();
  if (pools.length === 0) {
    logger.error('No pools available.');
    return;
  }

  const poolName = await select({
    message: 'Select a pool to show details:',
    choices: pools.map(p => ({ name: p.name, value: p.name })),
    pageSize: 10,
  });

  const pool = await getPool(poolName);
  if (!pool) {
    logger.error(`Pool "${poolName}" not found`);
    return;
  }

  console.log(chalk.bold.cyan(`\nPool: ${pool.name}`));
  console.log(chalk.gray(`ID: ${pool.id}`));
  console.log(chalk.gray(`Description: ${pool.description}`));
  console.log(chalk.gray(`Models: ${pool.models.join(', ')}`));
  console.log(chalk.gray(`Created: ${new Date(pool.createdAt).toLocaleString()}`));
  console.log(chalk.gray(`Updated: ${new Date(pool.updatedAt).toLocaleString()}`));
  console.log(chalk.bold.yellow('\nSystem prompt:'));
  console.log(chalk.white(pool.systemPrompt || '(not generated yet)'));
  console.log('');
}