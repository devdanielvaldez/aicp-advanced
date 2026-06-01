import { OllamaClient } from '../ollama/client.js';
import { logger } from '../utils/logger.js';
import chalk from 'chalk';
import { isRefusal } from './utils.js';
import { emitGraphEvent } from './graph-server.js';

export async function callModelStreaming(
    ollama: OllamaClient,
    modelId: string,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    temperature: number,
    phase: string,
    onStream: (chunk: string, full: string) => void,
    maxRetries = 2,
    numCtx = 65536,
    applyFormatting = false
): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const messages: { role: 'system' | 'user'; content: string }[] = [];
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }
            messages.push({ role: 'user', content: userPrompt });

            let fullContent = '';
            const wrappedOnStream = (chunk: string, full: string) => {
                let styledChunk = chunk;
                if (applyFormatting) {
                    styledChunk = styledChunk.replace(/`([^`]+)`/g, (_, code) => chalk.bgGray.white(code));
                    styledChunk = styledChunk.replace(/\b(REASONING|ANSWER|CODE|CRITIQUE|DEFENSE|CONCESSION|REBUTTAL|FINAL POSITION):/g, (match) => chalk.yellow.bold(match));
                    styledChunk = styledChunk.replace(/\*\*([^*]+)\*\*/g, (_, t) => chalk.bold(t));
                    styledChunk = styledChunk.replace(/\*([^*]+)\*/g, (_, t) => chalk.italic(t));
                }
                if ((global as any).__graphEnabled) {
                    emitGraphEvent({
                        type: 'stream_chunk',
                        modelId,
                        phase,
                        chunk: chunk,
                        fullText: full
                    });
                }
                onStream(styledChunk, full);
                fullContent = full;
            };

            const result = await ollama.chatStream(
                modelId,
                messages,
                maxTokens,
                temperature,
                wrappedOnStream,
                numCtx
            );

            const trimmed = result.trim();
            if (trimmed && trimmed.length >= 10 && !trimmed.includes('[ERROR]') && trimmed !== '[No response]') {
                if (isRefusal(trimmed)) {
                    logger.warn(`[${modelId}] refused to answer (attempt ${attempt})`);
                    throw new Error('Model refused to answer');
                }
                return trimmed;
            }
        } catch (err: any) {
            logger.warn(`[${modelId}] attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        }
        if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    return '[NO_RESPONSE]';
}

export async function callModelStreamingVote(
    ollama: OllamaClient,
    modelId: string,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    temperature: number,
    maxRetries = 3,
    numCtx = 8192
): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const messages: { role: 'system' | 'user'; content: string }[] = [];
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }
            messages.push({ role: 'user', content: userPrompt });

            let fullContent = '';
            let chunkCount = 0;
            const onStream = (chunk: string, acc: string) => {
                if (chunkCount === 0) {
                    console.log(chalk.green(`[${modelId}] vote:`));
                    process.stdout.write(chalk.magenta(chunk));
                } else {
                    process.stdout.write(chalk.magenta(chunk));
                }
                chunkCount++;
                fullContent = acc;
            };

            fullContent = await ollama.chatStream(
                modelId,
                messages,
                maxTokens,
                temperature,
                onStream,
                numCtx
            );
            console.log('');

            const trimmed = fullContent.trim();
            if (trimmed && trimmed.length >= 5 && !trimmed.includes('[ERROR]') && trimmed !== '[No response]') {
                if (isRefusal(trimmed)) {
                    logger.warn(`[${modelId}] refused to vote (attempt ${attempt})`);
                    throw new Error('Model refused to vote');
                }
                return trimmed;
            }
        } catch (err: any) {
            logger.warn(`[${modelId}] vote attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        }
        if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    return '[NO_RESPONSE]';
}

export async function callModel(
    ollama: OllamaClient,
    modelId: string,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    temperature = 0.3,
    maxRetries = 2,
    numCtx = 65536 
): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const messages: { role: 'system' | 'user'; content: string }[] = [];
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }
            messages.push({ role: 'user', content: userPrompt });

            const response = await ollama.chat(
                modelId,
                messages,
                maxTokens,
                temperature,
                numCtx
            );
            const content = response.content?.trim();

            if (content && content.length >= 5 && !content.includes('[ERROR]') && content !== '[No response]') {
                if (isRefusal(content)) {
                    logger.warn(`[${modelId}] refused to answer (attempt ${attempt})`);
                    throw new Error('Model refused to answer');
                }
                return content;
            }
        } catch (err: any) {
            logger.warn(`[${modelId}] attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        }
        if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    return '[NO_RESPONSE]';
}