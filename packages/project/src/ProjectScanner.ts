import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { ProjectManager } from './ProjectManager.js';
import { VectorStore } from './VectorStore.js';
import { CodeChunker, ChunkOptions } from './CodeChunker.js';
import { IgnoreFilter } from './IgnoreFilter.js';
import { OllamaClient } from '@aicp/cli/src/ollama/client.js';
import { logger } from './utils/logger.js';

const EXTENSIONS = ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'];

export class ProjectScanner {
  private ollama: OllamaClient;
  private chunker: CodeChunker;

  constructor(ollama: OllamaClient, chunkOptions?: Partial<ChunkOptions>) {
    this.ollama = ollama;
    this.chunker = new CodeChunker(chunkOptions);
  }

  async scanProject(projectName: string): Promise<{ filesScanned: number; chunksCreated: number }> {
    const projectManager = new ProjectManager();
    const project = await projectManager.getProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    logger.progress(`Indexing project ${project.name}...`);
    const ignoreFilter = new IgnoreFilter(project.rootPath, project.config.ignorePatterns);
    const vectorStore = new VectorStore(project.id);

    vectorStore.deleteAllChunks();

    const pattern = `**/*.{${EXTENSIONS.join(',')}}`;
    const files = await glob(pattern, {
      cwd: project.rootPath,
      absolute: true,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    });

    let totalChunks = 0;
    let filesScanned = 0;

    for (const filePath of files) {
      const relativePath = path.relative(project.rootPath, filePath);
      if (ignoreFilter.shouldIgnore(relativePath)) {
        continue;
      }
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const chunks = this.chunker.chunkFile(relativePath, content);
        for (const chunk of chunks) {
          const embedResponse = await this.ollama.embed(project.config.embeddingModel, chunk.content);
          vectorStore.insertChunk(chunk, embedResponse.embedding);
          totalChunks++;
        }
        filesScanned++;
        if (filesScanned % 10 === 0) {
          logger.progress(`Indexed ${filesScanned} files, ${totalChunks} chunks...`);
        }
      } catch (err: any) {
        logger.warn(`Failed to index ${relativePath}: ${err.message}`);
      }
    }

    await projectManager.updateIndexStats(project.id, totalChunks);
    vectorStore.close();
    logger.success(`Indexed ${filesScanned} files, ${totalChunks} chunks for project ${project.name}`);
    return { filesScanned, chunksCreated: totalChunks };
  }

  async scanSingleFile(projectName: string, relativePath: string): Promise<number> {
    const projectManager = new ProjectManager();
    const project = await projectManager.getProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    const ignoreFilter = new IgnoreFilter(project.rootPath, project.config.ignorePatterns);
    if (ignoreFilter.shouldIgnore(relativePath)) {
      logger.warn(`File ${relativePath} is ignored, skipping`);
      return 0;
    }

    const filePath = path.join(project.rootPath, relativePath);
    const ext = path.extname(filePath).slice(1);
    if (!EXTENSIONS.includes(ext)) {
      logger.warn(`File ${relativePath} has unsupported extension, skipping`);
      return 0;
    }

    const vectorStore = new VectorStore(project.id);
    vectorStore.deleteChunksByFile(relativePath);

    const content = await fs.readFile(filePath, 'utf-8');
    const chunks = this.chunker.chunkFile(relativePath, content);
    for (const chunk of chunks) {
      const embedResponse = await this.ollama.embed(project.config.embeddingModel, chunk.content);
      vectorStore.insertChunk(chunk, embedResponse.embedding);
    }

    const totalChunks = vectorStore.getChunkCount();
    await projectManager.updateIndexStats(project.id, totalChunks);
    vectorStore.close();

    return chunks.length;
  }
}