import { logger } from '../../utils/logger.js';
import { getPool, listPools } from '../../pools/manager.js';
import { runPoolDebate } from '../../pools/debate.js';
import select from '@inquirer/select';
import chalk from 'chalk';
import { input } from '@inquirer/prompts';

export async function chatPoolCommand() {
  const pools = await listPools();
  if (pools.length === 0) {
    logger.error('No pools available. Create one first.');
    return;
  }

  const poolName = await select({
    message: 'Select a pool to chat with:',
    choices: pools.map(p => ({
      name: `${p.name} – ${p.description.substring(0, 60)}${p.description.length > 60 ? '…' : ''}`,
      value: p.name,
    })),
    pageSize: 10,
  });

  const pool = await getPool(poolName);
  if (!pool) {
    logger.error(`Pool "${poolName}" not found`);
    return;
  }

  console.log(chalk.cyan(`\n💬 Chat with pool: ${pool.name}`));
  console.log(chalk.gray(`   ${pool.description}`));
  console.log(chalk.gray(`   Models: ${pool.models.join(', ')}\n`));

  let verbose = false;
  const showHelp = () => {
    console.log(chalk.gray('\nCommands:'));
    console.log(chalk.gray('  /verbose   – toggle debate log visibility'));
    console.log(chalk.gray('  /exit      – end chat'));
    console.log(chalk.gray('  /help      – show this message'));
  };
  showHelp();

  while (true) {
    const userPrompt = await input({
      message: chalk.green('>'),
      required: false,
    });
    if (!userPrompt.trim()) continue;
    if (userPrompt === '/exit') {
      console.log(chalk.gray('Exiting chat.'));
      break;
    }
    if (userPrompt === '/help') {
      showHelp();
      continue;
    }
    if (userPrompt === '/verbose') {
      verbose = !verbose;
      console.log(chalk.gray(`Verbose mode: ${verbose ? 'ON' : 'OFF'}`));
      continue;
    }

    console.log(chalk.gray('\n🤖 Models are debating...'));
    try {
      const finalAnswer = await runPoolDebate(pool, userPrompt, {
        rounds: 2,
        interactive: false,
        graph: false,
        turbo: false,
        selfEval: false,
        memory: false,
        silent: !verbose,
      });
      console.log(chalk.bold.green('\n✅ Final answer:\n'));
      console.log(finalAnswer);
      console.log(chalk.gray('\n' + '─'.repeat(60) + '\n'));
    } catch (err: any) {
      logger.error(err.message);
    }
  }
}