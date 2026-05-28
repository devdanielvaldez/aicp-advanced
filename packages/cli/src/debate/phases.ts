import { OllamaClient } from '../ollama/client.js';
import { ReputationManager } from '@aicp/core';
import ora from 'ora';
import chalk from 'chalk';
import { TOKENS, SLOW_MODEL_THRESHOLD_MS } from './config.js';
import { printMessage, parseVote, hr } from './utils.js';
import { buildProposalPrompt, buildArgumentPrompt, buildRebuttalPrompt, buildVotePrompt, buildSynthesisPrompt, buildSelfEvaluationPrompt } from './prompts.js';
import { callModelStreaming, callModelStreamingVote, callModel } from './llm-calls.js';
import { DebateState, ModelMessage, Vote } from './types.js';
import { chooseFocus } from './interactive.js';
import { emitGraphEvent } from './graph-server.js';

export async function warmupModels(
    ollama: OllamaClient,
    models: string[]
): Promise<string[]> {
    console.log(chalk.gray(`  Warming up ${models.length} model(s) in parallel...`));
    console.log(chalk.gray(`  Slow model threshold: ${SLOW_MODEL_THRESHOLD_MS / 1000}s\n`));

    const warmupResults = await Promise.all(
        models.map(async (modelId) => {
            const start = Date.now();
            try {
                await ollama.chat(
                    modelId,
                    [{ role: 'user', content: 'Hi' }],
                    TOKENS.warmup,
                    0.1
                );
                const latencyMs = Date.now() - start;
                return { modelId, latencyMs, ok: true };
            } catch (err: any) {
                const latencyMs = Date.now() - start;
                return { modelId, latencyMs, ok: false, error: err.message };
            }
        })
    );

    const ready: string[] = [];
    const skipped: string[] = [];

    for (const result of warmupResults) {
        if (!result.ok) {
            console.log(chalk.red(`  ✗ ${result.modelId} — warmup error: ${result.error}`));
            skipped.push(result.modelId);
        } else if (result.latencyMs > SLOW_MODEL_THRESHOLD_MS) {
            console.log(chalk.yellow(`  ⚠ ${result.modelId} — too slow (${(result.latencyMs / 1000).toFixed(1)}s > ${SLOW_MODEL_THRESHOLD_MS / 1000}s), excluded`));
            skipped.push(result.modelId);
        } else {
            console.log(chalk.gray(`  ✓ ${result.modelId} ready (${(result.latencyMs / 1000).toFixed(1)}s)`));
            ready.push(result.modelId);
        }
    }

    if (skipped.length) {
        console.log(chalk.yellow(`\n  Excluded: ${skipped.join(', ')}`));
    }
    console.log(chalk.green(`\n  Active models: ${ready.join(', ')}\n`));
    return ready;
}

export async function runProposalPhase(
    ollama: OllamaClient,
    prompt: string,
    activeModels: string[],
    state: DebateState,
    repManager: ReputationManager
): Promise<string[]> {
    console.log(chalk.bold.yellow('\n' + hr('─', 60)));
    console.log(chalk.bold.yellow('  PHASE 1 — INITIAL PROPOSALS'));
    console.log(chalk.bold.yellow(hr('─', 60)));

    const newActiveModels: string[] = [];
    for (const modelId of activeModels) {
        const start = Date.now();
        let streamOutput = '';
        const spinner = ora({ text: `${modelId} drafting proposal...`, color: 'cyan' }).start();

        if ((global as any).__graphEnabled) {
            emitGraphEvent({
                type: 'model_speaking',
                modelId,
                phase: 'proposal',
                targetModels: []
            });
        }

        const onStream = (chunk: string, full: string) => {
            if (streamOutput === '') {
                spinner.stop();
                console.log(chalk.green(`[${modelId}] streaming:`));
                process.stdout.write(chalk.cyan(chunk));
            } else {
                process.stdout.write(chalk.cyan(chunk));
            }
            streamOutput = full;
        };

        const content = await callModelStreaming(
            ollama,
            modelId,
            'You are a precise and analytical expert. Be concise.',
            buildProposalPrompt(prompt),
            TOKENS.proposal,
            0.3,
            'proposal',
            onStream
        );

        const latency = Date.now() - start;
        spinner.stop();

        if (content === '[NO_RESPONSE]') {
            console.log(chalk.red(`\n  ✗ ${modelId} failed to respond (${latency}ms) – excluding from debate`));
            continue;
        }
        console.log('\n' + chalk.gray(`  (${latency}ms)`));
        state.proposals.set(modelId, content);
        state.messages.push({ modelId, role: 'proposal', content, round: 0, timestamp: Date.now() });
        repManager.update(modelId, { energyDelta: -Math.min(0.1, latency / 10000) });
        newActiveModels.push(modelId);
    }
    return newActiveModels;
}

