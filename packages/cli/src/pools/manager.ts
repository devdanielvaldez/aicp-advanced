import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { Pool } from './types.js';

const POOLS_FILE = path.join(os.homedir(), '.aicp', 'pools.json');

export async function loadPools(): Promise<Pool[]> {
  try {
    const data = await fs.readFile(POOLS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function savePools(pools: Pool[]): Promise<void> {
  const dir = path.dirname(POOLS_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(POOLS_FILE, JSON.stringify(pools, null, 2));
}

export async function createPool(
  name: string,
  description: string,
  models: string[]
): Promise<Pool> {
  const pools = await loadPools();
  if (pools.find(p => p.name === name)) {
    throw new Error(`Pool with name "${name}" already exists`);
  }
  const now = new Date().toISOString();
  const newPool: Pool = {
    id: randomUUID(),
    name,
    description,
    models,
    systemPrompt: '',
    createdAt: now,
    updatedAt: now,
  };
  pools.push(newPool);
  await savePools(pools);
  return newPool;
}

export async function getPool(name: string): Promise<Pool | undefined> {
  const pools = await loadPools();
  return pools.find(p => p.name === name);
}

export async function getPoolById(id: string): Promise<Pool | undefined> {
  const pools = await loadPools();
  return pools.find(p => p.id === id);
}

export async function updatePool(updated: Pool): Promise<void> {
  const pools = await loadPools();
  const index = pools.findIndex(p => p.id === updated.id);
  if (index === -1) throw new Error(`Pool ${updated.name} not found`);
  pools[index] = { ...updated, updatedAt: new Date().toISOString() };
  await savePools(pools);
}

export async function deletePool(name: string): Promise<void> {
  const pools = await loadPools();
  const filtered = pools.filter(p => p.name !== name);
  if (filtered.length === pools.length) {
    throw new Error(`Pool ${name} not found`);
  }
  await savePools(filtered);
}

export async function listPools(): Promise<Pool[]> {
  return loadPools();
}