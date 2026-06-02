import fs from 'fs/promises';
import path from 'path';
import { Minimatch } from 'minimatch';

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.next/**',
  'out/**',
  'target/**',
  '.env*',
  '*.log',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.git/**',
  '.svn/**',
  '.hg/**',
  '.vscode/**',
  '.idea/**',
  '*.swp',
  '*.swo',
  '*~',
  '.cache/**',
  '.parcel-cache/**',
  '.turbo/**',
  'coverage/**',
  '.nyc_output/**',
  '.DS_Store',
  'Thumbs.db',
];

export class IgnoreFilter {
  private matchers: Minimatch[] = [];
  private rootPath: string;

  constructor(rootPath: string, additionalPatterns: string[] = []) {
    this.rootPath = path.resolve(rootPath);
    this.init(additionalPatterns);
  }

  private async init(additionalPatterns: string[]): Promise<void> {
    const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...additionalPatterns];

    const gitignorePath = path.join(this.rootPath, '.gitignore');
    try {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      const lines = gitignoreContent.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          allPatterns.push(trimmed);
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`[IgnoreFilter] Could not read .gitignore: ${err.message}`);
      }
    }

    for (const pattern of allPatterns) {
      if (pattern.trim()) {
        let resolvedPattern = pattern;
        if (!pattern.startsWith('**') && !pattern.startsWith('/') && !pattern.includes('/')) {

        }
        this.matchers.push(new Minimatch(resolvedPattern, { dot: true, matchBase: true }));
      }
    }
  }

  shouldIgnore(relativePath: string, isDir: boolean = false): boolean {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    for (const matcher of this.matchers) {
      if (matcher.match(normalizedPath)) {
        return true;
      }
      if (isDir && !matcher.pattern.endsWith('/') && matcher.match(normalizedPath + '/')) {
        return true;
      }
    }
    return false;
  }

  filterPaths(paths: string[], isDir?: boolean): string[] {
    return paths.filter(p => !this.shouldIgnore(p, isDir));
  }
}