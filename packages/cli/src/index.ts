#!/usr/bin/env node

import chalk from 'chalk';
import select from '@inquirer/select';
import input from '@inquirer/input';
import number from '@inquirer/number';
import { listModelsCommand } from './commands/list.js';
import { selectModelsCommand } from './commands/select.js';
import { consensusCommand } from './commands/consensus.js';
import { loadConfig } from './config/manager.js';

const logo = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   █████╗ ██╗ ██████╗██████╗     ██████╗ ███████╗██████╗      ║
║  ██╔══██╗██║██╔════╝██╔══██╗    ██╔══██╗██╔════╝██╔══██╗     ║
║  ███████║██║██║     ██████╔╝    ██████╔╝█████╗  ██████╔╝     ║
║  ██╔══██║██║██║     ██╔══██╗    ██╔══██╗██╔══╝  ██╔══██╗     ║
║  ██║  ██║██║╚██████╗██║  ██║    ██████╔╝███████╗██║  ██║     ║
║  ╚═╝  ╚═╝╚═╝ ╚═════╝╚═╝  ╚═╝    ╚═════╝ ╚══════╝╚═╝  ╚═╝     ║
║                                                              ║
║         AI Consensus Protocol - Advanced Debate CLI          ║
║                     Version 1.0.0                            ║
╚══════════════════════════════════════════════════════════════╝
`;

async function showSelectedModels(): Promise<void> {
    const config = await loadConfig();
    const selected = config.selectedModels;
    if (selected.length === 0) {
        console.log(chalk.yellow('\n  No models selected. Use option 2 to select models.\n'));
    } else {
        console.log(chalk.green('\n  Currently selected models:'));
        selected.forEach(m => console.log(`    • ${m}`));
        console.log('');
    }
}

async function mainMenu() {
    console.log(chalk.cyan(logo));
    console.log(chalk.gray('  ⚡ Lightning-fast structured debates between local LLMs\n'));

    const action = await select({
        message: 'What would you like to do?',
        choices: [
            { name: '📋 List installed models', value: 'list' },
            { name: '🎯 Select models for debate', value: 'select' },
            { name: '👁️  Show selected models', value: 'showSelected' },
            { name: '💬 Start a debate (normal)', value: 'debate' },
            { name: '🚀 Start a debate (normal + turbo)', value: 'debateTurbo' },
            { name: '📊 Start a debate (normal + graph)', value: 'debateGraph' },
            { name: '📊🚀 Start a debate (normal + graph + turbo)', value: 'debateGraphTurbo' },
            { name: '🎮 Start a debate (interactive)', value: 'debateInteractive' },
            { name: '🎮🚀 Start a debate (interactive + turbo)', value: 'debateInteractiveTurbo' },
            { name: '📊🎮 Start a debate (interactive + graph)', value: 'debateInteractiveGraph' },
            { name: '📊🎮🚀 Start a debate (interactive + graph + turbo)', value: 'debateInteractiveGraphTurbo' },
            { name: '❌ Exit', value: 'exit' },
        ],
        pageSize: 15,
    });

    switch (action) {
        case 'list':
            await listModelsCommand();
            break;
        case 'select':
            await selectModelsCommand();
            break;
        case 'showSelected':
            await showSelectedModels();
            break;
        case 'debate':
            const promptText = await input({
                message: 'Enter your question or topic for debate:',
                validate: (input: string) => input.trim().length > 0 ? true : 'Prompt cannot be empty',
            });
            const rounds = await number({
                message: 'Number of debate rounds (1-5):',
                default: 2,
                min: 1,
                max: 5,
                step: 1,
            });
            await consensusCommand(promptText, { rounds: rounds ?? 2, interactive: false, graph: false, turbo: false });
            break;
        case 'debateTurbo':
            const promptTextT = await input({
                message: 'Enter your question or topic for debate:',
                validate: (input: string) => input.trim().length > 0 ? true : 'Prompt cannot be empty',
            });
            const roundsT = await number({
                message: 'Number of debate rounds (1-5):',
                default: 2,
                min: 1,
                max: 5,
                step: 1,
            });
            await consensusCommand(promptTextT, { rounds: roundsT ?? 2, interactive: false, graph: false, turbo: true });
            break;
        case 'debateGraph':
            const promptTextG = await input({
                message: 'Enter your question or topic for debate:',
                validate: (input: string) => input.trim().length > 0 ? true : 'Prompt cannot be empty',
            });
            const roundsG = await number({
                message: 'Number of debate rounds (1-5):',
                default: 2,
                min: 1,
                max: 5,
                step: 1,
            });
            await consensusCommand(promptTextG, { rounds: roundsG ?? 2, interactive: false, graph: true, turbo: false });
            break;
        case 'debateGraphTurbo':
            const promptTextGT = await input({
                message: 'Enter your question or topic for debate:',
                validate: (input: string) => input.trim().length > 0 ? true : 'Prompt cannot be empty',
            });
            const roundsGT = await number({
                message: 'Number of debate rounds (1-5):',
                default: 2,
                min: 1,
                max: 5,
                step: 1,
            });
            await consensusCommand(promptTextGT, { rounds: roundsGT ?? 2, interactive: false, graph: true, turbo: true });
            break;
        case 'debateInteractive':
            const promptTextI = await input({
                message: 'Enter your question or topic for debate:',
                validate: (input: string) => input.trim().length > 0 ? true : 'Prompt cannot be empty',
            });
            const roundsI = await number({
                message: 'Number of debate rounds (1-5):',
                default: 2,
                min: 1,
                max: 5,
                step: 1,
            });
            await consensusCommand(promptTextI, { rounds: roundsI ?? 2, interactive: true, graph: false, turbo: false });
            break;
        case 'debateInteractiveTurbo':
            const promptTextIT = await input({
                message: 'Enter your question or topic for debate:',
                validate: (input: string) => input.trim().length > 0 ? true : 'Prompt cannot be empty',
            });
            const roundsIT = await number({
                message: 'Number of debate rounds (1-5):',
                default: 2,
                min: 1,
                max: 5,
                step: 1,
            });
            await consensusCommand(promptTextIT, { rounds: roundsIT ?? 2, interactive: true, graph: false, turbo: true });
            break;
        case 'debateInteractiveGraph':
            const promptTextIG = await input({
                message: 'Enter your question or topic for debate:',
                validate: (input: string) => input.trim().length > 0 ? true : 'Prompt cannot be empty',
            });
            const roundsIG = await number({
                message: 'Number of debate rounds (1-5):',
                default: 2,
                min: 1,
                max: 5,
                step: 1,
            });
            await consensusCommand(promptTextIG, { rounds: roundsIG ?? 2, interactive: true, graph: true, turbo: false });
            break;
        case 'debateInteractiveGraphTurbo':
            const promptTextIGT = await input({
                message: 'Enter your question or topic for debate:',
                validate: (input: string) => input.trim().length > 0 ? true : 'Prompt cannot be empty',
            });
            const roundsIGT = await number({
                message: 'Number of debate rounds (1-5):',
                default: 2,
                min: 1,
                max: 5,
                step: 1,
            });
            await consensusCommand(promptTextIGT, { rounds: roundsIGT ?? 2, interactive: true, graph: true, turbo: true });
            break;
        case 'exit':
            console.log(chalk.green('\n  Thank you for using AICP. Goodbye!\n'));
            process.exit(0);
    }

    await mainMenu();
}

mainMenu().catch(err => {
    console.error(chalk.red('Fatal error:'), err);
    process.exit(1);
});