import chokidar from 'chokidar';
import path from 'path';
import { ProjectManager } from './ProjectManager.js';
import { ProjectScanner } from './ProjectScanner.js';
import { OllamaClient } from '@aicp/cli/src/ollama/client.js';
import { IgnoreFilter } from './IgnoreFilter.js';
import { logger } from './utils/logger.js';

export interface WatcherEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
}

export type WatcherCallback = (event: WatcherEvent) => void;

export class ProjectWatcher {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private projectManager: ProjectManager;
  private ollama: OllamaClient;
  private scanner: ProjectScanner;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number = 500;

  constructor(ollama: OllamaClient) {
    this.projectManager = new ProjectManager();
    this.ollama = ollama;
    this.scanner = new ProjectScanner(ollama);
  }


  async startWatching(projectName: string, onEvent?: WatcherCallback): Promise<void> {
    const project = await this.projectManager.getProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    if (this.watchers.has(project.id)) {
      logger.warn(`Watcher already running for project ${project.name}`);
      return;
    }

    const ignoreFilter = new IgnoreFilter(project.rootPath, project.config.ignorePatterns);

    const watcher = chokidar.watch(project.rootPath, {
      ignored: (filePath: string) => {
        const relative = path.relative(project.rootPath, filePath);
        return ignoreFilter.shouldIgnore(relative, false);
      },
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      disableGlobbing: false,
    });

    watcher
      .on('add', (filePath) => this.handleChange(project, filePath, 'add', onEvent))
      .on('change', (filePath) => this.handleChange(project, filePath, 'change', onEvent))
      .on('unlink', (filePath) => this.handleUnlink(project, filePath, onEvent));

    this.watchers.set(project.id, watcher);
    logger.success(`Watching project ${project.name} at ${project.rootPath}`);
  }

  async stopWatching(projectName: string): Promise<void> {
    const project = await this.projectManager.getProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    const watcher = this.watchers.get(project.id);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(project.id);
      logger.info(`Stopped watching project ${project.name}`);
    }
  }

  async stopAll(): Promise<void> {
    for (const [id, watcher] of this.watchers.entries()) {
      await watcher.close();
      logger.info(`Stopped watcher for project ${id}`);
    }
    this.watchers.clear();
  }

  private handleChange(
    project: any,
    filePath: string,
    type: 'add' | 'change',
    onEvent?: WatcherCallback
  ): void {
    const relativePath = path.relative(project.rootPath, filePath);
    const key = `${project.id}:${relativePath}`;
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key)!);
    }
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(key);
      try {
        logger.progress(`[${project.name}] ${type} ${relativePath} – reindexing...`);
        const chunksAdded = await this.scanner.scanSingleFile(project.name, relativePath);
        logger.success(`[${project.name}] Reindexed ${relativePath} (${chunksAdded} chunks)`);
        if (onEvent) {
          onEvent({ type, filePath: relativePath });
        }
      } catch (err: any) {
        logger.error(`[${project.name}] Failed to reindex ${relativePath}: ${err.message}`);
      }
    }, this.debounceMs);
    this.debounceTimers.set(key, timer);
  }

  private async handleUnlink(
    project: any,
    filePath: string,
    onEvent?: WatcherCallback
  ): Promise<void> {
    const relativePath = path.relative(project.rootPath, filePath);
    try {
      const { VectorStore } = await import('./VectorStore.js');
      const vectorStore = new VectorStore(project.id);
      vectorStore.deleteChunksByFile(relativePath);
      const newTotal = vectorStore.getChunkCount();
      await this.projectManager.updateIndexStats(project.id, newTotal);
      vectorStore.close();
      logger.success(`[${project.name}] Removed chunks for deleted file ${relativePath}`);
      if (onEvent) {
        onEvent({ type: 'unlink', filePath: relativePath });
      }
    } catch (err: any) {
      logger.error(`[${project.name}] Failed to remove chunks for ${relativePath}: ${err.message}`);
    }
  }
}