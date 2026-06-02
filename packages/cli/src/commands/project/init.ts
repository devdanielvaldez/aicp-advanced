import input from '@inquirer/input';
import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectManager, ProjectScanner } from '@aicp/project';
import { OllamaClient } from '../../ollama/client.js';
import { createPool, updatePool, deletePool } from '../../pools/manager.js';
import { logger } from '../../utils/logger.js';
import path from 'path';

export async function initProjectCommand() {
  const rootPath = await input({
    message: 'Project root path (absolute or relative):',
    default: process.cwd(),
  });
  const resolvedPath = path.resolve(rootPath);
  const name = await input({
    message: 'Project name (unique identifier):',
    default: path.basename(resolvedPath),
  });

  const ollama = new OllamaClient();
  if (!(await ollama.isRunning())) {
    logger.error('Ollama is not running. Start it with `ollama serve`.');
    return;
  }

  const projectManager = new ProjectManager();
  const existing = await projectManager.getProject(name);
  if (existing) {
    logger.error(`Project "${name}" already exists. Use "project refresh" or remove first.`);
    return;
  }

  const installedModels = await ollama.listLocalModels();
  if (installedModels.length === 0) {
    logger.error('No models installed. Please `ollama pull` at least one model.');
    return;
  }

  const candidateModels = installedModels.filter(m => 
    !m.name.toLowerCase().includes('embed') && 
    !m.name.toLowerCase().includes('nomic')
  );

  if (candidateModels.length === 0) {
    logger.error('No chat models found. Please pull a model like `ollama pull llama3.2:1b`.');
    return;
  }

  const selectedModels = await checkbox({
    message: 'Select models to include in this project pool:',
    choices: candidateModels.map(m => ({
      name: `${m.name} (${m.details?.parameter_size || '?'})`,
      value: m.name,
    })),
    pageSize: 10,
  });

  if (selectedModels.length === 0) {
    logger.error('You must select at least one model.');
    return;
  }

  const poolName = `proj-${name}`;
  const poolDescription = `Expert pool for project "${name}" – understands this codebase.`;
  logger.info(`Creating pool "${poolName}" with models: ${selectedModels.join(', ')}`);

  let pool;
  try {
    pool = await createPool(poolName, poolDescription, selectedModels);
    const { regeneratePoolSystemPrompt } = await import('../../pools/prompt-generator.js');
    await regeneratePoolSystemPrompt(ollama, pool);
    await updatePool(pool);
  } catch (err: any) {
    logger.error(`Failed to create pool: ${err.message}`);
    return;
  }

  const project = await projectManager.createProject(name, resolvedPath, pool.id, {
    embeddingModel: 'nomic-embed-text',
    chunkSizeTokens: 500,
    autoWatch: false,
  });

  const scanner = new ProjectScanner(ollama);
  const spinner = ora(`Indexing project ${name}...`).start();
  try {
    const stats = await scanner.scanProject(name);
    spinner.succeed(`Indexed ${stats.filesScanned} files → ${stats.chunksCreated} chunks.`);
  } catch (err: any) {
    spinner.fail(`Indexing failed: ${err.message}`);
    await projectManager.deleteProject(name);
    await deletePool(poolName);
    logger.error('Project creation rolled back.');
    return;
  }

  logger.success(`Project "${name}" initialized.`);
  console.log(chalk.gray(`\n  Pool: ${pool.name}`));
  console.log(chalk.gray(`  Models: ${selectedModels.join(', ')}`));
  console.log(chalk.gray(`  Project path: ${project.rootPath}`));
  console.log(chalk.gray(`  Use "aicp project chat ${name}" to start coding with context.\n`));
}