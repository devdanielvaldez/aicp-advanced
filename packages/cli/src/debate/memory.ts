import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { OllamaClient } from '../ollama/client.js';

const MEMORY_DIR = path.join(os.homedir(), '.aicp');
const MEMORY_DB = path.join(MEMORY_DIR, 'memory.db');

function ensureDir() {
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
    if (!db) {
        ensureDir();
        db = new Database(MEMORY_DB);
        sqliteVec.load(db);
        db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
                embedding float[768],
                + topic TEXT,
                + content TEXT,
                + modelId TEXT,
                + timestamp INTEGER
            );
        `);
    }
    return db;
}

export async function storeMemory(
    ollama: OllamaClient,
    topic: string,
    content: string,
    modelId: string
): Promise<void> {
    const embed = await ollama.embed('nomic-embed-text', content);
    const embedding = embed.embedding;
    const db = getDb();
    const stmt = db.prepare(`
        INSERT INTO memory_vec (embedding, topic, content, modelId, timestamp)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(JSON.stringify(embedding), topic, content, modelId, Date.now());
}

export async function retrieveContext(
    ollama: OllamaClient,
    query: string,
    k: number = 3
): Promise<string[]> {
    const embed = await ollama.embed('nomic-embed-text', query);
    const embedding = embed.embedding;
    const db = getDb();
    const stmt = db.prepare(`
        SELECT content, topic, modelId, distance
        FROM memory_vec
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
    `);
    const rows = stmt.all(JSON.stringify(embedding), k) as any[];
    return rows.map(row => `[Previous debate on "${row.topic}"]: ${row.content}`);
}