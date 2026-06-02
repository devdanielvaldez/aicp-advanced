import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { Project, ProjectConfig } from './types.js';

const AICP_DIR = path.join(os.homedir(), '.aicp');
const PROJECTS_FILE = path.join(AICP_DIR, 'projects.json');

const DEFAULT_CONFIG: ProjectConfig = {
  ignorePatterns: [],
  chunkSizeTokens: 500,
  embeddingModel: 'nomic-embed-text',
  autoWatch: false,
};

export class ProjectManager {
  private projects: Map<string, Project> = new Map();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(AICP_DIR, { recursive: true });
    try {
      const data = await fs.readFile(PROJECTS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        for (const p of parsed) {
          this.projects.set(p.id, p);
        }
      } else if (parsed.projects) {
        for (const p of parsed.projects) {
          this.projects.set(p.id, p);
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
    this.initialized = true;
  }

  private async save(): Promise<void> {
    const projectsArray = Array.from(this.projects.values());
    await fs.writeFile(PROJECTS_FILE, JSON.stringify({ projects: projectsArray }, null, 2));
  }

  async createProject(
    name: string,
    rootPath: string,
    poolId: string,
    config?: Partial<ProjectConfig>
  ): Promise<Project> {
    await this.init();
    for (const p of this.projects.values()) {
      if (p.name === name) {
        throw new Error(`Project with name "${name}" already exists`);
      }
    }
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name,
      rootPath: path.resolve(rootPath),
      poolId,
      createdAt: now,
      lastIndexedAt: null,
      totalChunks: 0,
      config: {
        ...DEFAULT_CONFIG,
        ...config,
      },
    };
    this.projects.set(project.id, project);
    await this.save();
    return project;
  }

  async getProject(idOrName: string): Promise<Project | null> {
    await this.init();
    let p = this.projects.get(idOrName);
    if (p) return p;
    for (const proj of this.projects.values()) {
      if (proj.name === idOrName) return proj;
    }
    return null;
  }

  async getAllProjects(): Promise<Project[]> {
    await this.init();
    return Array.from(this.projects.values());
  }

  async updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project> {
    await this.init();
    const project = this.projects.get(id);
    if (!project) throw new Error(`Project with id ${id} not found`);
    Object.assign(project, updates);
    project.lastIndexedAt = updates.lastIndexedAt !== undefined ? updates.lastIndexedAt : project.lastIndexedAt;
    await this.save();
    return project;
  }

  async updateProjectByName(name: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project> {
    const project = await this.getProject(name);
    if (!project) throw new Error(`Project with name ${name} not found`);
    return this.updateProject(project.id, updates);
  }

  async deleteProject(idOrName: string): Promise<void> {
    await this.init();
    let id = idOrName;
    const project = await this.getProject(idOrName);
    if (!project) throw new Error(`Project ${idOrName} not found`);
    id = project.id;
    this.projects.delete(id);
    await this.save();
  }

  async updateIndexStats(id: string, totalChunks: number): Promise<void> {
    await this.init();
    const project = this.projects.get(id);
    if (!project) throw new Error(`Project ${id} not found`);
    project.totalChunks = totalChunks;
    project.lastIndexedAt = new Date().toISOString();
    await this.save();
  }
}