#!/usr/bin/env node

export { consensusCommand } from './commands/consensus.js';
export { OllamaClient } from './ollama/client.js';
export { loadConfig, saveConfig } from './config/manager.js';
export { listModelsCommand } from './commands/list.js';
export { selectModelsCommand } from './commands/select.js';

import chalk from 'chalk';
import select from '@inquirer/select';
import input from '@inquirer/input';
import number from '@inquirer/number';
import confirm from '@inquirer/confirm';
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
║  ██╔══██║██║██║     ██╔         ██╔══██╗██╔══╝  ██╔══██╗     ║
║  ██║  ██║██║╚██████╗██║         ██████╔╝███████╗██║  ██║     ║
║  ╚═╝  ╚═╝╚═╝ ╚═════╝╚═╝         ╚═════╝ ╚══════╝╚═╝  ╚═╝     ║
║                                                              ║
║         AI Consensus Protocol - Advanced Debate CLI          ║
║                     Version 1.3.0                            ║
╚══════════════════════════════════════════════════════════════╝
`;

interface DebateOptions {
    interactive: boolean;
    graph: boolean;
    turbo: boolean;
    selfEval: boolean;
    memory: boolean;
}

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

async function getDebateInput(): Promise<{ prompt: string; rounds: number }> {
    const prompt = await input({
        message: 'Enter your question or topic for debate:',
        validate: (v: string) => v.trim().length > 0 ? true : 'Prompt cannot be empty',
    });
    const rounds = await number({
        message: 'Number of debate rounds (1-5):',
        default: 2,
        min: 1,
        max: 5,
        step: 1,
    });
    return { prompt, rounds: rounds ?? 2 };
}

async function debateModeMenu(): Promise<DebateOptions | null> {
    console.log(chalk.cyan('\n  Configure your debate mode:\n'));

    const mode = await select({
        message: 'Select debate mode:',
        choices: [
            { name: '💬  Standard     — models debate in sequence', value: 'standard' },
            { name: '🎮  Interactive  — you participate between rounds', value: 'interactive' },
            { name: '← Back', value: 'back' },
        ],
    });

    if (mode === 'back') return null;

    const speed = await select({
        message: 'Select processing speed:',
        choices: [
            { name: '🐢  Normal  — full responses, higher quality', value: 'normal' },
            { name: '🚀  Turbo   — faster, shorter responses', value: 'turbo' },
        ],
    });

    const extras = await select({
        message: 'Enable extra features:',
        choices: [
            { name: '⬜  None', value: 'none' },
            { name: '📊  Graph       — visualize argument relationships', value: 'graph' },
            { name: '📝  Self-Eval   — models evaluate their own responses', value: 'selfEval' },
            { name: '📊📝 Both', value: 'both' },
        ],
    });

    const useMemory = await confirm({
        message: 'Enable long‑term memory? (recalls past debates using RAG)',
        default: false,
    });

    return {
        interactive: mode === 'interactive',
        turbo: speed === 'turbo',
        graph: extras === 'graph' || extras === 'both',
        selfEval: extras === 'selfEval' || extras === 'both',
        memory: useMemory,
    };
}

async function modelsMenu(): Promise<void> {
    const action = await select({
        message: 'Models:',
        choices: [
            { name: '📋  List installed models', value: 'list' },
            { name: '🎯  Select models for debate', value: 'select' },
            { name: '👁️   Show selected models', value: 'show' },
            { name: '← Back', value: 'back' },
        ],
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

async function mainMenu(): Promise<void> {
    console.log(chalk.cyan(logo));
    console.log(chalk.gray('  ⚡ Lightning-fast structured debates between local LLMs\n'));

    const action = await select({
        message: 'What would you like to do?',
        choices: [
            { name: '💬  Start a debate', value: 'debate' },
            { name: '🤖  Manage models', value: 'models' },
            { name: '❌  Exit', value: 'exit' },
        ],
    });

    switch (action) {
        case 'debate': {
            const options = await debateModeMenu();
            if (options) {
                const { prompt, rounds } = await getDebateInput();
                await consensusCommand(prompt, { rounds, ...options });
            }
            break;
        }
        case 'models':
            await modelsMenu();
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