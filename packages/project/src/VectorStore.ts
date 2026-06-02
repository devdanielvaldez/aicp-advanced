import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { CodeChunk } from './types.js';

const VECTORS_DIR = path.join(os.homedir(), '.aicp', 'vectors');

function ensureDir() {
  if (!fs.existsSync(VECTORS_DIR)) {
    fs.mkdirSync(VECTORS_DIR, { recursive: true });
  }
}

export class VectorStore {
  private db: Database.Database;
  private projectId: string;
  private dbPath: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    ensureDir();
    this.dbPath = path.join(VECTORS_DIR, `${projectId}.db`);
    this.db = new Database(this.dbPath);
    sqliteVec.load(this.db);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks USING vec0(
        embedding float[768],
        + filePath TEXT,
        + startLine INTEGER,
        + endLine INTEGER,
        + content TEXT,
        + projectId TEXT
      );
    `);
  }

  insertChunk(chunk: CodeChunk, embedding: number[]): void {
    const startLine = Math.floor(chunk.startLine);
    const endLine = Math.floor(chunk.endLine);
    
    console.log(`Insert chunk: ${chunk.filePath} lines ${startLine}-${endLine} (type startLine: ${typeof startLine}, isInt: ${Number.isInteger(startLine)})`);
    
    const stmt = this.db.prepare(`
      INSERT INTO code_chunks(
        embedding,
        filePath,
        startLine,
        endLine,
        content,
        projectId
      ) VALUES (?, ?, CAST(? AS INTEGER), CAST(? AS INTEGER), ?, ?)
    `);
    stmt.run(
      JSON.stringify(embedding),
      chunk.filePath,
      startLine,
      endLine,
      chunk.content,
      this.projectId
    );
  }

  deleteChunksByFile(filePath: string): void {
    const stmt = this.db.prepare(`DELETE FROM code_chunks WHERE filePath = ?`);
    stmt.run(filePath);
  }

  deleteAllChunks(): void {
    this.db.exec(`DELETE FROM code_chunks`);
  }

  search(queryEmbedding: number[], k: number = 5): {
    distance: number;
    filePath: string;
    startLine: number;
    endLine: number;
    content: string;
  }[] {
    const stmt = this.db.prepare(`
      SELECT
        distance,
        filePath,
        startLine,
        endLine,
        content
      FROM code_chunks
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `);
    const rows = stmt.all(JSON.stringify(queryEmbedding), k) as any[];
    return rows.map(row => ({
      distance: row.distance,
      filePath: row.filePath,
      startLine: row.startLine,
      endLine: row.endLine,
      content: row.content,
    }));
  }

  getChunkCount(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM code_chunks`).get() as { count: number };
    return row.count;
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}