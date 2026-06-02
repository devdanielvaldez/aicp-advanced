import select from '@inquirer/select';
import { confirm } from '@inquirer/prompts';
import ora from 'ora';
import { ProjectManager, ProjectScanner } from '@aicp/project';
import { OllamaClient } from '../../ollama/client.js';
import { logger } from '../../utils/logger.js';

export async function refreshProjectCommand() {
  const manager = new ProjectManager();
  const projects = await manager.getAllProjects();
  if (projects.length === 0) {
    logger.error('No projects indexed.');
    return;
  }

  const projectName = await select({
    message: 'Select a project to refresh (re-index):',
    choices: projects.map(p => ({ name: p.name, value: p.name })),
  });

  const project = await manager.getProject(projectName);
  if (!project) {
    logger.error(`Project ${projectName} not found`);
    return;
  }

  const ok = await confirm({ message: `Re-index entire project "${projectName}"?`, default: false });
  if (!ok) return;

  const ollama = new OllamaClient();
  if (!(await ollama.isRunning())) {
    logger.error('Ollama is not running.');
    return;
  }

  const scanner = new ProjectScanner(ollama);
  const spinner = ora(`Re-indexing ${project.name}...`).start();
  try {
    const stats = await scanner.scanProject(project.name);
    spinner.succeed(`Re-indexed ${stats.filesScanned} files → ${stats.chunksCreated} chunks.`);
  } catch (err: any) {
    spinner.fail(`Refresh failed: ${err.message}`);
  }
}