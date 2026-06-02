import { VectorStore } from './VectorStore.js';
import { ProjectManager } from './ProjectManager.js';
import { OllamaClient } from '@aicp/cli/src/ollama/client.js';
import { SearchResult } from './types.js';

export interface RetrievalOptions {
  k: number;
  minSimilarity: number;
}

const DEFAULT_OPTIONS: RetrievalOptions = {
  k: 5,
  minSimilarity: 1.5,
};

export class Retriever {
  private projectManager: ProjectManager;
  private ollama: OllamaClient;
  private vectorStoreCache: Map<string, VectorStore> = new Map();

  constructor(ollama: OllamaClient) {
    this.projectManager = new ProjectManager();
    this.ollama = ollama;
  }

  private getVectorStore(projectId: string): VectorStore {
    if (!this.vectorStoreCache.has(projectId)) {
      this.vectorStoreCache.set(projectId, new VectorStore(projectId));
    }
    return this.vectorStoreCache.get(projectId)!;
  }

  async retrieve(
    projectName: string,
    query: string,
    options: Partial<RetrievalOptions> = {}
  ): Promise<SearchResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const project = await this.projectManager.getProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    const embedResponse = await this.ollama.embed(project.config.embeddingModel, query);
    const queryEmbedding = embedResponse.embedding;

    const vectorStore = this.getVectorStore(project.id);
    const results = vectorStore.search(queryEmbedding, opts.k);

    const filtered = results.filter(r => r.distance < opts.minSimilarity);

    return filtered.map(r => ({
      chunk: {
        filePath: r.filePath,
        startLine: r.startLine,
        endLine: r.endLine,
        content: r.content,
      },
      distance: r.distance,
      projectId: project.id,
    }));
  }

  async retrieveAsContext(
    projectName: string,
    query: string,
    options: Partial<RetrievalOptions> = {}
  ): Promise<string> {
    const results = await this.retrieve(projectName, query, options);
    if (results.length === 0) {
      return '';
    }

    const contextParts: string[] = [];
    for (const r of results) {
      const filePath = r.chunk.filePath;
      const start = r.chunk.startLine;
      const end = r.chunk.endLine;
      const content = r.chunk.content;
      contextParts.push(
        `[Relevant code from ${filePath} (lines ${start}-${end}):\n` +
        '```' +
        content +
        '```\n]'
      );
    }
    return contextParts.join('\n\n');
  }

  closeAll(): void {
    for (const store of this.vectorStoreCache.values()) {
      store.close();
    }
    this.vectorStoreCache.clear();
  }
}