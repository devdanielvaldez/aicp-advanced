import { OllamaClient } from '../ollama/client.js';
import { ReputationManager } from '@aicp/core';
import { loadConfig, saveConfig } from '../config/manager.js';
import { startGraphServer, emitGraphEvent, closeGraphServer } from '../debate/graph-server.js';
import { showResourceReport, setProcessPriority, optimizeOllamaEnv } from '../debate/resource-manager.js';
import { warmupModels } from '../debate/phases.js';
import { DebateState, ModelMessage, Vote } from '../debate/types.js';
import { parseVote, hr } from '../debate/utils.js';
import { callModelStreaming, callModelStreamingVote, callModel } from '../debate/llm-calls.js';
import { chooseFocus } from '../debate/interactive.js';
import chalk from 'chalk';
import ora from 'ora';
import { Pool } from './types.js';
import { renderMarkdown } from '../utils/markdown-renderer.js';

const TOKEN_LIMITS = {
  proposal: 32768,
  argument: 32768,
  rebuttal: 32768,
  vote: 800,
  synthesis: 65536,
};

const NUM_CTX = 65536;

function isRefusal(content: string): boolean {
  const refusalPatterns = [
    /i can't provide/i,
    /i cannot provide/i,
    /i am unable to/i,
    /i cannot answer/i,
    /cannot engage in discussions/i,
    /inappropriate/i,
    /harmful or illegal/i,
  ];
  return refusalPatterns.some(p => p.test(content));
}

function buildCodeProposalPrompt(pool: Pool, userPrompt: string): string {
  let clarifiedPrompt = userPrompt;
  if (userPrompt.toLowerCase().includes('itbis')) {
    clarifiedPrompt = `${userPrompt}\n\nNote: ITBIS is a tax (similar to VAT). It's a standard tax calculation.`;
  }
  return `${pool.systemPrompt}

You are a senior software engineer. The user request is:
"${clarifiedPrompt}"

Provide a complete, production‑ready solution. Follow this exact format:

REASONING: <explain your approach, trade‑offs, and why it's good>
CODE:
\`\`\`<language>
// your code here
\`\`\`

Use the appropriate programming language based on the request and your expertise. Include input validation, error handling, and usage examples if relevant. Be thorough.`;
}

function buildCodeArgumentPrompt(pool: Pool, ownProposal: string, othersProposals: string): string {
  return `${pool.systemPrompt}

Debate topic: coding solution for the user request.

YOUR POSITION:
${ownProposal}

OTHER PARTICIPANTS SAID:
${othersProposals}

Reply in this exact format:
CRITIQUE: <one flaw in the opposing positions>
DEFENSE: <why your answer is better, one sentence>
CONCESSION: <one point from others you agree with, or "none">

Focus on code quality, efficiency, correctness, and best practices across any language.`;
}

function buildCodeRebuttalPrompt(pool: Pool, ownArgument: string, opponentArguments: string): string {
  return `${pool.systemPrompt}

Debate topic: coding solution for the user request.

YOUR ARGUMENT:
${ownArgument}

OPPONENTS ARGUED:
${opponentArguments}

Reply in this exact format:
REBUTTAL: <counter the strongest opposing point, one sentence>
FINAL POSITION: <your confirmed or updated answer, one sentence>

Keep it focused on code.`;
}

function buildCodeVotePrompt(pool: Pool, allProposals: string, candidates: string[], selfId: string): string {
  const voteCandidates = candidates.filter(c => c !== selfId).join(', ');
  return `${pool.systemPrompt}

Debate on: coding solution for the user request.

FINAL POSITIONS:
${allProposals}

You are ${selfId}. You must vote for the best answer among the other participants.
Base your decision on:
- Correctness of the solution
- Code quality and best practices
- Efficiency and performance
- Completeness (includes error handling, examples, etc.)

Available candidates (do NOT pick yourself): ${voteCandidates}

Respond ONLY with:
VOTE: <model_id>
REASON: <one sentence explaining why that answer is best>
CONFIDENCE: <0.0 to 1.0>

Do not vote for yourself. Do not vote based on order; vote based on quality.`;
}

