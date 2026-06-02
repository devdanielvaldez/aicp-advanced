import { ProjectManager } from '@aicp/project';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';

export async function listProjectsCommand() {
  const manager = new ProjectManager();
  const projects = await manager.getAllProjects();
  if (projects.length === 0) {
    logger.info('No projects indexed. Use `aicp project init` to create one.');
    return;
  }
  console.log(chalk.bold('\n📁 Indexed projects:\n'));
  for (const p of projects) {
    const lastIndexed = p.lastIndexedAt ? new Date(p.lastIndexedAt).toLocaleString() : 'never';
    console.log(chalk.green(`  • ${p.name}`));
    console.log(chalk.gray(`    Path: ${p.rootPath}`));
    console.log(chalk.gray(`    Chunks: ${p.totalChunks} · Last index: ${lastIndexed}`));
    console.log(chalk.gray(`    Pool: ${p.poolId}\n`));
  }
}