export async function runArgumentRebuttalRounds(
    ollama: OllamaClient,
    prompt: string,
    debateRounds: number,
    activeModels: string[],
    state: DebateState,
    repManager: ReputationManager,
    interactive = false
): Promise<string[]> {
    let currentModels = [...activeModels];
    for (let round = 1; round <= debateRounds; round++) {
        const phase = round === 1 ? 'argument' : 'rebuttal';
        const phaseLabel = round === 1 ? 'ARGUMENTS' : `REBUTTAL ROUND ${round - 1}`;
        const phaseTokens = phase === 'argument' ? TOKENS.argument : TOKENS.rebuttal;

        console.log(chalk.bold.yellow('\n' + hr('─', 60)));
        console.log(chalk.bold.yellow(`  PHASE ${round + 1} — ${phaseLabel}`));
        console.log(chalk.bold.yellow(hr('─', 60)));

        const lastMessagePerModel = new Map<string, string>();
        for (const modelId of currentModels) {
            const msgs = state.messages.filter(m => m.modelId === modelId);
            if (msgs.length) lastMessagePerModel.set(modelId, msgs[msgs.length-1].content);
        }

        let focusModel: string | null = null;
        if (interactive && phase === 'argument') {
            console.log(chalk.bold.blue('\n📢 INTERACTIVE MODE – Select which answer to debate\n'));
            const answers: { modelId: string; answer: string }[] = currentModels.map(modelId => ({
                modelId,
                answer: lastMessagePerModel.get(modelId) ?? state.proposals.get(modelId) ?? '',
            }));
            const chosen = await chooseFocus(answers, true, true);
            if (chosen === 'all') {
                console.log(chalk.green('  👥 Will debate ALL answers (full round)'));
                focusModel = null;
            } else if (chosen === 'random') {
                console.log(chalk.green(`  🎲 Will focus on a randomly chosen answer`));
                focusModel = null;
            } else {
                focusModel = chosen;
                console.log(chalk.green(`  🎯 Focusing debate on answer from ${focusModel}`));
            }
        }

        const roundActiveModels: string[] = [];
        for (const modelId of currentModels) {
            const start = Date.now();
            let streamOutput = '';
            const spinner = ora({ text: `${modelId} composing ${phase}...`, color: 'yellow' }).start();

            const ownLast = lastMessagePerModel.get(modelId) ?? state.proposals.get(modelId) ?? '';

            let othersList = currentModels.filter(m => m !== modelId);
            if (focusModel && focusModel !== modelId) {
                othersList = [focusModel];
            }
            const othersText = othersList
                .map(m => {
                    const last = lastMessagePerModel.get(m) ?? state.proposals.get(m) ?? '[no position]';
                    return `=== ${m} ===\n${last}`;
                })
                .join('\n\n');

            if ((global as any).__graphEnabled) {
                emitGraphEvent({
                    type: 'model_speaking',
                    modelId,
                    phase: phase,
                    targetModels: othersList
                });
            }

            if (othersList.length === 1 && focusModel) {
                console.log(chalk.blue(`\n📢 ${modelId} is now responding to ${focusModel}\n`));
            } else if (othersList.length > 0) {
                console.log(chalk.blue(`\n📢 ${modelId} is now responding to all other models\n`));
            }

            const userPrompt = phase === 'argument'
                ? buildArgumentPrompt(prompt, ownLast, othersText)
                : buildRebuttalPrompt(prompt, ownLast, othersText);

            const onStream = (chunk: string, full: string) => {
                if (streamOutput === '') {
                    spinner.stop();
                    console.log(chalk.green(`[${modelId}] streaming:`));
                    process.stdout.write(chalk.yellow(chunk));
                } else {
                    process.stdout.write(chalk.yellow(chunk));
                }
                streamOutput = full;
            };

            const content = await callModelStreaming(
                ollama,
                modelId,
                'You are a rigorous debate participant. Be analytical and direct.',
                userPrompt,
                phaseTokens,
                0.4,
                phase,
                onStream
            );

            const latency = Date.now() - start;
            spinner.stop();

            if (content === '[NO_RESPONSE]') {
                console.log(chalk.red(`\n  ✗ ${modelId} failed to respond (${latency}ms) – excluding from debate`));
                continue;
            }
            console.log('\n' + chalk.gray(`  (${latency}ms)`));
            const msg: ModelMessage = { modelId, role: phase as ModelMessage['role'], content, round, timestamp: Date.now() };
            state.messages.push(msg);
            repManager.update(modelId, { energyDelta: -Math.min(0.1, latency / 10000) });
            roundActiveModels.push(modelId);
        }
        currentModels = roundActiveModels;
        if (currentModels.length < 2) {
            console.log(chalk.red('\nToo few models remaining after this round. Aborting debate.'));
            break;
        }
    }
    return currentModels;
}