function buildCodeSynthesisPrompt(pool: Pool, winnerProposal: string, allPositions: string, voteCount: number, totalVoters: number): string {
  return `${pool.systemPrompt}

You won a coding debate (${voteCount}/${totalVoters} votes) on the user request.

YOUR WINNING POSITION:
${winnerProposal}

ALL POSITIONS CONSIDERED:
${allPositions}

Now write the FINAL ANSWER for the user. Rules:
- Output ONLY the working API code. No explanations, no "Final Answer" headers, no markdown outside the code block.
- The code must be complete, runnable, and include the exact API the user asked for (e.g., convert meters to centimeters using Express).
- Use a single markdown code block with the appropriate language.

Example of expected output:
\`\`\`typescript
import express from 'express';
const app = express();
app.use(express.json());
app.post('/convert', (req, res) => {
  const { meters } = req.body;
  if (typeof meters !== 'number') return res.status(400).json({ error: 'Invalid input' });
  res.json({ centimeters: meters * 100 });
});
app.listen(3000);
\`\`\`

Do not add any extra text before or after the code block.`;
}

async function runCodeProposalPhase(
  ollama: OllamaClient,
  prompt: string,
  activeModels: string[],
  state: DebateState,
  repManager: ReputationManager,
  pool: Pool,
  silent: boolean
): Promise<string[]> {
  if (!silent) {
    console.log(chalk.bold.yellow('\n' + hr('─', 60)));
    console.log(chalk.bold.yellow('  PHASE 1 — INITIAL CODE PROPOSALS'));
    console.log(chalk.bold.yellow(hr('─', 60)));
  }

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

    const userPrompt = buildCodeProposalPrompt(pool, prompt);
    let content = '';
    let attempts = 0;
    const maxAttempts = 2;
    while (attempts < maxAttempts) {
      attempts++;
      const onStream = (chunk: string, full: string) => {
        let styledChunk = chunk;
        styledChunk = styledChunk.replace(/`([^`]+)`/g, (_, code) => chalk.bgGray.white(code));
        styledChunk = styledChunk.replace(/\b(REASONING|ANSWER|CODE):/g, (match) => chalk.yellow.bold(match));
        styledChunk = styledChunk.replace(/\*\*([^*]+)\*\*/g, (_, t) => chalk.bold(t));
        styledChunk = styledChunk.replace(/\*([^*]+)\*/g, (_, t) => chalk.italic(t));
        if (streamOutput === '') {
          spinner.stop();
          console.log(chalk.green(`[${modelId}] streaming:`));
        }
        process.stdout.write(chalk.cyan(styledChunk));
        streamOutput = full;
      };
      content = await callModelStreaming(
        ollama,
        modelId,
        'You are a precise and analytical expert.',
        userPrompt,
        TOKEN_LIMITS.proposal,
        0.3,
        'proposal',
        onStream,
        2,
        NUM_CTX,
        true
      );
      if (!isRefusal(content)) break;
      if (!silent) console.log(chalk.yellow(`\n  ⚠ ${modelId} refused to answer, retrying (${attempts}/${maxAttempts})...`));
      streamOutput = '';
      spinner.start();
    }

    const latency = Date.now() - start;
    spinner.stop();

    if (content === '[NO_RESPONSE]' || isRefusal(content)) {
      if (!silent) console.log(chalk.red(`\n  ✗ ${modelId} failed to respond (${latency}ms) – excluding from debate`));
      continue;
    }
    if (!silent) console.log('\n' + chalk.gray(`  (${latency}ms)`));
    state.proposals.set(modelId, content);
    state.messages.push({ modelId, role: 'proposal', content, round: 0, timestamp: Date.now() });
    repManager.update(modelId, { energyDelta: -Math.min(0.1, latency / 10000) });
    newActiveModels.push(modelId);
  }
  return newActiveModels;
}

async function runCodeArgumentRebuttalRounds(
  ollama: OllamaClient,
  prompt: string,
  debateRounds: number,
  activeModels: string[],
  state: DebateState,
  repManager: ReputationManager,
  pool: Pool,
  interactive: boolean,
  silent: boolean
): Promise<string[]> {
  let currentModels = [...activeModels];
  for (let round = 1; round <= debateRounds; round++) {
    const phase = round === 1 ? 'argument' : 'rebuttal';
    const phaseLabel = round === 1 ? 'ARGUMENTS' : `REBUTTAL ROUND ${round - 1}`;
    const phaseTokens = phase === 'argument' ? TOKEN_LIMITS.argument : TOKEN_LIMITS.rebuttal;
    const promptBuilder = phase === 'argument' ? buildCodeArgumentPrompt : buildCodeRebuttalPrompt;

    if (!silent) {
      console.log(chalk.bold.yellow('\n' + hr('─', 60)));
      console.log(chalk.bold.yellow(`  PHASE ${round + 1} — ${phaseLabel}`));
      console.log(chalk.bold.yellow(hr('─', 60)));
    }

    const lastMessagePerModel = new Map<string, string>();
    for (const modelId of currentModels) {
      const msgs = state.messages.filter(m => m.modelId === modelId);
      if (msgs.length) lastMessagePerModel.set(modelId, msgs[msgs.length-1].content);
    }

    let focusModel: string | null = null;
    if (interactive && phase === 'argument' && !silent) {
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

      const userPrompt = promptBuilder(pool, ownLast, othersText);
      let content = '';
      let attempts = 0;
      const maxAttempts = 2;
      while (attempts < maxAttempts) {
        attempts++;
        const onStream = (chunk: string, full: string) => {
          let styledChunk = chunk;
          styledChunk = styledChunk.replace(/`([^`]+)`/g, (_, code) => chalk.bgGray.white(code));
          styledChunk = styledChunk.replace(/\b(CRITIQUE|DEFENSE|CONCESSION|REBUTTAL|FINAL POSITION):/g, (match) => chalk.yellow.bold(match));
          styledChunk = styledChunk.replace(/\*\*([^*]+)\*\*/g, (_, t) => chalk.bold(t));
          styledChunk = styledChunk.replace(/\*([^*]+)\*/g, (_, t) => chalk.italic(t));
          if (streamOutput === '') {
            spinner.stop();
            console.log(chalk.green(`[${modelId}] streaming:`));
          }
          process.stdout.write(chalk.yellow(styledChunk));
          streamOutput = full;
        };
        content = await callModelStreaming(
          ollama,
          modelId,
          'You are a rigorous debate participant.',
          userPrompt,
          phaseTokens,
          0.4,
          phase,
          onStream,
          2,
          NUM_CTX,
          true
        );
        if (!isRefusal(content)) break;
        if (!silent) console.log(chalk.yellow(`\n  ⚠ ${modelId} refused to answer, retrying (${attempts}/${maxAttempts})...`));
        streamOutput = '';
        spinner.start();
      }

      const latency = Date.now() - start;
      spinner.stop();

      if (content === '[NO_RESPONSE]' || isRefusal(content)) {
        if (!silent) console.log(chalk.red(`\n  ✗ ${modelId} failed to respond (${latency}ms) – excluding from debate`));
        continue;
      }
      if (!silent) console.log('\n' + chalk.gray(`  (${latency}ms)`));
      const msg: ModelMessage = { modelId, role: phase as ModelMessage['role'], content, round, timestamp: Date.now() };
      state.messages.push(msg);
      repManager.update(modelId, { energyDelta: -Math.min(0.1, latency / 10000) });
      roundActiveModels.push(modelId);
    }
    currentModels = roundActiveModels;
    if (currentModels.length < 2) {
      if (!silent) console.log(chalk.red('\nToo few models remaining after this round. Aborting debate.'));
      break;
    }
  }
  return currentModels;
}

