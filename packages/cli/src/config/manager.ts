import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.aicp');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface AICPConfig {
  selectedModels: string[];
  p2pEnabled: boolean;
  bootstrapPeers: string[];
}

const defaultConfig: AICPConfig = {
  selectedModels: [],
  p2pEnabled: false,
  bootstrapPeers: [],
};

export async function loadConfig(): Promise<AICPConfig> {
  try {
    await fs.access(CONFIG_DIR);
  } catch {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  }
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return { ...defaultConfig, ...JSON.parse(data) };
  } catch {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
}

export async function saveConfig(config: AICPConfig): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}
