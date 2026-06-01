import { logger } from '../../utils/logger.js';
import { listPools } from '../../pools/manager.js';

export async function listPoolsCommand() {
  const pools = await listPools();
  if (pools.length === 0) {
    logger.info('No pools created. Use `aicp pool create` to create one.');
    return;
  }
  console.table(pools.map(p => ({
    Name: p.name,
    Description: p.description,
    Models: p.models.join(', '),
    Created: new Date(p.createdAt).toLocaleDateString(),
  })));
}