async function runCodeVotingPhase(
  ollama: OllamaClient,
  prompt: string,
  debateRounds: number,
  activeModels: string[],
  state: DebateState,
  repManager: ReputationManager,
  pool: Pool,
  silent: boolean
): Promise<{ winner: string; voteTally: Map<string, number> }> {
  if (!silent) {
    console.log(chalk.bold.magenta('\n' + hr('─', 60)));
    console.log(chalk.bold.magenta(`  PHASE ${debateRounds + 2} — VOTING (STREAMING)`));
    console.log(chalk.bold.magenta(hr('─', 60)));
  }

  const finalPositions = activeModels
    .map(modelId => {
      const msgs = state.messages.filter(m => m.modelId === modelId);
      const last = msgs[msgs.length-1]?.content ?? state.proposals.get(modelId) ?? '[no position]';
      return `=== ${modelId} ===\n${last}`;
    })
    .join('\n\n');

  const voteTally = new Map<string, number>();
  activeModels.forEach(m => voteTally.set(m, 0));

  for (const voterModel of activeModels) {
    const candidateModels = activeModels.filter(m => m !== voterModel);
    if (candidateModels.length === 0) continue;

    if (!silent) console.log(chalk.white(`\n${voterModel} is voting...`));
    let rawVote = '[NO_RESPONSE]';
    let success = false;
    let nominee = '';
    let reason = '';
    let confidence = 0.0;

    for (let attempt = 1; attempt <= 3; attempt++) {
      rawVote = await callModelStreamingVote(
        ollama,
        voterModel,
        'You are an objective judge. Follow the format exactly. Do not vote for yourself.',
        buildCodeVotePrompt(pool, finalPositions, activeModels, voterModel),
        TOKEN_LIMITS.vote,
        0.01,
        3,
        NUM_CTX
      );
      const parsed = parseVote(rawVote, candidateModels, voterModel);
      if (parsed && parsed.nominee !== voterModel) {
        nominee = parsed.nominee;
        reason = parsed.reason;
        confidence = parsed.confidence;
        success = true;
        break;
      }
      if (!silent) console.log(chalk.yellow(`  Attempt ${attempt}/3 failed for ${voterModel}, retrying...`));
    }

    if (!success) {
      const randomIndex = Math.floor(Math.random() * candidateModels.length);
      nominee = candidateModels[randomIndex];
      reason = '[Fallback due to parsing failure]';
      confidence = 0.0;
      if (!silent) console.log(chalk.yellow(`  ⚠ ${voterModel} failed to vote after retries. Assigning random vote to ${nominee}.`));
    }

    const vote: Vote = {
      voter: voterModel,
      nominee: nominee,
      reason: reason,
      confidence: confidence,
    };
    state.votes.push(vote);
    voteTally.set(nominee, (voteTally.get(nominee) ?? 0) + 1);
    state.messages.push({
      modelId: voterModel,
      role: 'vote',
      content: `Votes for: ${nominee}\nReason: ${reason}\nConfidence: ${confidence}`,
      round: debateRounds + 1,
      timestamp: Date.now(),
    });
    if (!silent) {
      console.log(
        chalk.magenta(`  ${voterModel}`) +
        chalk.white(' → ') +
        chalk.bold.green(nominee) +
        chalk.gray(` (confidence: ${confidence.toFixed(2)})`) +
        chalk.gray(`\n    "${reason.substring(0, 120)}"`)
      );
    }
  }

  if (!silent) console.log(chalk.bold.magenta('\n  VOTE RESULTS:'));
  let topVotes = 0;
  let winner = activeModels[0];
  const sortedTally = [...voteTally.entries()].sort((a, b) => b[1] - a[1]);
  for (const [modelId, count] of sortedTally) {
    const filled = Math.max(0, count);
    const empty = Math.max(0, activeModels.length - 1 - count);
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    if (count > topVotes) { topVotes = count; winner = modelId; }
    const line = `  ${bar} ${modelId}: ${count} vote(s)`;
    if (!silent) console.log(count === topVotes ? chalk.bold.green(line) : chalk.gray(line));
  }

  const tiedModels = sortedTally.filter(([, c]) => c === topVotes).map(([m]) => m);
  if (tiedModels.length > 1) {
    if (!silent) console.log(chalk.yellow(`\n  Tie between: ${tiedModels.join(', ')}. Breaking by reputation.`));
    let bestRep = -Infinity;
    for (const m of tiedModels) {
      const s = repManager.getScore(m);
      if (s > bestRep) { bestRep = s; winner = m; }
    }
    if (!silent) console.log(chalk.yellow(`  Tiebreak winner: ${winner} (rep: ${repManager.getScore(winner).toFixed(3)})`));
  }

  for (const [modelId, count] of voteTally.entries()) {
    const relScore = activeModels.length > 1 ? (count / (activeModels.length - 1)) - 0.5 : 0;
    repManager.update(modelId, { accuracyDelta: relScore * 0.2, honestyDelta: 0 });
  }
  if (!silent) console.log(chalk.bold.green(`\n  🏆 WINNER: ${winner} with ${topVotes} vote(s)\n`));
  return { winner, voteTally };
}

