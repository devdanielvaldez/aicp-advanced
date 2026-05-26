import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const REPU_DIR = path.join(os.homedir(), '.aicp');
const REPU_DB = path.join(REPU_DIR, 'reputation.db');

function ensureDir() {
  if (!fs.existsSync(REPU_DIR)) fs.mkdirSync(REPU_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    ensureDir();
    db = new Database(REPU_DB);
    db.exec(`
      CREATE TABLE IF NOT EXISTS reputation (
        model_id TEXT PRIMARY KEY,
        score REAL DEFAULT 0.5,
        accuracy REAL DEFAULT 0.5,
        honesty REAL DEFAULT 0.5,
        energy REAL DEFAULT 0.5,
        last_updated INTEGER DEFAULT (strftime('%s', 'now'))
      );
      CREATE TABLE IF NOT EXISTS endorsements (
        from_model TEXT,
        to_model TEXT,
        weight REAL,
        timestamp INTEGER
      );
    `);
  }
  return db;
}

export class ReputationManager {
  private decayFactor = 0.95;

  getScore(modelId: string): number {
    const row = getDb()
      .prepare('SELECT score, last_updated FROM reputation WHERE model_id = ?')
      .get(modelId) as { score: number; last_updated: number } | undefined;
    if (!row) return 0.5;
    const age = Math.floor(Date.now() / 1000) - row.last_updated;
    const decay = Math.pow(this.decayFactor, age);
    return Math.min(1, Math.max(0, row.score * decay));
  }

  update(modelId: string, metrics: { accuracyDelta?: number; honestyDelta?: number; energyDelta?: number }) {
    const db = getDb();
    const current = db.prepare('SELECT accuracy, honesty, energy FROM reputation WHERE model_id = ?').get(modelId) as any;
    const newAccuracy = current ? (current.accuracy + (metrics.accuracyDelta || 0)) : 0.5;
    const newHonesty = current ? (current.honesty + (metrics.honestyDelta || 0)) : 0.5;
    const newEnergy = current ? (current.energy + (metrics.energyDelta || 0)) : 0.5;
    const newScore = (newAccuracy * 0.5 + newHonesty * 0.3 + newEnergy * 0.2);
    db.prepare(`
      INSERT INTO reputation (model_id, score, accuracy, honesty, energy, last_updated)
      VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
      ON CONFLICT(model_id) DO UPDATE SET
        score = excluded.score,
        accuracy = excluded.accuracy,
        honesty = excluded.honesty,
        energy = excluded.energy,
        last_updated = excluded.last_updated
    `).run(modelId, newScore, newAccuracy, newHonesty, newEnergy);
  }

  endorse(fromModel: string, toModel: string, weight: number) {
    const db = getDb();
    db.prepare(`INSERT INTO endorsements (from_model, to_model, weight, timestamp) VALUES (?, ?, ?, strftime('%s','now'))`)
      .run(fromModel, toModel, weight);
    this.update(fromModel, { honestyDelta: weight * 0.05 });
    this.update(toModel, { honestyDelta: weight * 0.03 });
  }
}
