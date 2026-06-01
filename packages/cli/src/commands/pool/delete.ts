import { logger } from '../../utils/logger.js';
import { deletePool, getPool } from '../../pools/manager.js';
import confirm from '@inquirer/confirm';

export async function deletePoolCommand(name: string) {
  const pool = await getPool(name);
  if (!pool) {
    logger.error(`Pool "${name}" not found`);
    return;
  }
  const ok = await confirm({ message: `Delete pool "${name}"?`, default: false });
  if (!ok) return;
  await deletePool(name);
  logger.success(`Pool "${name}" deleted`);
}