async function runCodeSynthesisPhase(
  ollama: OllamaClient,
  prompt: string,
  winner: string,
  debateRounds: number,
  activeModels: string[],
  topVotes: number,
  state: DebateState,
  finalPositions: string,
  pool: Pool,
  silent: boolean
): Promise<string> {
  if (!silent) {
    console.log(chalk.bold.blue('\n' + hr('─', 60)));
    console.log(chalk.bold.blue('  PHASE — SYNTHESIS (STREAMING)'));
    console.log(chalk.bold.blue(hr('─', 60)));
  }

  const winnerMsgs = state.messages.filter(m => m.modelId === winner);
  const winnerFinalPosition = winnerMsgs[winnerMsgs.length-1]?.content ?? state.proposals.get(winner) ?? 'No position found.';

  const userPrompt = buildCodeSynthesisPrompt(pool, winnerFinalPosition, finalPositions, topVotes, activeModels.length);

  let fullAnswer = '';
  let streamOutput = '';
  const spinner = ora({ text: `${winner} writing final answer...`, color: 'blue' }).start();
  const synthesisStart = Date.now();

  const onStream = (chunk: string, full: string) => {
    if (streamOutput === '') {
      spinner.stop();
      console.log(chalk.green(`[${winner}] final answer streaming:`));
    }
    process.stdout.write(chalk.cyan(chunk));
    streamOutput = full;
    fullAnswer = full;
  };

  const content = await callModelStreaming(
    ollama,
    winner,
    'You are an expert communicator. Output ONLY the final answer code.',
    userPrompt,
    TOKEN_LIMITS.synthesis,
    0.3,
    'synthesis',
    onStream,
    2,
    NUM_CTX,
    true
  );

  if (content === '[NO_RESPONSE]') {
    fullAnswer = winnerFinalPosition;
    if (!silent) console.log(chalk.yellow("\n  (Synthesis failed — using winner's last position as fallback)"));
  }

  spinner.stop();
  const synthesisLatency = Date.now() - synthesisStart;
  console.log(chalk.gray(`  (${synthesisLatency}ms)`));

  state.finalAnswer = fullAnswer;
  state.messages.push({
    modelId: winner,
    role: 'synthesis',
    content: fullAnswer,
    round: debateRounds + 2,
    timestamp: Date.now(),
  });

  if (!silent) {
    console.log(chalk.bold.green(hr('═', 60)));
    console.log(chalk.bold.green(`  FINAL ANSWER`));
    console.log(chalk.bold.green(`  (by ${winner} · ${topVotes}/${activeModels.length - 1} votes · ${synthesisLatency}ms)`));
    console.log(chalk.bold.green(hr('═', 60)));
    console.log(renderMarkdown(fullAnswer));
    console.log(chalk.bold.green(hr('═', 60) + '\n'));
  }

  return fullAnswer;
}

