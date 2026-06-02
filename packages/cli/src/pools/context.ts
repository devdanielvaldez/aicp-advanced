import { Retriever } from '@aicp/project';
import { OllamaClient } from '../ollama/client.js';

export interface ContextOptions {
  projectName?: string;
  query: string;
  topK?: number;
}

export class ProjectContextProvider {
  private retriever: Retriever | null = null;
  private ollama: OllamaClient;

  constructor(ollama: OllamaClient) {
    this.ollama = ollama;
  }

  async getContext(options: ContextOptions): Promise<string> {
    if (!options.projectName) return '';
    if (!this.retriever) {
      const { Retriever } = await import('@aicp/project');
      this.retriever = new Retriever(this.ollama);
    }
    try {
      const context = await this.retriever.retrieveAsContext(
        options.projectName,
        options.query,
        { k: options.topK || 5 }
      );
      return context;
    } catch (err) {
      console.warn(`Could not retrieve context from project ${options.projectName}:`, err);
      return '';
    }
  }

  close() {
    if (this.retriever) {
      this.retriever.closeAll();
      this.retriever = null;
    }
  }
}