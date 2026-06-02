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

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type QueryIntent = 'code' | 'explain' | 'analyze' | 'compare' | 'debug';

export interface DebateOptions {
  rounds?: number;
  interactive?: boolean;
  graph?: boolean;
  turbo?: boolean;
  selfEval?: boolean;
  memory?: boolean;
  silent?: boolean;
  context?: string;
  intent?: QueryIntent;
  timeout?: number;         // per-model timeout in ms (default: 120_000)
  minConsensus?: number;    // minimum vote fraction required (default: 0.5)
  qualityGate?: number;     // minimum content length to accept a response (default: 50)
  maxRetries?: number;      // max retries per model per phase (default: 2)
  onPhaseEnd?: (phase: PhaseResult) => void; // lifecycle hook
}

export interface PhaseResult {
  phase: string;
  round: number;
  activeModels: string[];
  durationMs: number;
  failedModels: string[];
}

interface ModelHealth {
  failures: number;
  totalLatencyMs: number;
  calls: number;
  refused: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_LIMITS = {
  proposal:  32768,
  argument:  32768,
  rebuttal:  32768,
  critique:  16384,
  vote:        800,
  synthesis: 65536,
} as const;

const NUM_CTX         = 65536;
const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_RETRIES = 2;
const QUALITY_MIN_LEN = 50;

// ─────────────────────────────────────────────────────────────────────────────
// INTENT DETECTION — Extended classification
// ─────────────────────────────────────────────────────────────────────────────

const INTENT_PATTERNS: Record<QueryIntent, RegExp[]> = {
  code: [
    /\b(write|create|implement|build|generate|refactor|add|modify|update|delete|remove|rewrite|migrate|convert|scaffold|init|setup|configure|extend|patch|fix)\b/i,
  ],
  debug: [
    /\b(bug|error|exception|crash|broken|not working|fails?|failing|incorrect|wrong output|unexpected|trace|stack trace|why (does|is|isn't)|debug|diagnose|investigate)\b/i,
  ],
  compare: [
    /\b(compare|versus|vs\.?|difference between|pros? and cons?|trade-?offs?|which (is|should|would)|better (option|choice|approach)|contrast|benchmark)\b/i,
  ],
  analyze: [
    /\b(analyz|review|audit|assess|evaluat|inspect|look at|check|critique|improve|optimize|refactor — wait, that's code — evaluate|what('s| is) wrong|how (good|bad|efficient|clean|readable)|performance|complexity|security|vulnerabilit)\b/i,
    /\b(analyz|assess|evaluat|look at this|what do you think|review (this|my|the)|audit)\b/i,
  ],
  explain: [
    /\b(explain|what is|what are|what does|how does|how do|why does|why is|describe|summarize|understand|tell me|walk me through|how (it|this) works?|what('s| is) the|when (does|should)|who (is|wrote)|is (it|this)|does (it|this)|can (it|this)|should (i|we)|architecture|design|pattern|concept|theory)\b/i,
  ],
};

// Priority order — first match wins
const INTENT_PRIORITY: QueryIntent[] = ['debug', 'compare', 'analyze', 'explain', 'code'];

function detectIntent(userPrompt: string): QueryIntent {
  const lower = userPrompt.trim();
  for (const intent of INTENT_PRIORITY) {
    if (INTENT_PATTERNS[intent].some(p => p.test(lower))) return intent;
  }
  return 'explain';
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL HEALTH TRACKER
// ─────────────────────────────────────────────────────────────────────────────

class HealthTracker {
  private map = new Map<string, ModelHealth>();

  init(models: string[]): void {
    for (const m of models) this.map.set(m, { failures: 0, totalLatencyMs: 0, calls: 0, refused: 0 });
  }

  record(modelId: string, latencyMs: number, failed = false, refused = false): void {
    const h = this.map.get(modelId);
    if (!h) return;
    h.calls++;
    h.totalLatencyMs += latencyMs;
    if (failed) h.failures++;
    if (refused) h.refused++;
  }

  avgLatency(modelId: string): number {
    const h = this.map.get(modelId);
    if (!h || h.calls === 0) return 0;
    return h.totalLatencyMs / h.calls;
  }

  isHealthy(modelId: string, threshold = 3): boolean {
    const h = this.map.get(modelId);
    if (!h) return false;
    return h.failures < threshold;
  }

  summary(): string {
    return [...this.map.entries()]
      .map(([id, h]) => `${id}: ${h.calls} calls, ${h.failures} fail, avg ${Math.round(h.totalLatencyMs / Math.max(1, h.calls))}ms`)
      .join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GUARDS
// ─────────────────────────────────────────────────────────────────────────────

const REFUSAL_PATTERNS = [
  /i can'?t provide/i,
  /i cannot provide/i,
  /i am unable to/i,
  /i cannot answer/i,
  /cannot engage in/i,
  /inappropriate/i,
  /harmful or illegal/i,
  /as an ai,? i (cannot|can'?t|won'?t)/i,
  /i('?m| am) not able to/i,
  /i('?ll| will) not/i,
];

function isRefusal(content: string): boolean {
  return REFUSAL_PATTERNS.some(p => p.test(content));
}

function passesQualityGate(content: string, minLen = QUALITY_MIN_LEN): boolean {
  if (!content || content === '[NO_RESPONSE]') return false;
  if (isRefusal(content)) return false;
  if (content.trim().length < minLen) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT INJECTION
// ─────────────────────────────────────────────────────────────────────────────

function injectContext(basePrompt: string, context?: string): string {
  if (!context?.trim()) return basePrompt;
  return `[CODEBASE CONTEXT — ${context.length} chars]:\n${context}\n\n${'─'.repeat(60)}\n\n${basePrompt}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTENT-AWARE SYSTEM ROLES
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_ROLES: Record<QueryIntent, string> = {
  code:    'You are a principal software engineer. Produce complete, production-ready code.',
  explain: 'You are a world-class technical educator. Explain with precision and clarity.',
  analyze: 'You are a senior code reviewer. Assess quality, correctness, and trade-offs rigorously.',
  compare: 'You are an objective technical advisor. Compare options with evidence and nuance.',
  debug:   'You are an expert debugger. Identify root causes and provide verified fixes.',
};

const DEBATE_ROLES: Record<QueryIntent, string> = {
  code:    'You are a rigorous code reviewer in a technical debate.',
  explain: 'You are a rigorous technical peer reviewer in an explanation debate.',
  analyze: 'You are a rigorous assessor evaluating analysis quality.',
  compare: 'You are a rigorous evaluator of comparative technical arguments.',
  debug:   'You are a rigorous debugger cross-examining proposed fixes.',
};

const SYNTHESIS_ROLES: Record<QueryIntent, string> = {
  code:    'You are an expert engineer. Output ONLY the final, complete solution.',
  explain: 'You are an expert communicator. Output a clear, comprehensive explanation.',
  analyze: 'You are an expert analyst. Synthesize the best insights into a definitive assessment.',
  compare: 'You are an expert advisor. Deliver a decisive, well-reasoned comparison.',
  debug:   'You are an expert debugger. Provide the definitive root-cause analysis and fix.',
};

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

const INTENT_PROPOSAL_INSTRUCTIONS: Record<QueryIntent, (prompt: string) => string> = {
  code: (prompt) => `
**The user asks:** "${prompt}"

**INSTRUCTIONS — FOLLOW EXACTLY:**
Respond with a concrete, complete code solution in this exact format:

REASONING: <why this approach is best — 1–2 short paragraphs>
CODE:
\`\`\`<language>
// complete implementation here
\`\`\`

Rules:
- Complete, runnable code only — no placeholders, no TODOs.
- Proper types, error handling, edge cases.
- Multiple files: use clear \`// === path/to/file.ts ===\` headers.
- Reply in the same language as the user.`,

  explain: (prompt) => `
**The user asks:** "${prompt}"

**INSTRUCTIONS — FOLLOW EXACTLY:**
Answer in clear, natural prose. Code blocks only when a snippet directly illustrates the explanation.

Structure your answer:
1. Direct answer first (1–2 sentences).
2. Supporting context and depth.
3. Key caveats or common misconceptions.

Reply in the same language as the user.`,

  analyze: (prompt) => `
**The user asks / submits for analysis:** "${prompt}"

**INSTRUCTIONS — FOLLOW EXACTLY:**
Provide a structured technical analysis:

ASSESSMENT: <overall verdict in 1 sentence>
STRENGTHS: <what works well, bullet points>
ISSUES: <concrete problems found, ranked by severity>
RECOMMENDATIONS: <specific, actionable improvements>

Be direct, evidence-based, and avoid vague praise or criticism.
Reply in the same language as the user.`,

  compare: (prompt) => `
**The user asks:** "${prompt}"

**INSTRUCTIONS — FOLLOW EXACTLY:**
Provide an objective comparison:

VERDICT: <clear recommendation with rationale in 2 sentences>
DETAILED COMPARISON: <key criteria with pros/cons for each option>
WHEN TO CHOOSE EACH: <context-specific guidance>
COMMON PITFALLS: <what to watch out for>

Base your comparison on concrete evidence. No wishy-washy "it depends" without explaining on what.
Reply in the same language as the user.`,

  debug: (prompt) => `
**The user reports / provides:** "${prompt}"

**INSTRUCTIONS — FOLLOW EXACTLY:**

ROOT CAUSE: <precise identification of what is wrong and why>
EVIDENCE: <which part of the code/stack trace/behaviour confirms this>
FIX:
\`\`\`<language>
// corrected code
\`\`\`
PREVENTION: <how to avoid this class of bug in the future>

Do not speculate — trace the exact failure path.
Reply in the same language as the user.`,
};

function buildProposalPrompt(pool: Pool, userPrompt: string, intent: QueryIntent, context?: string): string {
  const instructions = INTENT_PROPOSAL_INSTRUCTIONS[intent](userPrompt);
  const base = `${pool.systemPrompt}\n\nYou are a senior engineer who knows this codebase inside out.\n${instructions}`;
  return injectContext(base, context);
}

// ── Argument ──────────────────────────────────────────────────────────────────

const INTENT_DEBATE_CRITERIA: Record<QueryIntent, string> = {
  code:    'Focus on correctness, efficiency, code quality, completeness, and best practices.',
  explain: 'Focus on accuracy, clarity, completeness, and whether the explanation actually answers the question.',
  analyze: 'Focus on the rigour, depth, and accuracy of the analysis.',
  compare: 'Focus on objectivity, evidence quality, and the completeness of the comparison.',
  debug:   'Focus on whether the root cause is correctly identified and the fix actually resolves the issue.',
};

function buildArgumentPrompt(
  pool: Pool,
  ownProposal: string,
  othersProposals: string,
  intent: QueryIntent,
  context?: string
): string {
  const base = `${pool.systemPrompt}

Debate topic: the best answer to the user's request.

YOUR POSITION:
${ownProposal}

OTHER PARTICIPANTS SAID:
${othersProposals}

Reply in this exact format:
CRITIQUE: <one concrete, specific flaw in the opposing positions>
DEFENSE: <the strongest single reason your answer is better>
CONCESSION: <one valid point from others, or "none">

${INTENT_DEBATE_CRITERIA[intent]}`;

  return injectContext(base, context);
}

function buildRebuttalPrompt(
  pool: Pool,
  ownArgument: string,
  opponentArguments: string,
  intent: QueryIntent,
  context?: string
): string {
  const base = `${pool.systemPrompt}

Debate topic: the best answer to the user's request.

YOUR ARGUMENT:
${ownArgument}

OPPONENTS ARGUED:
${opponentArguments}

Reply in this exact format:
REBUTTAL: <counter the strongest opposing point, one sentence>
FINAL POSITION: <your confirmed or updated answer, one sentence>

${INTENT_DEBATE_CRITERIA[intent]}`;

  return injectContext(base, context);
}

// ── Self-Evaluation ────────────────────────────────────────────────────────────

function buildSelfEvalPrompt(
  pool: Pool,
  ownProposal: string,
  intent: QueryIntent,
  context?: string
): string {
  const criteria = INTENT_DEBATE_CRITERIA[intent];
  const base = `${pool.systemPrompt}

You are critically reviewing your own answer.

YOUR ANSWER:
${ownProposal}

Evaluate it rigorously:
SCORE: <0–10>
WEAKNESS: <the single biggest flaw in your answer>
REVISED_ANSWER: <improved version incorporating your critique>

${criteria}
Be honest — a high score on a weak answer will cost you in voting.`;

  return injectContext(base, context);
}

// ── Vote ──────────────────────────────────────────────────────────────────────

const INTENT_VOTE_CRITERIA: Record<QueryIntent, string> = {
  code: `- Correctness and completeness of the solution
- Code quality and best practices
- Efficiency and performance
- Robustness (error handling, edge cases)`,
  explain: `- Accuracy and correctness of the explanation
- Clarity and comprehensibility
- Completeness (fully answers the question)
- Depth without unnecessary complexity`,
  analyze: `- Rigour and depth of analysis
- Accuracy of identified issues
- Quality of recommendations`,
  compare: `- Objectivity and evidence quality
- Completeness of the comparison
- Practical usefulness of the conclusion`,
  debug: `- Correctness of root cause identification
- Quality and completeness of the fix
- Clarity of the explanation`,
};

function buildVotePrompt(
  pool: Pool,
  allProposals: string,
  candidates: string[],
  selfId: string,
  intent: QueryIntent,
  context?: string
): string {
  const voteCandidates = candidates.filter(c => c !== selfId).join(', ');
  const base = `${pool.systemPrompt}

Debate on: the best answer to the user's request.

FINAL POSITIONS:
${allProposals}

You are ${selfId}. Vote for the single best answer among the other participants.
Evaluation criteria:
${INTENT_VOTE_CRITERIA[intent]}

Available candidates (do NOT pick yourself): ${voteCandidates}

Respond ONLY in this exact format:
VOTE: <model_id>
REASON: <one sentence explaining why that answer is best>
CONFIDENCE: <0.0–1.0>

Do not vote for yourself. Judge on quality, not position in the list.`;

  return injectContext(base, context);
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

const INTENT_SYNTHESIS_INSTRUCTIONS: Record<QueryIntent, (votes: number, total: number, position: string) => string> = {
  code: (v, t, pos) => `You won the debate (${v}/${t} votes). Your winning position:
${pos.substring(0, 600)}

**Final deliverable:**
- Output ONLY the complete, clean, runnable solution.
- No preamble, no "here is the code", no trailing commentary.
- Multiple files: use \`// === path/to/file.ts ===\` headers inside the block.
- Ensure imports, paths, and conventions match the codebase context.`,

  explain: (v, t, pos) => `You won the debate (${v}/${t} votes). Your winning position:
${pos.substring(0, 600)}

**Final deliverable:**
- Clear, complete explanation in well-structured prose.
- Lead with the direct answer, then supporting detail.
- Include a code snippet ONLY if it meaningfully illustrates a concept.
- Concise but thorough — no padding.`,

  analyze: (v, t, pos) => `You won the debate (${v}/${t} votes). Your winning position:
${pos.substring(0, 600)}

**Final deliverable:**
- Definitive, structured analysis.
- Integrate the strongest insights from the debate.
- Clear verdict, specific issues, actionable recommendations.`,

  compare: (v, t, pos) => `You won the debate (${v}/${t} votes). Your winning position:
${pos.substring(0, 600)}

**Final deliverable:**
- Decisive, evidence-based comparison.
- Clear recommendation with reasoning.
- Honest trade-offs.`,

  debug: (v, t, pos) => `You won the debate (${v}/${t} votes). Your winning position:
${pos.substring(0, 600)}

**Final deliverable:**
- Definitive root-cause analysis.
- Complete, verified fix.
- Prevention guidance.`,
};

function buildSynthesisPrompt(
  pool: Pool,
  winnerProposal: string,
  allPositions: string,
  voteCount: number,
  totalVoters: number,
  intent: QueryIntent,
  context?: string
): string {
  const instructions = INTENT_SYNTHESIS_INSTRUCTIONS[intent](voteCount, totalVoters, winnerProposal);
  const base = `${pool.systemPrompt}

${instructions}

Final answer:`;

  return injectContext(base, context);
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const HIGHLIGHT_LABELS = {
  proposal:  /\b(REASONING|ANSWER|CODE|ASSESSMENT|VERDICT|ROOT CAUSE|EVIDENCE|FIX|PREVENTION):/g,
  argument:  /\b(CRITIQUE|DEFENSE|CONCESSION):/g,
  rebuttal:  /\b(REBUTTAL|FINAL POSITION):/g,
  analysis:  /\b(SCORE|WEAKNESS|REVISED_ANSWER):/g,
  vote:      /\b(VOTE|REASON|CONFIDENCE):/g,
  synthesis: /\b(REASONING|ANSWER|CODE|ASSESSMENT|VERDICT|ROOT CAUSE):/g,
};

type HighlightPhase = keyof typeof HIGHLIGHT_LABELS;

type ChalkFn = (text: string) => string;

function makeStreamHandler(
  spinner: ReturnType<typeof ora>,
  modelId: string,
  color: ChalkFn,
  phase: HighlightPhase,
  onFirstChunk?: () => void
): { handler: (chunk: string, full: string) => void; getOutput: () => string } {
  let streamOutput = '';
  const labelPattern = HIGHLIGHT_LABELS[phase];

  const handler = (chunk: string, full: string): void => {
    let styled = chunk;
    styled = styled.replace(/`([^`]+)`/g, (_, c) => chalk.bgGray.white(c));
    styled = styled.replace(labelPattern, m => chalk.yellow.bold(m));
    styled = styled.replace(/\*\*([^*]+)\*\*/g, (_, t) => chalk.bold(t));
    styled = styled.replace(/\*([^*]+)\*/g, (_, t) => chalk.italic(t));
    if (streamOutput === '') {
      spinner.stop();
      onFirstChunk?.();
      console.log(chalk.green(`[${modelId}] streaming:`));
    }
    process.stdout.write(color(styled));
    streamOutput = full;
  };

  return { handler, getOutput: () => streamOutput };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE RUNNER ABSTRACTION
// ─────────────────────────────────────────────────────────────────────────────

interface ModelCallResult {
  modelId: string;
  content: string;
  latencyMs: number;
  attempts: number;
  success: boolean;
}

async function runModelWithRetry(params: {
  ollama: OllamaClient;
  modelId: string;
  systemRole: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  phase: string;
  color: ChalkFn;
  highlightPhase: HighlightPhase;
  maxRetries: number;
  qualityMinLen: number;
  silent: boolean;
  health: HealthTracker;
}): Promise<ModelCallResult> {
  const {
    ollama, modelId, systemRole, userPrompt, maxTokens, temperature,
    phase, color, highlightPhase, maxRetries, qualityMinLen, silent, health
  } = params;

  const spinner = silent ? null : ora({ text: `${modelId} ${phase}...`, color: 'cyan' }).start();
  const start = Date.now();
  let content = '';
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    const { handler } = silent ? { handler: undefined as any } : makeStreamHandler(
      spinner!, modelId, color, highlightPhase
    );

    content = await callModelStreaming(
      ollama, modelId,
      systemRole,
      userPrompt,
      maxTokens,
      temperature,
      phase,
      silent ? undefined : handler,
      2, NUM_CTX, true
    );

    if (passesQualityGate(content, qualityMinLen)) break;

    if (!silent) {
      spinner!.start(`${modelId} ${phase} (retry ${attempts}/${maxRetries})...`);
    }
  }

  const latencyMs = Date.now() - start;
  spinner?.stop();
  const success = passesQualityGate(content, qualityMinLen);
  health.record(modelId, latencyMs, !success, isRefusal(content));

  if (!success && !silent) {
    process.stdout.write('\n');
    console.log(chalk.red(`  ✗ ${modelId} failed after ${attempts} attempt(s) (${latencyMs}ms) — excluded`));
  } else if (!silent) {
    process.stdout.write('\n');
    console.log(chalk.gray(`  ↳ ${modelId} done (${latencyMs}ms, attempt ${attempts}/${maxRetries})`));
  }

  return { modelId, content, latencyMs, attempts, success };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — PROPOSALS
// ─────────────────────────────────────────────────────────────────────────────

async function runProposalPhase(
  ollama: OllamaClient,
  prompt: string,
  intent: QueryIntent,
  activeModels: string[],
  state: DebateState,
  repManager: ReputationManager,
  pool: Pool,
  opts: Required<DebateOptions>,
  health: HealthTracker
): Promise<string[]> {
  const { silent, context, maxRetries, qualityGate, onPhaseEnd } = opts;
  const phaseStart = Date.now();

  if (!silent) {
    console.log(chalk.bold.yellow('\n' + hr('─', 60)));
    console.log(chalk.bold.yellow('  PHASE 1 — INITIAL PROPOSALS'));
    console.log(chalk.bold.yellow(hr('─', 60)));
  }

  const newActiveModels: string[] = [];
  const failedModels: string[] = [];

  await Promise.allSettled(
    activeModels.map(async (modelId) => {
      if ((global as any).__graphEnabled) {
        emitGraphEvent({ type: 'model_speaking', modelId, phase: 'proposal', targetModels: [] });
      }

      const result = await runModelWithRetry({
        ollama, modelId,
        systemRole: SYSTEM_ROLES[intent],
        userPrompt: buildProposalPrompt(pool, prompt, intent, context),
        maxTokens: TOKEN_LIMITS.proposal,
        temperature: 0.3,
        phase: 'drafting proposal',
        color: chalk.cyan,
        highlightPhase: 'proposal',
        maxRetries,
        qualityMinLen: qualityGate,
        silent,
        health,
      });

      if (result.success) {
        state.proposals.set(modelId, result.content);
        state.messages.push({ modelId, role: 'proposal', content: result.content, round: 0, timestamp: Date.now() });
        repManager.update(modelId, { energyDelta: -Math.min(0.1, result.latencyMs / 10_000) });
        newActiveModels.push(modelId);
      } else {
        failedModels.push(modelId);
      }
    })
  );

  onPhaseEnd?.({
    phase: 'proposal',
    round: 0,
    activeModels: newActiveModels,
    durationMs: Date.now() - phaseStart,
    failedModels,
  });

  return newActiveModels;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1.5 — OPTIONAL SELF-EVALUATION
// ─────────────────────────────────────────────────────────────────────────────

async function runSelfEvalPhase(
  ollama: OllamaClient,
  intent: QueryIntent,
  activeModels: string[],
  state: DebateState,
  pool: Pool,
  opts: Required<DebateOptions>,
  health: HealthTracker
): Promise<void> {
  if (!opts.selfEval) return;
  const { silent, context, maxRetries, qualityGate } = opts;

  if (!silent) {
    console.log(chalk.bold.gray('\n' + hr('─', 60)));
    console.log(chalk.bold.gray('  PHASE 1.5 — SELF-EVALUATION'));
    console.log(chalk.bold.gray(hr('─', 60)));
  }

  await Promise.allSettled(
    activeModels.map(async (modelId) => {
      const ownProposal = state.proposals.get(modelId) ?? '';
      if (!ownProposal) return;

      const result = await runModelWithRetry({
        ollama, modelId,
        systemRole: SYSTEM_ROLES[intent],
        userPrompt: buildSelfEvalPrompt(pool, ownProposal, intent, context),
        maxTokens: TOKEN_LIMITS.argument,
        temperature: 0.2,
        phase: 'self-evaluating',
        color: chalk.gray,
        highlightPhase: 'analysis',
        maxRetries,
        qualityMinLen: qualityGate,
        silent,
        health,
      });

      if (result.success) {
        // Extract REVISED_ANSWER if present, else keep original
        const revised = result.content.match(/REVISED_ANSWER:\s*([\s\S]+)/i)?.[1]?.trim();
        if (revised && revised.length > qualityGate) {
          state.proposals.set(modelId, revised);
          if (!silent) {
            console.log(chalk.gray(`  ✦ ${modelId} self-improved proposal (${revised.length} chars)`));
          }
        }
        state.messages.push({
          modelId, role: 'proposal',
          content: `[SELF-EVAL] ${result.content}`,
          round: 0, timestamp: Date.now(),
        });
      }
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2+ — ARGUMENT & REBUTTAL ROUNDS
// ─────────────────────────────────────────────────────────────────────────────

async function runArgumentRebuttalRounds(
  ollama: OllamaClient,
  prompt: string,
  intent: QueryIntent,
  debateRounds: number,
  activeModels: string[],
  state: DebateState,
  repManager: ReputationManager,
  pool: Pool,
  opts: Required<DebateOptions>,
  health: HealthTracker
): Promise<string[]> {
  let currentModels = [...activeModels];
  const { silent, context, interactive, maxRetries, qualityGate, onPhaseEnd } = opts;

  for (let round = 1; round <= debateRounds; round++) {
    const isArgumentRound = round === 1;
    const phase = isArgumentRound ? 'argument' : 'rebuttal';
    const phaseLabel = isArgumentRound ? 'ARGUMENTS' : `REBUTTAL ROUND ${round - 1}`;
    const phaseStart = Date.now();

    if (!silent) {
      console.log(chalk.bold.yellow('\n' + hr('─', 60)));
      console.log(chalk.bold.yellow(`  PHASE ${round + 1} — ${phaseLabel}`));
      console.log(chalk.bold.yellow(hr('─', 60)));
    }

    const lastMsgPerModel = new Map<string, string>();
    for (const modelId of currentModels) {
      const msgs = state.messages.filter(m => m.modelId === modelId && !m.content.startsWith('[SELF-EVAL]'));
      if (msgs.length) lastMsgPerModel.set(modelId, msgs[msgs.length - 1].content);
    }

    let focusModel: string | null = null;
    if (interactive && isArgumentRound && !silent) {
      console.log(chalk.bold.blue('\n📢 INTERACTIVE MODE – Select which answer to debate\n'));
      const answers = currentModels.map(modelId => ({
        modelId,
        answer: lastMsgPerModel.get(modelId) ?? state.proposals.get(modelId) ?? '',
      }));
      const chosen = await chooseFocus(answers, true, true);
      if (chosen !== 'all' && chosen !== 'random') focusModel = chosen;
    }

    const roundActiveModels: string[] = [];
    const failedModels: string[] = [];

    await Promise.allSettled(
      currentModels.map(async (modelId) => {
        const ownLast = lastMsgPerModel.get(modelId) ?? state.proposals.get(modelId) ?? '';
        let othersList = currentModels.filter(m => m !== modelId);
        if (focusModel && focusModel !== modelId) othersList = [focusModel];

        const othersText = othersList
          .map(m => {
            const last = lastMsgPerModel.get(m) ?? state.proposals.get(m) ?? '[no position]';
            return `=== ${m} ===\n${last}`;
          })
          .join('\n\n');

        if ((global as any).__graphEnabled) {
          emitGraphEvent({ type: 'model_speaking', modelId, phase, targetModels: othersList });
        }

        const userPrompt = isArgumentRound
          ? buildArgumentPrompt(pool, ownLast, othersText, intent, context)
          : buildRebuttalPrompt(pool, ownLast, othersText, intent, context);

        const result = await runModelWithRetry({
          ollama, modelId,
          systemRole: DEBATE_ROLES[intent],
          userPrompt,
          maxTokens: isArgumentRound ? TOKEN_LIMITS.argument : TOKEN_LIMITS.rebuttal,
          temperature: 0.4,
          phase: `composing ${phase}`,
          color: chalk.yellow,
          highlightPhase: isArgumentRound ? 'argument' : 'rebuttal',
          maxRetries,
          qualityMinLen: qualityGate,
          silent,
          health,
        });

        if (result.success) {
          state.messages.push({
            modelId, role: phase as ModelMessage['role'],
            content: result.content, round, timestamp: Date.now(),
          });
          repManager.update(modelId, { energyDelta: -Math.min(0.1, result.latencyMs / 10_000) });
          roundActiveModels.push(modelId);
        } else {
          failedModels.push(modelId);
        }
      })
    );

    currentModels = roundActiveModels;

    onPhaseEnd?.({
      phase,
      round,
      activeModels: currentModels,
      durationMs: Date.now() - phaseStart,
      failedModels,
    });

    if (currentModels.length < 2) {
      if (!silent) console.log(chalk.red('\nNot enough models remaining. Aborting debate early.'));
      break;
    }
  }

  return currentModels;
}

// ─────────────────────────────────────────────────────────────────────────────
// VOTING PHASE
// ─────────────────────────────────────────────────────────────────────────────

async function runVotingPhase(
  ollama: OllamaClient,
  intent: QueryIntent,
  debateRounds: number,
  activeModels: string[],
  state: DebateState,
  repManager: ReputationManager,
  pool: Pool,
  opts: Required<DebateOptions>,
  health: HealthTracker
): Promise<{ winner: string; voteTally: Map<string, number> }> {
  const { silent, context, onPhaseEnd } = opts;
  const phaseStart = Date.now();

  if (!silent) {
    console.log(chalk.bold.magenta('\n' + hr('─', 60)));
    console.log(chalk.bold.magenta(`  PHASE ${debateRounds + 2} — VOTING`));
    console.log(chalk.bold.magenta(hr('─', 60)));
  }

  const finalPositions = activeModels
    .map(modelId => {
      const msgs = state.messages.filter(
        m => m.modelId === modelId && !m.content.startsWith('[SELF-EVAL]')
      );
      const last = msgs[msgs.length - 1]?.content ?? state.proposals.get(modelId) ?? '[no position]';
      return `=== ${modelId} ===\n${last}`;
    })
    .join('\n\n');

  const voteTally = new Map<string, number>(activeModels.map(m => [m, 0]));
  const confidenceTally = new Map<string, number>(activeModels.map(m => [m, 0]));
  const failedVoters: string[] = [];

  await Promise.allSettled(
    activeModels.map(async (voterModel) => {
      const candidateModels = activeModels.filter(m => m !== voterModel);
      if (candidateModels.length === 0) return;
      if (!silent) console.log(chalk.white(`\n  ${voterModel} is voting...`));

      let nominee = '';
      let reason = '';
      let confidence = 0.0;
      let success = false;

      for (let attempt = 1; attempt <= 3; attempt++) {
        const rawVote = await callModelStreamingVote(
          ollama, voterModel,
          'You are an objective judge. Follow the format exactly. Do not vote for yourself.',
          buildVotePrompt(pool, finalPositions, activeModels, voterModel, intent, context),
          TOKEN_LIMITS.vote, 0.01, 3, NUM_CTX
        );
        const parsed = parseVote(rawVote, candidateModels, voterModel);
        if (parsed && parsed.nominee !== voterModel) {
          nominee = parsed.nominee;
          reason = parsed.reason;
          confidence = parsed.confidence;
          success = true;
          break;
        }
        if (!silent) console.log(chalk.yellow(`    attempt ${attempt}/3 failed — retrying...`));
      }

      if (!success) {
        nominee = candidateModels[Math.floor(Math.random() * candidateModels.length)];
        reason = '[Fallback: parse failed]';
        confidence = 0.0;
        failedVoters.push(voterModel);
        health.record(voterModel, 0, true, false);
        if (!silent) {
          console.log(chalk.yellow(`  ⚠ ${voterModel} failed to vote — assigning random vote to ${nominee}`));
        }
      }

      const vote: Vote = { voter: voterModel, nominee, reason, confidence };
      state.votes.push(vote);
      voteTally.set(nominee, (voteTally.get(nominee) ?? 0) + 1);
      confidenceTally.set(nominee, (confidenceTally.get(nominee) ?? 0) + confidence);
      state.messages.push({
        modelId: voterModel, role: 'vote',
        content: `Votes for: ${nominee}\nReason: ${reason}\nConfidence: ${confidence}`,
        round: debateRounds + 1, timestamp: Date.now(),
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
    })
  );

  if (!silent) console.log(chalk.bold.magenta('\n  VOTE RESULTS:'));

  let topVotes = 0;
  let winner = activeModels[0];
  const sortedTally = [...voteTally.entries()].sort((a, b) => b[1] - a[1]);

  for (const [modelId, count] of sortedTally) {
    if (count > topVotes) { topVotes = count; winner = modelId; }
    const bar = '█'.repeat(Math.max(0, count)) + '░'.repeat(Math.max(0, activeModels.length - 1 - count));
    const line = `  ${bar} ${modelId}: ${count} vote(s) (conf: ${(confidenceTally.get(modelId) ?? 0).toFixed(2)})`;
    if (!silent) console.log(count === topVotes ? chalk.bold.green(line) : chalk.gray(line));
  }

  // Tiebreak: reputation, then confidence
  const tiedModels = sortedTally.filter(([, c]) => c === topVotes).map(([m]) => m);
  if (tiedModels.length > 1) {
    if (!silent) {
      console.log(chalk.yellow(`\n  Tie between: ${tiedModels.join(', ')}`));
      console.log(chalk.yellow('  Tiebreaking by weighted confidence + reputation score...'));
    }
    let bestScore = -Infinity;
    for (const m of tiedModels) {
      const score = repManager.getScore(m) * 0.4 + (confidenceTally.get(m) ?? 0) * 0.6;
      if (score > bestScore) { bestScore = score; winner = m; }
    }
    if (!silent) {
      console.log(chalk.yellow(`  Tiebreak winner: ${winner}`));
    }
  }

  // Update reputation based on vote share
  for (const [modelId, count] of voteTally.entries()) {
    const relScore = activeModels.length > 1 ? (count / (activeModels.length - 1)) - 0.5 : 0;
    repManager.update(modelId, { accuracyDelta: relScore * 0.2, honestyDelta: 0 });
  }

  if (!silent) {
    console.log(chalk.bold.green(`\n  🏆 WINNER: ${winner} with ${topVotes} vote(s)\n`));
  }

  onPhaseEnd?.({
    phase: 'voting',
    round: debateRounds + 1,
    activeModels,
    durationMs: Date.now() - phaseStart,
    failedModels: failedVoters,
  });

  return { winner, voteTally };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHESIS PHASE
// ─────────────────────────────────────────────────────────────────────────────

async function runSynthesisPhase(
  ollama: OllamaClient,
  intent: QueryIntent,
  winner: string,
  debateRounds: number,
  activeModels: string[],
  topVotes: number,
  state: DebateState,
  finalPositions: string,
  pool: Pool,
  opts: Required<DebateOptions>,
  health: HealthTracker
): Promise<string> {
  const { silent, context, onPhaseEnd } = opts;
  const phaseStart = Date.now();

  if (!silent) {
    console.log(chalk.bold.blue('\n' + hr('─', 60)));
    console.log(chalk.bold.blue('  PHASE — SYNTHESIS (STREAMING)'));
    console.log(chalk.bold.blue(hr('─', 60)));
  }

  const winnerMsgs = state.messages.filter(
    m => m.modelId === winner && !m.content.startsWith('[SELF-EVAL]')
  );
  const winnerFinalPosition = winnerMsgs[winnerMsgs.length - 1]?.content
    ?? state.proposals.get(winner)
    ?? 'No position found.';

  const userPrompt = buildSynthesisPrompt(
    pool, winnerFinalPosition, finalPositions, topVotes, activeModels.length, intent, context
  );

  let fullAnswer = '';
  const spinner = silent ? null : ora({ text: `${winner} writing final answer...`, color: 'blue' }).start();

  const { handler } = silent
    ? { handler: undefined as any }
    : makeStreamHandler(spinner!, winner, chalk.cyan, 'synthesis');

  const content = await callModelStreaming(
    ollama, winner,
    SYNTHESIS_ROLES[intent],
    userPrompt,
    TOKEN_LIMITS.synthesis, 0.3, 'synthesis',
    silent ? undefined : handler,
    2, NUM_CTX, true
  );

  spinner?.stop();
  const latencyMs = Date.now() - phaseStart;
  health.record(winner, latencyMs, content === '[NO_RESPONSE]');

  if (content === '[NO_RESPONSE]' || !passesQualityGate(content, opts.qualityGate)) {
    fullAnswer = winnerFinalPosition;
    if (!silent) {
      process.stdout.write('\n');
      console.log(chalk.yellow('  ⚠ Synthesis failed — falling back to winner\'s last position'));
    }
  } else {
    fullAnswer = content;
  }

  state.finalAnswer = fullAnswer;
  state.messages.push({
    modelId: winner, role: 'synthesis', content: fullAnswer,
    round: debateRounds + 2, timestamp: Date.now(),
  });

  if (!silent) {
    const intentLabels: Record<QueryIntent, string> = {
      code:    'FINAL CODE SOLUTION',
      explain: 'FINAL EXPLANATION',
      analyze: 'FINAL ANALYSIS',
      compare: 'FINAL COMPARISON',
      debug:   'FINAL DEBUG REPORT',
    };
    process.stdout.write('\n');
    console.log(chalk.bold.green(hr('═', 60)));
    console.log(chalk.bold.green(`  ${intentLabels[intent]}`));
    console.log(chalk.bold.green(`  ${winner} · ${topVotes}/${activeModels.length - 1} votes · ${latencyMs}ms`));
    console.log(chalk.bold.green(hr('═', 60)));
    console.log(renderMarkdown(fullAnswer));
    console.log(chalk.bold.green(hr('═', 60) + '\n'));
  }

  onPhaseEnd?.({
    phase: 'synthesis',
    round: debateRounds + 2,
    activeModels: [winner],
    durationMs: latencyMs,
    failedModels: [],
  });

  return fullAnswer;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBATE SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

function printDebateSummary(
  state: DebateState,
  winner: string,
  voteTally: Map<string, number>,
  health: HealthTracker,
  totalMs: number,
  intent: QueryIntent,
  repManager: ReputationManager
): void {
  console.log(chalk.bold('\n' + hr('─', 60)));
  console.log(chalk.bold('  DEBATE SUMMARY'));
  console.log(chalk.bold(hr('─', 60)));
  console.log(chalk.gray(`  Intent:       ${intent}`));
  console.log(chalk.gray(`  Total time:   ${(totalMs / 1000).toFixed(1)}s`));
  console.log(chalk.gray(`  Messages:     ${state.messages.length}`));
  console.log(chalk.gray(`  Votes cast:   ${state.votes.length}`));
  console.log(chalk.bold.green(`  Winner:       ${winner} (${voteTally.get(winner) ?? 0} votes)`));
  console.log(chalk.gray('\n  Model health:'));
  console.log(health.summary().split('\n').map(l => `    ${l}`).join('\n'));
  console.log(chalk.gray('\n  Reputation scores:'));
  for (const [m] of voteTally.entries()) {
    console.log(chalk.gray(`    ${m}: ${repManager.getScore(m).toFixed(3)}`));
  }
  console.log(chalk.bold(hr('─', 60) + '\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK — single-model answer when debate collapses
// ─────────────────────────────────────────────────────────────────────────────

async function fallbackSingleModel(
  ollama: OllamaClient,
  pool: Pool,
  userPrompt: string,
  intent: QueryIntent,
  repManager: ReputationManager,
  opts: Required<DebateOptions>
): Promise<string> {
  let best = pool.models[0];
  let bestScore = repManager.getScore(best);
  for (const m of pool.models.slice(1)) {
    const s = repManager.getScore(m);
    if (s > bestScore) { bestScore = s; best = m; }
  }

  if (!opts.silent) {
    console.log(chalk.yellow(`\n  Debate collapsed — falling back to best-reputation model: ${best}`));
  }

  const resp = await ollama.chat(best, [{ role: 'user', content: userPrompt }], 600, 0.2);
  const answer = resp.content;

  if (!opts.silent) {
    console.log(chalk.bold.yellow('\n  FALLBACK ANSWER:'));
    console.log(answer + '\n');
  }

  return answer;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT OPTIONS RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

function resolveOptions(opts: DebateOptions): Required<DebateOptions> {
  return {
    rounds:       Math.max(1, opts.rounds ?? 2),
    interactive:  opts.interactive ?? false,
    graph:        opts.graph ?? false,
    turbo:        opts.turbo ?? false,
    selfEval:     opts.selfEval ?? false,
    memory:       opts.memory ?? false,
    silent:       opts.silent ?? false,
    context:      opts.context ?? '',
    intent:       opts.intent as QueryIntent ?? 'explain',
    timeout:      opts.timeout ?? DEFAULT_TIMEOUT,
    minConsensus: opts.minConsensus ?? 0.5,
    qualityGate:  opts.qualityGate ?? QUALITY_MIN_LEN,
    maxRetries:   opts.maxRetries ?? DEFAULT_RETRIES,
    onPhaseEnd:   opts.onPhaseEnd ?? (() => {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export async function runPoolDebate(
  pool: Pool,
  userPrompt: string,
  options: DebateOptions = {}
): Promise<string> {
  const debateStart = Date.now();

  // Resolve intent early so it's available throughout
  const intent: QueryIntent = options.intent ?? detectIntent(userPrompt);
  const opts = resolveOptions({ ...options, intent });
  const { rounds: debateRounds, silent, turbo, graph } = opts;

  // ── Config ────────────────────────────────────────────────────────────────
  const config = await loadConfig();
  const originalSelected = config.selectedModels;
  config.selectedModels = pool.models;
  await saveConfig(config);

  // ── Infrastructure ────────────────────────────────────────────────────────
  const ollama = new OllamaClient();
  if (!(await ollama.isRunning())) {
    config.selectedModels = originalSelected;
    await saveConfig(config);
    throw new Error('Ollama is not running. Start it with `ollama serve`.');
  }

  const repManager = new ReputationManager();
  const health     = new HealthTracker();
  health.init(pool.models);

  if (!silent) {
    if (turbo) {
      console.log(chalk.gray('  Turbo mode — optimizing system resources...'));
      await showResourceReport();
      optimizeOllamaEnv();
      setProcessPriority();
    } else {
      await showResourceReport();
    }
  }

  if (graph && !silent) {
    startGraphServer(8080);
    (global as any).__graphEnabled = true;
    emitGraphEvent({ type: 'status', message: 'Warming up models...' });
    emitGraphEvent({ type: 'models_selected', models: pool.models });
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const state: DebateState = {
    topic: userPrompt,
    messages: [],
    proposals: new Map(),
    votes: [],
    winner: null,
    finalAnswer: '',
  };

  // ── Banner ────────────────────────────────────────────────────────────────
  if (!silent) {
    const INTENT_COLORS: Record<QueryIntent, ChalkFn> = {
      code:    chalk.bgYellow.black,
      explain: chalk.bgBlue.white,
      analyze: chalk.bgMagenta.white,
      compare: chalk.bgCyan.black,
      debug:   chalk.bgRed.white,
    };
    const badge = INTENT_COLORS[intent](` ${intent.toUpperCase()} `);
    console.log(chalk.bold('\n' + hr('═', 60)));
    console.log(chalk.bold.white('  POOL DEBATE — ' + pool.name.toUpperCase()) + '  ' + badge);
    console.log(chalk.bold(hr('═', 60)));
    console.log(chalk.cyan(`  Request:  "${userPrompt}"`));
    if (opts.context) {
      console.log(chalk.gray(`  Context:  provided (${opts.context.length} chars)`));
    }
    console.log(chalk.gray(`  Pool:     ${pool.name} — ${pool.description}`));
    console.log(chalk.gray(`  Models:   ${pool.models.join(', ')}`));
    console.log(chalk.gray(`  Rounds:   ${debateRounds}  |  Self-eval: ${opts.selfEval}  |  Turbo: ${turbo}`));
    console.log(chalk.gray(`  Quality gate: ${opts.qualityGate} chars  |  Max retries: ${opts.maxRetries}`));
    console.log(chalk.bold(hr('═', 60)) + '\n');
  }

  // ── Warmup ────────────────────────────────────────────────────────────────
  let activeModels = await warmupModels(ollama, pool.models);
  if (activeModels.length < 2) {
    if (!silent) console.log(chalk.red('Not enough models to run a debate (need at least 2).'));
    if (graph && !silent) closeGraphServer();
    config.selectedModels = originalSelected;
    await saveConfig(config);
    throw new Error('Not enough models responded during warmup.');
  }

  // ── Phase 1: Proposals ────────────────────────────────────────────────────
  activeModels = await runProposalPhase(
    ollama, userPrompt, intent, activeModels, state, repManager, pool, opts, health
  );
  if (activeModels.length < 2) {
    const answer = await fallbackSingleModel(ollama, pool, userPrompt, intent, repManager, opts);
    config.selectedModels = originalSelected;
    await saveConfig(config);
    if (graph && !silent) closeGraphServer();
    return answer;
  }

  // ── Phase 1.5: Self-evaluation (optional) ────────────────────────────────
  await runSelfEvalPhase(ollama, intent, activeModels, state, pool, opts, health);

  // ── Phase 2+: Arguments & Rebuttals ──────────────────────────────────────
  activeModels = await runArgumentRebuttalRounds(
    ollama, userPrompt, intent, debateRounds, activeModels, state, repManager, pool, opts, health
  );
  if (activeModels.length < 2) {
    const answer = await fallbackSingleModel(ollama, pool, userPrompt, intent, repManager, opts);
    config.selectedModels = originalSelected;
    await saveConfig(config);
    if (graph && !silent) closeGraphServer();
    return answer;
  }

  // ── Snapshot final positions ──────────────────────────────────────────────
  const finalPositions = activeModels
    .map(modelId => {
      const msgs = state.messages.filter(
        m => m.modelId === modelId && !m.content.startsWith('[SELF-EVAL]')
      );
      const last = msgs[msgs.length - 1]?.content ?? state.proposals.get(modelId) ?? '[no position]';
      return `=== ${modelId} ===\n${last}`;
    })
    .join('\n\n');

  // ── Voting ────────────────────────────────────────────────────────────────
  const { winner, voteTally } = await runVotingPhase(
    ollama, intent, debateRounds, activeModels, state, repManager, pool, opts, health
  );

  // ── Synthesis ─────────────────────────────────────────────────────────────
  const finalAnswer = await runSynthesisPhase(
    ollama, intent, winner, debateRounds,
    activeModels, voteTally.get(winner) ?? 0,
    state, finalPositions, pool, opts, health
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  if (!silent) {
    printDebateSummary(state, winner, voteTally, health, Date.now() - debateStart, intent, repManager);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  if (graph && !silent) {
    setTimeout(() => {
      closeGraphServer();
      delete (global as any).__graphEnabled;
    }, 3000);
  }

  config.selectedModels = originalSelected;
  await saveConfig(config);

  return finalAnswer;
}