export async function runVotingPhase(
    ollama: OllamaClient,
    prompt: string,
    debateRounds: number,
    activeModels: string[],
    state: DebateState,
    repManager: ReputationManager
): Promise<{ winner: string; voteTally: Map<string, number> }> {
    console.log(chalk.bold.magenta('\n' + hr('─', 60)));
    console.log(chalk.bold.magenta(`  PHASE ${debateRounds + 2} — VOTING (STREAMING)`));
    console.log(chalk.bold.magenta(hr('─', 60)));

    const finalPositions = activeModels
        .map(modelId => {
            const msgs = state.messages.filter(m => m.modelId === modelId);
            const last = msgs[msgs.length-1]?.content ?? state.proposals.get(modelId) ?? '[no position]';
            const truncated = last.length > 300 ? last.substring(0, 300) + '…' : last;
            return `=== ${modelId} ===\n${truncated}`;
        })
        .join('\n\n');

    const voteTally = new Map<string, number>();
    activeModels.forEach(m => voteTally.set(m, 0));

    for (const voterModel of activeModels) {
        const candidateModels = activeModels.filter(m => m !== voterModel);
        if (candidateModels.length === 0) continue;

        console.log(chalk.white(`\n${voterModel} is voting...`));

        let rawVote = '[NO_RESPONSE]';
        let success = false;

        for (let attempt = 1; attempt <= 3; attempt++) {
            rawVote = await callModelStreamingVote(
                ollama,
                voterModel,
                'You are an objective judge. Follow the format exactly. Do not vote for yourself.',
                buildVotePrompt(prompt, finalPositions, activeModels, voterModel),
                TOKENS.vote,
                0.01,
                1
            );
            const parsed = parseVote(rawVote, candidateModels, voterModel);
            if (parsed) {
                success = true;
                const vote: Vote = { voter: voterModel, ...parsed };
                state.votes.push(vote);
                voteTally.set(vote.nominee, (voteTally.get(vote.nominee) ?? 0) + 1);
                state.messages.push({
                    modelId: voterModel,
                    role: 'vote',
                    content: `Votes for: ${vote.nominee}\nReason: ${vote.reason}\nConfidence: ${vote.confidence}`,
                    round: debateRounds + 1,
                    timestamp: Date.now(),
                });
                console.log(
                    chalk.magenta(`  ${voterModel}`) +
                    chalk.white(' → ') +
                    chalk.bold.green(vote.nominee) +
                    chalk.gray(` (confidence: ${vote.confidence.toFixed(2)})`) +
                    chalk.gray(`\n    "${vote.reason.substring(0, 120)}"`)
                );
                break;
            }
            console.log(chalk.yellow(`  Attempt ${attempt}/3 failed for ${voterModel}, retrying...`));
        }

        if (!success) {
            const randomIndex = Math.floor(Math.random() * candidateModels.length);
            const fallbackNominee = candidateModels[randomIndex];
            console.log(chalk.yellow(`  ⚠ ${voterModel} failed to vote after retries. Assigning random vote to ${fallbackNominee}.`));
            const fallbackVote: Vote = {
                voter: voterModel,
                nominee: fallbackNominee,
                reason: '[Fallback due to parsing failure]',
                confidence: 0.0,
            };
            state.votes.push(fallbackVote);
            voteTally.set(fallbackNominee, (voteTally.get(fallbackNominee) ?? 0) + 1);
            state.messages.push({
                modelId: voterModel,
                role: 'vote',
                content: `Votes for: ${fallbackNominee}\nReason: Fallback\nConfidence: 0.0`,
                round: debateRounds + 1,
                timestamp: Date.now(),
            });
            console.log(
                chalk.magenta(`  ${voterModel}`) +
                chalk.white(' → ') +
                chalk.bold.green(fallbackNominee) +
                chalk.gray(` (fallback random vote)`)
            );
        }
    }

    console.log(chalk.bold.magenta('\n  VOTE RESULTS:'));
    let topVotes = 0;
    let winner = activeModels[0];
    const sortedTally = [...voteTally.entries()].sort((a, b) => b[1] - a[1]);
    for (const [modelId, count] of sortedTally) {
        const filled = Math.max(0, count);
        const empty = Math.max(0, activeModels.length - 1 - count);
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        if (count > topVotes) { topVotes = count; winner = modelId; }
        const line = `  ${bar} ${modelId}: ${count} vote(s)`;
        console.log(count === topVotes ? chalk.bold.green(line) : chalk.gray(line));
    }

    const tiedModels = sortedTally.filter(([, c]) => c === topVotes).map(([m]) => m);
    if (tiedModels.length > 1) {
        console.log(chalk.yellow(`\n  Tie between: ${tiedModels.join(', ')}. Breaking by reputation.`));
        let bestRep = -Infinity;
        for (const m of tiedModels) {
            const s = repManager.getScore(m);
            if (s > bestRep) { bestRep = s; winner = m; }
        }
        console.log(chalk.yellow(`  Tiebreak winner: ${winner} (rep: ${repManager.getScore(winner).toFixed(3)})`));
    }

    for (const [modelId, count] of voteTally.entries()) {
        const relScore = activeModels.length > 1 ? (count / (activeModels.length - 1)) - 0.5 : 0;
        repManager.update(modelId, { accuracyDelta: relScore * 0.2, honestyDelta: 0 });
    }
    console.log(chalk.bold.green(`\n  🏆 WINNER: ${winner} with ${topVotes} vote(s)\n`));
    return { winner, voteTally };
}

