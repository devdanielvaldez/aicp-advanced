import { loadConfig } from '../config/manager.js';
import { OllamaClient } from '../ollama/client.js';
import { logger } from '../utils/logger.js';
import chalk from 'chalk';
import { ReputationManager } from '@aicp/core';
import { DebateState } from '../debate/types.js';
import { hr } from '../debate/utils.js';
import { warmupModels, runProposalPhase, runArgumentRebuttalRounds, runVotingPhase, runSynthesisPhase } from '../debate/phases.js';

export async function consensusCommand(prompt: string, options: any) {
    const config = await loadConfig();
    const configuredModels: string[] = config.selectedModels;

    if (configuredModels.length === 0) {
        logger.error('No models selected. Run `aicp select` first.');
        process.exit(1);
    }

    const ollama = new OllamaClient();
    if (!(await ollama.isRunning())) {
        logger.error('Ollama is not running. Start it with `ollama serve`.');
        process.exit(1);
    }

    const repManager = new ReputationManager();
    const debateRounds = Math.max(1, parseInt(options.rounds) || 2);
    const state: DebateState = {
        topic: prompt,
        messages: [],
        proposals: new Map(),
        votes: [],
        winner: null,
        finalAnswer: '',
    };

    console.log(chalk.bold('\n' + hr('═', 60)));
    console.log(chalk.bold.white('  STRUCTURED MODEL DEBATE (STREAMING)'));
    console.log(chalk.bold(hr('═', 60)));
    console.log(chalk.cyan(`  Topic: "${prompt}"`));
    console.log(chalk.gray(`  Configured models: ${configuredModels.join(', ')}`));
    console.log(chalk.gray(`  Debate rounds: ${debateRounds}`));
    console.log(chalk.bold(hr('═', 60)) + '\n');

    let activeModels = await warmupModels(ollama, configuredModels);
    if (activeModels.length < 2) {
        console.log(chalk.red('Not enough fast models to run a debate (need at least 2).'));
        process.exit(1);
    }

    activeModels = await runProposalPhase(ollama, prompt, activeModels, state, repManager);
    if (activeModels.length < 2) {
        console.log(chalk.red('\nNot enough models responded. Aborting.'));
        process.exit(1);
    }

    activeModels = await runArgumentRebuttalRounds(ollama, prompt, debateRounds, activeModels, state, repManager);
    if (activeModels.length < 2) {
        console.log(chalk.red('\nNot enough models to vote. Using best reputation model as fallback.'));
        let best = configuredModels[0];
        let bestScore = repManager.getScore(best);
        for (const m of configuredModels.slice(1)) {
            const s = repManager.getScore(m);
            if (s > bestScore) { bestScore = s; best = m; }
        }
        const resp = await ollama.chat(best, [{ role: 'user', content: prompt }], 600, 0.2);
        const finalAnswerText = resp.content;
        console.log(chalk.bold.green(`\n═══════════════════════════════════════`));
        console.log(chalk.bold.green(`FINAL ANSWER (fallback)`));
        console.log(chalk.bold.green(`═══════════════════════════════════════`));
        console.log(`\n${finalAnswerText}\n`);
        return;
    }

    const finalPositions = activeModels
        .map(modelId => {
            const msgs = state.messages.filter(m => m.modelId === modelId);
            const last = msgs[msgs.length-1]?.content ?? state.proposals.get(modelId) ?? '[no position]';
            const truncated = last.length > 300 ? last.substring(0, 300) + '…' : last;
            return `=== ${modelId} ===\n${truncated}`;
        })
        .join('\n\n');

    const { winner, voteTally } = await runVotingPhase(ollama, prompt, debateRounds, activeModels, state, repManager);

    await runSynthesisPhase(ollama, prompt, winner, debateRounds, activeModels, voteTally.get(winner) || 0, state, finalPositions);

    logger.title('DEBATE SUMMARY');
    console.log(chalk.gray(`  Messages exchanged : ${state.messages.length}`));
    console.log(chalk.gray(`  Debate rounds      : ${debateRounds}`));
    console.log(chalk.gray(`  Active models      : ${activeModels.join(', ')}`));
    console.log(chalk.gray(`  Excluded models    : ${configuredModels.filter(m => !activeModels.includes(m)).join(', ') || 'none'}`));
    console.log(chalk.gray(`  Votes cast         : ${state.votes.length}`));

    logger.title('FINAL REPUTATIONS');
    for (const m of configuredModels) {
        const score = repManager.getScore(m).toFixed(3);
        const votes = voteTally.get(m) ?? 0;
        const active = activeModels.includes(m) ? '' : chalk.gray(' (excluded)');
        console.log(`  ${m}: score=${score}  votes_received=${votes}${active}`);
    }
}