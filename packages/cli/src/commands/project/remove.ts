import select from '@inquirer/select';
import { confirm } from '@inquirer/prompts';
import { ProjectManager } from '@aicp/project';
import { getPoolById, deletePool } from '../../pools/manager.js';
import { logger } from '../../utils/logger.js';

export async function removeProjectCommand() {
  const manager = new ProjectManager();
  const projects = await manager.getAllProjects();
  if (projects.length === 0) {
    logger.error('No projects indexed.');
    return;
  }

  const projectName = await select({
    message: 'Select a project to remove:',
    choices: projects.map(p => ({ name: p.name, value: p.name })),
  });

  const project = await manager.getProject(projectName);
  if (!project) {
    logger.error(`Project ${projectName} not found`);
    return;
  }

  const ok = await confirm({ message: `Delete project "${projectName}" and its associated pool?`, default: false });
  if (!ok) return;

  const pool = await getPoolById(project.poolId);
  if (pool) {
    await deletePool(pool.name);
    logger.success(`Deleted pool "${pool.name}"`);
  }

  await manager.deleteProject(projectName);
  logger.success(`Project "${projectName}" removed.`);
}