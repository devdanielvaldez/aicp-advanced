export interface CodeChunk {
  id?: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  tokens?: number;
}

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  poolId: string;
  createdAt: string;
  lastIndexedAt: string | null;
  totalChunks: number;
  config: ProjectConfig;
}

export interface ProjectConfig {
  ignorePatterns: string[]
  chunkSizeTokens: number;
  embeddingModel: string;
  autoWatch: boolean;
}

export interface IndexMetadata {
  projectId: string;
  filePath: string;
  chunkCount: number;
  lastModified: number;
}

export interface SearchResult {
  chunk: CodeChunk;
  distance: number;
  projectId: string;
}