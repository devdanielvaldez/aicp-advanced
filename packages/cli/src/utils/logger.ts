import chalk from 'chalk';

export const logger = {
  info: (msg: string) => console.log(chalk.blue('ℹ') + ' ' + msg),
  success: (msg: string) => console.log(chalk.green('✓') + ' ' + msg),
  error: (msg: string) => console.log(chalk.red('✗') + ' ' + msg),
  warn: (msg: string) => console.log(chalk.yellow('⚠') + ' ' + msg),
  title: (msg: string) => console.log(chalk.bold.cyan('\n' + msg + '\n')),
  table: (data: any[]) => console.table(data),
};