export async function runSynthesisPhase(
    ollama: OllamaClient,
    prompt: string,
    winner: string,
    debateRounds: number,
    activeModels: string[],
    topVotes: number,
    state: DebateState,
    finalPositions: string
): Promise<string> {
    console.log(chalk.bold.blue('\n' + hr('─', 60)));
    console.log(chalk.bold.blue('  PHASE — SYNTHESIS'));
    console.log(chalk.bold.blue(hr('─', 60)));

    const winnerMsgs = state.messages.filter(m => m.modelId === winner);
    const winnerFinalPosition = winnerMsgs[winnerMsgs.length-1]?.content ?? state.proposals.get(winner) ?? 'No position found.';

    const spinnerSynth = ora({ text: `${winner} writing final answer...`, color: 'blue' }).start();
    const synthesisStart = Date.now();

    let finalAnswerText = await callModel(
        ollama,
        winner,
        'You are an expert communicator. Write a clear, concise answer for the user (max 250 words).',
        buildSynthesisPrompt(prompt, winnerFinalPosition, finalPositions, topVotes, activeModels.length),
        TOKENS.synthesis,
        0.3
    );

    spinnerSynth.stop();
    const synthesisLatency = Date.now() - synthesisStart;

    if (finalAnswerText === '[NO_RESPONSE]') {
        finalAnswerText = winnerFinalPosition;
        console.log(chalk.yellow("  (Synthesis failed — using winner's last position as fallback)"));
    }

    state.finalAnswer = finalAnswerText;
    state.messages.push({
        modelId: winner,
        role: 'synthesis',
        content: finalAnswerText,
        round: debateRounds + 2,
        timestamp: Date.now(),
    });

    console.log('\n' + chalk.bold.green(hr('═', 60)));
    console.log(chalk.bold.green('  FINAL ANSWER'));
    console.log(chalk.bold.green(`  (by ${winner} · ${topVotes}/${activeModels.length - 1} votes · ${synthesisLatency}ms)`));
    console.log(chalk.bold.green(hr('═', 60)));
    console.log(`\n${finalAnswerText}\n`);
    console.log(chalk.bold.green(hr('═', 60) + '\n'));

    return finalAnswerText;
}

