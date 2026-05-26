import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk, { type ChalkInstance } from 'chalk';
import { type ModelMessage } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, '..', '..', 'prompts');

export function loadPrompt(name: string): string {
    const filePath = path.join(PROMPTS_DIR, name);
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    return '';
}

export function hr(char = '═', width = 60) {
    return char.repeat(width);
}

export const REFUSAL_PATTERNS = [
    /cannot provide/i,
    /i am unable/i,
    /i cannot/i,
    /i don't know/i,
    /as an ai/i,
    /i am not programmed/i,
    /i don't have an opinion/i,
    /i cannot answer/i,
    /i'm sorry/i,
];

export function isRefusal(content: string): boolean {
    return REFUSAL_PATTERNS.some(pattern => pattern.test(content));
}

export const ROLE_COLORS: Record<ModelMessage['role'], ChalkInstance> = {
    proposal:  chalk.cyan,
    argument:  chalk.yellow,
    rebuttal:  chalk.red,
    agreement: chalk.green,
    vote:      chalk.magenta,
    synthesis: chalk.bold.blue,
};

export function printMessage(msg: ModelMessage) {
    const color = ROLE_COLORS[msg.role] ?? chalk.white;
    console.log(`\n${color(`[${msg.modelId.toUpperCase()}] ${msg.role.toUpperCase()}`)}`);
    console.log(chalk.gray(hr('─', 50)));
    const preview = msg.content.length > 400 ? msg.content.substring(0, 400) + chalk.gray('…') : msg.content;
    console.log(preview);
}

export function parseVote(raw: string, candidates: string[], voterId: string): { nominee: string; reason: string; confidence: number } | null {
    const lines = raw.split('\n');
    let voteLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*VOTE\s*:/i.test(lines[i])) {
            voteLineIndex = i;
            break;
        }
    }
    if (voteLineIndex === -1) return null;

    const voteLine = lines[voteLineIndex];
    const voteMatch = voteLine.match(/VOTE[:\s]+([^\n]+)/i);
    if (!voteMatch) return null;

    const found = candidates.find(c => voteMatch[1].toLowerCase().includes(c.toLowerCase()));
    if (!found || found === voterId) return null;

    let reason = '';
    let confidence = 0.5;
    for (let i = voteLineIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*REASON\s*:/i.test(line)) {
            reason = line.replace(/^\s*REASON\s*:\s*/i, '').trim();
        } else if (/^\s*CONFIDENCE\s*:/i.test(line)) {
            const confMatch = line.match(/CONFIDENCE\s*:\s*([\d.]+)/i);
            if (confMatch) confidence = Math.min(1, Math.max(0, parseFloat(confMatch[1])));
        }
    }
    if (!reason) reason = raw.substring(0, 150);
    return { nominee: found, reason, confidence };
}