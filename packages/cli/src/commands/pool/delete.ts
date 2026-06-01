import { logger } from '../../utils/logger.js';
import { deletePool, getPool, listPools } from '../../pools/manager.js';
import select from '@inquirer/select';
import confirm from '@inquirer/confirm';

export async function deletePoolCommand() {
  const pools = await listPools();
  if (pools.length === 0) {
    logger.error('No pools available.');
    return;
  }

  const poolName = await select({
    message: 'Select a pool to delete:',
    choices: pools.map(p => ({ name: p.name, value: p.name })),
    pageSize: 10,
  });

  const pool = await getPool(poolName);
  if (!pool) {
    logger.error(`Pool "${poolName}" not found`);
    return;
  }
  const ok = await confirm({ message: `Delete pool "${poolName}"?`, default: false });
  if (!ok) return;
  await deletePool(poolName);
  logger.success(`Pool "${poolName}" deleted`);
}