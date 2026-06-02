#!/usr/bin/env node

import chalk from 'chalk';
import select from '@inquirer/select';
import input from '@inquirer/input';
import ora from 'ora';
import { listModelsCommand } from './commands/list.js';
import { selectModelsCommand } from './commands/select.js';
import { loadConfig } from './config/manager.js';
import { listPools } from './pools/manager.js';
import { createPoolCommand } from './commands/pool/create.js';
import { listPoolsCommand } from './commands/pool/list.js';
import { deletePoolCommand } from './commands/pool/delete.js';
import { editPoolCommand } from './commands/pool/edit.js';
import { chatPoolCommand } from './commands/pool/chat.js';
import { showPoolCommand } from './commands/pool/show.js';
import { regeneratePromptCommand } from './commands/pool/regenerate-prompt.js';
import { ExitPromptError } from '@inquirer/core';
import {
  initProjectCommand,
  listProjectsCommand,
  chatProjectCommand,
  refreshProjectCommand,
  removeProjectCommand,
} from './commands/project/index.js';

const logo = `
╔══════════════════════════════════════════════════════════════════════════════════╗
║                                                                                  ║
║   █████╗ ██╗ ██████╗██████╗     ██████╗ ███████╗██████╗                          ║
║  ██╔══██╗██║██╔════╝██╔══██╗    ██╔══██╗██╔════╝██╔══██╗                         ║
║  ███████║██║██║     ██████╔╝    ██████╔╝█████╗  ██████╔╝                         ║
║  ██╔══██║██║██║     ██╔══██╗    ██╔══██╗██╔══╝  ██╔══██╗                         ║
║  ██║  ██║██║╚██████╗██║  ██║    ██████╔╝███████╗██║  ██║                         ║
║  ╚═╝  ╚═╝╚═╝ ╚═════╝╚═╝  ╚═╝    ╚═════╝ ╚══════╝╚═╝  ╚═╝                         ║
║                                                                                  ║
║              AI Consensus Protocol - Developer Edition                          ║
║                         Version 2.0.0                                           ║
╚══════════════════════════════════════════════════════════════════════════════════╝
`;

async function showSelectedModels(): Promise<void> {
  const config = await loadConfig();
  const selected = config.selectedModels;
  if (selected.length === 0) {
    console.log(chalk.yellow('\n  No models selected. Use "Manage Models" to select models.\n'));
  } else {
    console.log(chalk.green('\n  Currently selected models:'));
    selected.forEach(m => console.log(`    • ${m}`));
    console.log('');
  }
}

async function modelsMenu(): Promise<void> {
  const action = await select({
    message: chalk.bold('Models Management'),
    choices: [
      { name: '📋  List installed models', value: 'list' },
      { name: '🎯  Select models for pools', value: 'select' },
      { name: '👁️   Show selected models', value: 'show' },
      { name: '←  Back', value: 'back' },
    ],
    pageSize: 10,
  });

  switch (action) {
    case 'list':
      await listModelsCommand();
      break;
    case 'select':
      await selectModelsCommand();
      break;
    case 'show':
      await showSelectedModels();
      break;
    case 'back':
      return;
  }
  await modelsMenu();
}

async function poolsMenu(): Promise<void> {
  const action = await select({
    message: chalk.bold('Model Pools'),
    choices: [
      { name: '✨  Create pool', value: 'create' },
      { name: '📋  List pools', value: 'list' },
      { name: '🔍  Show pool details', value: 'show' },
      { name: '✏️   Edit pool', value: 'edit' },
      { name: '🗑️   Delete pool', value: 'delete' },
      { name: '🔄  Regenerate system prompt', value: 'regenerate' },
      { name: '💬  Chat with pool', value: 'chat' },
      { name: '←  Back', value: 'back' },
    ],
    pageSize: 10,
  });

  switch (action) {
    case 'create':
      await createPoolCommand();
      break;
    case 'list':
      await listPoolsCommand();
      break;
    case 'show':
      await showPoolCommand();
      break;
    case 'edit':
      await editPoolCommand();
      break;
    case 'delete':
      await deletePoolCommand();
      break;
    case 'regenerate':
      await regeneratePromptCommand();
      break;
    case 'chat':
      await chatPoolCommand();
      break;
    case 'back':
      return;
  }
  await poolsMenu();
}

async function projectsMenu(): Promise<void> {
  const action = await select({
    message: chalk.bold('Project Workspaces'),
    choices: [
      { name: '📁  Init project (index codebase)', value: 'init' },
      { name: '📋  List projects', value: 'list' },
      { name: '💬  Chat with project', value: 'chat' },
      { name: '🔄  Refresh project index', value: 'refresh' },
      { name: '🗑️   Remove project', value: 'remove' },
      { name: '←  Back', value: 'back' },
    ],
    pageSize: 10,
  });

  switch (action) {
    case 'init':
      await initProjectCommand();
      break;
    case 'list':
      await listProjectsCommand();
      break;
    case 'chat':
      await chatProjectCommand();
      break;
    case 'refresh':
      await refreshProjectCommand();
      break;
    case 'remove':
      await removeProjectCommand();
      break;
    case 'back':
      return;
  }
  await projectsMenu();
}

async function mainMenu(): Promise<void> {
  console.clear();
  console.log(chalk.cyan(logo));
  console.log(chalk.gray('  ⚡ Collaborative AI for developers – debate and consensus on code\n'));

  const spinner = ora({ text: 'Loading pools...', color: 'cyan' }).start();
  let poolsCount = 0;
  try {
    const pools = await listPools();
    poolsCount = pools.length;
  } catch {
    // ignore
  }
  spinner.stop();

  const poolsInfo = poolsCount > 0 ? chalk.green(`(${poolsCount} available)`) : chalk.yellow('(none)');
  const modelsInfo = chalk.gray('(manage models)');

  const action = await select({
    message: chalk.bold('What would you like to do?'),
    choices: [
      { name: `🧩  Manage model pools ${poolsInfo}`, value: 'pools' },
      { name: `🤖  Manage models ${modelsInfo}`, value: 'models' },
      { name: `📁  Project workspaces`, value: 'projects' },
      { name: '❌  Exit', value: 'exit' },
    ],
    pageSize: 10,
  });

  switch (action) {
    case 'pools':
      await poolsMenu();
      break;
    case 'models':
      await modelsMenu();
      break;
    case 'projects':
      await projectsMenu();
      break;
    case 'exit':
      console.log(chalk.green('\n  Thank you for using AICP Developer Edition. Goodbye!\n'));
      process.exit(0);
  }
  await mainMenu();
}

console.clear();
const welcomeSpinner = ora({ text: 'Initializing AICP environment...', color: 'cyan' }).start();
await new Promise(resolve => setTimeout(resolve, 800));
welcomeSpinner.succeed('Ready');

mainMenu().catch(err => {
  if (err instanceof ExitPromptError) {
    console.log(chalk.yellow('\n  Exiting gracefully...\n'));
    process.exit(0);
  } else {
    console.error(chalk.red('Fatal error:'), err);
    process.exit(1);
  }
});