import { CodeChunk } from './types.js';

export interface ChunkOptions {
  maxTokens: number;
  minLines: number;
  preserveBlocks: boolean;
}

const DEFAULT_OPTIONS: ChunkOptions = {
  maxTokens: 500,
  minLines: 5,
  preserveBlocks: true,
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class CodeChunker {
  private options: ChunkOptions;

  constructor(options: Partial<ChunkOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  chunkFile(filePath: string, content: string): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];

    if (this.options.preserveBlocks) {
      const blocks = this.extractBlocks(lines);
      for (const block of blocks) {
        const tokenEstimate = estimateTokens(block.content);
        if (tokenEstimate <= this.options.maxTokens) {
          chunks.push(block);
        } else {
          chunks.push(...this.chunkByLines(filePath, block.content, block.startLine));
        }
      }
    } else {
      chunks.push(...this.chunkByLines(filePath, content, 0));
    }

    if (chunks.length === 0 && content.trim().length > 0) {
      chunks.push({
        filePath,
        startLine: 1,
        endLine: lines.length,
        content: content,
      });
    }

    return chunks;
  }

  private extractBlocks(lines: string[]): CodeChunk[] {
    const blocks: CodeChunk[] = [];
    let i = 0;
    const n = lines.length;

    while (i < n) {
      const line = lines[i];
      const trimmed = line.trim();

      const isStartOfBlock = /^(export\s+)?(function|class|const|let|var|async\s+function|async\s+\(|\(.*\)\s*=>)/.test(trimmed) ||
                              /^\s*(if|for|while|switch)\s*\(/.test(trimmed) ||
                              (trimmed.endsWith('{') && !trimmed.startsWith('//') && !trimmed.startsWith('/*'));

      if (isStartOfBlock) {
        let startLine = i + 1;
        let braceCount = 0;
        let j = i;
        let started = false;

        while (j < n) {
          const l = lines[j];
          for (const ch of l) {
            if (ch === '{') braceCount++;
            else if (ch === '}') braceCount--;
          }
          if (braceCount === 0 && started) break;
          if (braceCount > 0) started = true;
          j++;
        }
        let endLine = j + 1;
        const blockContent = lines.slice(i, j + 1).join('\n');
        const tokenEstimate = estimateTokens(blockContent);

        if (blockContent.trim().length > 0) {
          blocks.push({
            filePath: '',
            startLine: Math.floor(startLine),
            endLine: Math.floor(endLine),
            content: blockContent,
          });
        }
        i = j + 1;
      } else {
        i++;
      }
    }

    if (blocks.length === 0) {
      return this.chunkByBlankLines(lines);
    }

    return blocks;
  }

  private chunkByBlankLines(lines: string[]): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    let start = 0;
    let i = 0;
    while (i < lines.length) {
      if (lines[i].trim() === '') {
        if (i > start) {
          const content = lines.slice(start, i).join('\n');
          if (content.trim().length > 0) {
            chunks.push({
              filePath: '',
              startLine: Math.floor(start + 1),
              endLine: Math.floor(i),
              content,
            });
          }
        }
        start = i + 1;
      }
      i++;
    }
    if (start < lines.length) {
      const content = lines.slice(start).join('\n');
      if (content.trim().length > 0) {
        chunks.push({
          filePath: '',
          startLine: Math.floor(start + 1),
          endLine: Math.floor(lines.length),
          content,
        });
      }
    }
    return chunks;
  }

  private chunkByLines(filePath: string, content: string, startLineOffset: number): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    let currentChunkLines: string[] = [];
    let currentTokens = 0;
    let chunkStartLine = startLineOffset + 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = estimateTokens(line + '\n');
      if (currentTokens + lineTokens > this.options.maxTokens && currentChunkLines.length > 0) {
        const chunkContent = currentChunkLines.join('\n');
        if (chunkContent.trim().length > 0) {
          chunks.push({
            filePath,
            startLine: Math.floor(chunkStartLine),
            endLine: Math.floor(chunkStartLine + currentChunkLines.length - 1),
            content: chunkContent,
          });
        }
        currentChunkLines = [];
        currentTokens = 0;
        chunkStartLine = startLineOffset + i + 1;
      }
      currentChunkLines.push(line);
      currentTokens += lineTokens;
    }

    if (currentChunkLines.length > 0) {
      const chunkContent = currentChunkLines.join('\n');
      if (chunkContent.trim().length > 0) {
        chunks.push({
          filePath,
          startLine: Math.floor(chunkStartLine),
          endLine: Math.floor(chunkStartLine + currentChunkLines.length - 1),
          content: chunkContent,
        });
      }
    }

    const finalChunks: CodeChunk[] = [];
    for (const chunk of chunks) {
      if (estimateTokens(chunk.content) <= this.options.maxTokens) {
        finalChunks.push(chunk);
      } else {
        const subChunks = this.splitLongChunk(chunk);
        finalChunks.push(...subChunks);
      }
    }
    return finalChunks;
  }

  private splitLongChunk(chunk: CodeChunk): CodeChunk[] {
    const lines = chunk.content.split('\n');
    const subChunks: CodeChunk[] = [];
    let acc = '';
    let accTokens = 0;
    let startLine = chunk.startLine;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = estimateTokens(line + '\n');
      if (accTokens + lineTokens > this.options.maxTokens && acc.length > 0) {
        subChunks.push({
          filePath: chunk.filePath,
          startLine: Math.floor(startLine),
          endLine: Math.floor(startLine + acc.split('\n').length - 1),
          content: acc,
        });
        acc = line + '\n';
        accTokens = lineTokens;
        startLine = chunk.startLine + i;
      } else {
        acc += line + '\n';
        accTokens += lineTokens;
      }
    }
    if (acc.length > 0) {
      subChunks.push({
        filePath: chunk.filePath,
        startLine: Math.floor(startLine),
        endLine: Math.floor(chunk.endLine),
        content: acc,
      });
    }
    return subChunks;
  }
}