export async function runPoolDebate(
  pool: Pool,
  userPrompt: string,
  options: {
    rounds?: number;
    interactive?: boolean;
    graph?: boolean;
    turbo?: boolean;
    selfEval?: boolean;
    memory?: boolean;
    silent?: boolean;
  } = {}
): Promise<string> {
  const config = await loadConfig();
  const originalSelected = config.selectedModels;
  config.selectedModels = pool.models;
  await saveConfig(config);

  const ollama = new OllamaClient();
  if (!(await ollama.isRunning())) {
    throw new Error('Ollama is not running. Start it with `ollama serve`.');
  }

  const repManager = new ReputationManager();
  const debateRounds = Math.max(1, options.rounds || 2);
  const interactive = options.interactive || false;
  const enableGraph = options.graph || false;
  const turboMode = options.turbo || false;
  const selfEval = options.selfEval || false;
  const enableMemory = options.memory || false;
  const silent = options.silent || false;

  if (!silent && turboMode) {
    console.log(chalk.gray('Turbo mode enabled – optimizing system resources...'));
    await showResourceReport();
    optimizeOllamaEnv();
    setProcessPriority();
  } else if (!silent) {
    await showResourceReport();
  }

  if (enableGraph && !silent) {
    startGraphServer(8080);
    (global as any).__graphEnabled = true;
    emitGraphEvent({ type: 'status', message: 'Warming up models...' });
    emitGraphEvent({ type: 'models_selected', models: pool.models });
  }

  const state: DebateState = {
    topic: userPrompt,
    messages: [],
    proposals: new Map(),
    votes: [],
    winner: null,
    finalAnswer: '',
  };

  if (!silent) {
    console.log(chalk.bold('\n' + hr('═', 60)));
    console.log(chalk.bold.white('  CODING DEBATE – ' + pool.name.toUpperCase()));
    console.log(chalk.bold(hr('═', 60)));
    console.log(chalk.cyan(`  Request: "${userPrompt}"`));
    console.log(chalk.gray(`  Pool: ${pool.name} (${pool.description})`));
    console.log(chalk.gray(`  Models: ${pool.models.join(', ')}`));
    console.log(chalk.gray(`  Rounds: ${debateRounds}`));
    console.log(chalk.bold(hr('═', 60)) + '\n');
  }

  let activeModels = await warmupModels(ollama, pool.models);
  if (activeModels.length < 2) {
    if (!silent) console.log(chalk.red('Not enough fast models to run a debate (need at least 2).'));
    if (enableGraph && !silent) closeGraphServer();
    config.selectedModels = originalSelected;
    await saveConfig(config);
    throw new Error('Not enough models responded.');
  }

  activeModels = await runCodeProposalPhase(ollama, userPrompt, activeModels, state, repManager, pool, silent);
  if (activeModels.length < 2) {
    if (!silent) console.log(chalk.red('\nNot enough models responded. Aborting.'));
    if (enableGraph && !silent) closeGraphServer();
    config.selectedModels = originalSelected;
    await saveConfig(config);
    throw new Error('Not enough models after proposal phase.');
  }

  activeModels = await runCodeArgumentRebuttalRounds(ollama, userPrompt, debateRounds, activeModels, state, repManager, pool, interactive, silent);
  if (activeModels.length < 2) {
    if (!silent) console.log(chalk.red('\nNot enough models to vote. Using best reputation model as fallback.'));
    let best = pool.models[0];
    let bestScore = repManager.getScore(best);
    for (const m of pool.models.slice(1)) {
      const s = repManager.getScore(m);
      if (s > bestScore) { bestScore = s; best = m; }
    }
    const resp = await ollama.chat(best, [{ role: 'user', content: userPrompt }], 600, 0.2);
    const finalAnswerText = resp.content;
    if (!silent) {
      console.log(chalk.bold.green(`\n═══════════════════════════════════════`));
      console.log(chalk.bold.green(`FINAL ANSWER (fallback)`));
      console.log(chalk.bold.green(`═══════════════════════════════════════`));
      console.log(`\n${finalAnswerText}\n`);
    }
    config.selectedModels = originalSelected;
    await saveConfig(config);
    if (enableGraph && !silent) closeGraphServer();
    return finalAnswerText;
  }

  const finalPositions = activeModels
    .map(modelId => {
      const msgs = state.messages.filter(m => m.modelId === modelId);
      const last = msgs[msgs.length-1]?.content ?? state.proposals.get(modelId) ?? '[no position]';
      return `=== ${modelId} ===\n${last}`;
    })
    .join('\n\n');

  const { winner, voteTally } = await runCodeVotingPhase(ollama, userPrompt, debateRounds, activeModels, state, repManager, pool, silent);
  const finalAnswer = await runCodeSynthesisPhase(ollama, userPrompt, winner, debateRounds, activeModels, voteTally.get(winner) || 0, state, finalPositions, pool, silent);

  if (enableGraph && !silent) {
    setTimeout(() => closeGraphServer(), 3000);
    delete (global as any).__graphEnabled;
  }

  config.selectedModels = originalSelected;
  await saveConfig(config);
  return finalAnswer;
}