export async function runSelfEvaluationPhase(
    ollama: OllamaClient,
    prompt: string,
    activeModels: string[],
    state: DebateState,
    finalAnswer: string,
    repManager: ReputationManager
): Promise<void> {
    console.log(chalk.bold.blue('\n' + hr('─', 60)));
    console.log(chalk.bold.blue('  PHASE — SELF EVALUATION'));
    console.log(chalk.bold.blue(hr('─', 60)));

    const debateSummaryLines: string[] = [];
    for (const modelId of activeModels) {
        const msgs = state.messages.filter(m => m.modelId === modelId);
        if (msgs.length) {
            const lastMsg = msgs[msgs.length-1];
            debateSummaryLines.push(`[${modelId}]: ${lastMsg.content.substring(0, 200)}`);
        }
    }
    const debateSummary = debateSummaryLines.join('\n');

    for (const modelId of activeModels) {
        const myAnswer = state.proposals.get(modelId) ?? state.messages.filter(m => m.modelId === modelId).pop()?.content ?? '[no answer]';
        const evalPrompt = buildSelfEvaluationPrompt(prompt, myAnswer, debateSummary, finalAnswer);

        const spinner = ora({ text: `${modelId} evaluating itself...`, color: 'cyan' }).start();
        const start = Date.now();
        const rawEval = await callModel(
            ollama,
            modelId,
            'You are a strict but fair evaluator. Output only numbers in the required format.',
            evalPrompt,
            150,
            0.2,
            2
        );
        const latency = Date.now() - start;
        spinner.stop();

        const accuracyMatch = rawEval.match(/ACCURACY:\s*([\d.]+)/i);
        const honestyMatch = rawEval.match(/HONESTY:\s*([\d.]+)/i);
        const clarityMatch = rawEval.match(/CLARITY:\s*([\d.]+)/i);
        const confidenceMatch = rawEval.match(/CONFIDENCE:\s*([\d.]+)/i);

        const accuracy = accuracyMatch ? Math.min(1, Math.max(0, parseFloat(accuracyMatch[1]))) : 0.5;
        const honesty = honestyMatch ? Math.min(1, Math.max(0, parseFloat(honestyMatch[1]))) : 0.5;
        const clarity = clarityMatch ? Math.min(1, Math.max(0, parseFloat(clarityMatch[1]))) : 0.5;
        const selfConfidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.5;

        const accuracyDelta = (accuracy - 0.5) * 0.2;
        const honestyDelta = (honesty - 0.5) * 0.15;
        const clarityDelta = (clarity - 0.5) * 0.05;
        repManager.update(modelId, {
            accuracyDelta: accuracyDelta,
            honestyDelta: honestyDelta + clarityDelta,
            energyDelta: 0
        });

        console.log(chalk.green(`  ✅ ${modelId} self-evaluation:`));
        console.log(chalk.gray(`     Accuracy: ${accuracy.toFixed(2)} | Honesty: ${honesty.toFixed(2)} | Clarity: ${clarity.toFixed(2)} | Confidence: ${selfConfidence.toFixed(2)}`));
        console.log(chalk.gray(`     Reputation update: +${(accuracyDelta + honestyDelta + clarityDelta).toFixed(3)}`));
    }
}