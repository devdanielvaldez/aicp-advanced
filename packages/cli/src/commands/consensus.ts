import { loadConfig } from '../config/manager.js';
import { OllamaClient } from '../ollama/client.js';
import { logger } from '../utils/logger.js';
import chalk from 'chalk';
import { ReputationManager } from '@aicp/core';
import { DebateState } from '../debate/types.js';
import { hr } from '../debate/utils.js';
import { warmupModels, runProposalPhase, runArgumentRebuttalRounds, runVotingPhase, runSynthesisPhase, runSelfEvaluationPhase } from '../debate/phases.js';
import { startGraphServer, emitGraphEvent, closeGraphServer } from '../debate/graph-server.js';
import { showResourceReport, setProcessPriority, optimizeOllamaEnv } from '../debate/resource-manager.js';
import { retrieveContext, storeMemory } from '../debate/memory.js';

export async function consensusCommand(prompt: string, options: any): Promise<string> {
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

    const silent = options.silent === true || options.silent === 'true';
    if (silent) {
        (global as any).__AICP_SILENT = true;
        console.log = () => {};
        console.error = () => {};
        logger.info = () => {};
        logger.success = () => {};
        logger.warn = () => {};
        logger.error = () => {};
    } else {
        (global as any).__AICP_SILENT = false;
    }

    (global as any).__AICP_TOKEN_OVERRIDES = {
        proposal: options.proposalTokens ?? (global as any).__AICP_TOKEN_OVERRIDES?.proposal,
        argument: options.argumentTokens ?? (global as any).__AICP_TOKEN_OVERRIDES?.argument,
        rebuttal: options.rebuttalTokens ?? (global as any).__AICP_TOKEN_OVERRIDES?.rebuttal,
        vote: options.voteTokens ?? (global as any).__AICP_TOKEN_OVERRIDES?.vote,
        synthesis: options.synthesisTokens ?? (global as any).__AICP_TOKEN_OVERRIDES?.synthesis,
    };
    if (options.temperature !== undefined) (global as any).__AICP_TEMPERATURE_OVERRIDE = options.temperature;
    if (options.voteTemperature !== undefined) (global as any).__AICP_VOTE_TEMPERATURE_OVERRIDE = options.voteTemperature;
    if (options.energyPenaltyFactor !== undefined) (global as any).__AICP_ENERGY_PENALTY_OVERRIDE = options.energyPenaltyFactor;
    if (options.accuracyReward !== undefined) (global as any).__AICP_ACCURACY_REWARD_OVERRIDE = options.accuracyReward;

    const repManager = new ReputationManager();
    
    for (const modelId of configuredModels) {
        const currentScore = repManager.getScore(modelId);
        if (currentScore < 0.01) {
            repManager.update(modelId, { accuracyDelta: 0, honestyDelta: 0, energyDelta: 0 });
        }
    }

    const debateRounds = Math.max(1, parseInt(options.rounds) || 2);
    const interactive = options.interactive === true || options.interactive === 'true';
    const enableGraph = options.graph === true || options.graph === 'true';
    const turboMode = options.turbo === true || options.turbo === 'true';
    const selfEval = options.selfEval === true || options.selfEval === 'true';
    const enableMemory = options.memory === true || options.memory === 'true';

    if (!silent) {
        if (turboMode) {
            logger.info('Turbo mode enabled – optimizing system resources...');
            await showResourceReport();
            optimizeOllamaEnv();
            setProcessPriority();
        } else {
            await showResourceReport();
        }
    }

    if (enableGraph && !silent) {
        startGraphServer(8080);
        (global as any).__graphEnabled = true;
        emitGraphEvent({ type: 'status', message: 'Warming up models...' });
        emitGraphEvent({ type: 'models_selected', models: configuredModels });
    }

    let memoryContext = '';
    if (enableMemory) {
        if (!silent) logger.info('Retrieving relevant past debates from memory...');
        try {
            const chunks = await retrieveContext(ollama, prompt, 3);
            if (chunks.length > 0) {
                memoryContext = '\n\n[Relevant information from previous debates]:\n' + chunks.join('\n');
                if (!silent) logger.info(`Found ${chunks.length} relevant memory chunks.`);
            }
        } catch (err: any) {
            if (!silent) logger.warn(`Memory retrieval failed: ${err.message}. Continuing without context.`);
        }
    }

    const state: DebateState = {
        topic: prompt,
        messages: [],
        proposals: new Map(),
        votes: [],
        winner: null,
        finalAnswer: '',
    };

    if (!silent) {
        console.log(chalk.bold('\n' + hr('═', 60)));
        console.log(chalk.bold.white('  STRUCTURED MODEL DEBATE (STREAMING)'));
        console.log(chalk.bold(hr('═', 60)));
        console.log(chalk.cyan(`  Topic: "${prompt}"`));
        if (enableMemory && memoryContext) console.log(chalk.gray(`  Memory context: ${memoryContext.length > 80 ? memoryContext.substring(0, 80) + '…' : memoryContext}`));
        console.log(chalk.gray(`  Configured models: ${configuredModels.join(', ')}`));
        console.log(chalk.gray(`  Debate rounds: ${debateRounds}`));
        console.log(chalk.bold(hr('═', 60)) + '\n');
    }

    let activeModels = await warmupModels(ollama, configuredModels);
    if (activeModels.length < 2) {
        if (!silent) console.log(chalk.red('Not enough fast models to run a debate (need at least 2).'));
        if (enableGraph && !silent) closeGraphServer();
        process.exit(1);
    }

    if (enableGraph && !silent) {
        emitGraphEvent({ type: 'status', message: 'Proposals phase...' });
    }

    const augmentedPrompt = memoryContext ? `${memoryContext}\n\n---\n\n${prompt}` : prompt;
    activeModels = await runProposalPhase(ollama, augmentedPrompt, activeModels, state, repManager);
    if (activeModels.length < 2) {
        if (!silent) console.log(chalk.red('\nNot enough models responded. Aborting.'));
        if (enableGraph && !silent) closeGraphServer();
        process.exit(1);
    }

    if (enableGraph && !silent) {
        emitGraphEvent({ type: 'status', message: 'Argument & rebuttal phases...' });
    }

    activeModels = await runArgumentRebuttalRounds(ollama, prompt, debateRounds, activeModels, state, repManager, interactive);
    if (activeModels.length < 2) {
        if (!silent) console.log(chalk.red('\nNot enough models to vote. Using best reputation model as fallback.'));
        let best = configuredModels[0];
        let bestScore = repManager.getScore(best);
        for (const m of configuredModels.slice(1)) {
            const s = repManager.getScore(m);
            if (s > bestScore) { bestScore = s; best = m; }
        }
        const resp = await ollama.chat(best, [{ role: 'user', content: prompt }], 600, 0.2);
        const finalAnswerText = resp.content;
        if (!silent) {
            console.log(chalk.bold.green(`\n═══════════════════════════════════════`));
            console.log(chalk.bold.green(`FINAL ANSWER (fallback)`));
            console.log(chalk.bold.green(`═══════════════════════════════════════`));
            console.log(`\n${finalAnswerText}\n`);
        }
        if (enableGraph && !silent) closeGraphServer();
        return finalAnswerText;
    }

    const finalPositions = activeModels
        .map(modelId => {
            const msgs = state.messages.filter(m => m.modelId === modelId);
            const last = msgs[msgs.length-1]?.content ?? state.proposals.get(modelId) ?? '[no position]';
            const truncated = last.length > 300 ? last.substring(0, 300) + '…' : last;
            return `=== ${modelId} ===\n${truncated}`;
        })
        .join('\n\n');

    if (enableGraph && !silent) {
        emitGraphEvent({ type: 'status', message: 'Voting phase...' });
    }

    const { winner, voteTally } = await runVotingPhase(ollama, prompt, debateRounds, activeModels, state, repManager);

    if (enableGraph && !silent) {
        for (const vote of state.votes) {
            emitGraphEvent({
                type: 'vote',
                voter: vote.voter,
                nominee: vote.nominee,
                confidence: vote.confidence,
            });
        }
        emitGraphEvent({ type: 'winner', winner });
    }

    await runSynthesisPhase(ollama, prompt, winner, debateRounds, activeModels, voteTally.get(winner) || 0, state, finalPositions);

    if (selfEval && !silent) {
        const finalAnswer = state.finalAnswer;
        await runSelfEvaluationPhase(ollama, prompt, activeModels, state, finalAnswer, repManager);
    }

    if (enableMemory && state.finalAnswer && !silent) {
        try {
            await storeMemory(ollama, prompt, state.finalAnswer, winner);
            logger.success('Debate stored in long-term memory.');
        } catch (err: any) {
            logger.warn(`Failed to store memory: ${err.message}`);
        }
    }

    if (!silent) {
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

    if (enableGraph && !silent) {
        setTimeout(() => closeGraphServer(), 3000);
        delete (global as any).__graphEnabled;
    }

    delete (global as any).__AICP_SILENT;
    if (!silent && Object.keys((global as any).__AICP_TOKEN_OVERRIDES || {}).length === 0) {
        delete (global as any).__AICP_TOKEN_OVERRIDES;
    }

    return state.finalAnswer;
}