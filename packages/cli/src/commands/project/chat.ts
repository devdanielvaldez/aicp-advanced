import select from '@inquirer/select';
import input from '@inquirer/input';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectManager, Retriever } from '@aicp/project';
import { OllamaClient } from '../../ollama/client.js';
import { getPoolById } from '../../pools/manager.js';
import { runPoolDebate } from '../../pools/debate.js';
import { logger } from '../../utils/logger.js';

export async function chatProjectCommand() {
  const manager = new ProjectManager();
  const projects = await manager.getAllProjects();
  if (projects.length === 0) {
    logger.error('No projects indexed. Create one with `aicp project init`.');
    return;
  }

  const projectName = await select({
    message: 'Select a project to chat with:',
    choices: projects.map(p => ({ name: p.name, value: p.name })),
  });

  const project = await manager.getProject(projectName);
  if (!project) {
    logger.error(`Project ${projectName} not found`);
    return;
  }

  const pool = await getPoolById(project.poolId);
  if (!pool) {
    logger.error(`Associated pool not found. Please re-index or recreate project.`);
    return;
  }

  const ollama = new OllamaClient();
  const retriever = new Retriever(ollama);

  console.log(chalk.cyan(`\n💬 Project chat: ${project.name}`));
  console.log(chalk.gray(`   Pool: ${pool.name} | Models: ${pool.models.join(', ')}\n`));
  console.log(chalk.gray('Commands: /exit, /help\n'));

  const showHelp = () => {
    console.log(chalk.gray('  /exit – close chat'));
    console.log(chalk.gray('  /help – show this message'));
  };
  showHelp();

  while (true) {
    const userMsg = await input({ message: chalk.green('>'), required: false });
    if (!userMsg) continue;
    if (userMsg === '/exit') break;
    if (userMsg === '/help') {
      showHelp();
      continue;
    }

    const spinner = ora({ text: 'Searching relevant code...', color: 'cyan' }).start();
    let context = '';
    try {
      context = await retriever.retrieveAsContext(project.name, userMsg, { k: 5 });
      if (context) {
        spinner.succeed(`Found relevant snippets (${context.length} chars)`);
      } else {
        spinner.info('No relevant code found. Proceeding without context.');
      }
    } catch (err: any) {
      spinner.warn(`Context retrieval failed: ${err.message}`);
    }

    console.log(chalk.gray('\n🤖 Models debating with project context...\n'));
    try {
      const finalAnswer = await runPoolDebate(pool, userMsg, {
        rounds: 2,
        interactive: false,
        graph: false,
        turbo: false,
        silent: false,
        context: context,
      });
      console.log(chalk.bold.green('\n✅ Final answer:\n'));
      console.log(finalAnswer);
      console.log(chalk.gray('\n' + '─'.repeat(60) + '\n'));
    } catch (err: any) {
      logger.error(err.message);
    }
  }

  retriever.closeAll();
}