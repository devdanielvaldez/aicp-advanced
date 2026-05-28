import os from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';

export interface SystemResources {
    cpuCores: number;
    freeRamGB: number;
    totalRamGB: number;
    hasGPU: boolean;
    gpuInfo: string;
    currentLoad: number;
    recommendedModelHint: string;
}

export async function analyzeResources(): Promise<SystemResources> {
    const cpuCores = os.cpus().length;
    const totalRamGB = os.totalmem() / 1024 ** 3;
    const freeRamGB = os.freemem() / 1024 ** 3;
    const loadAvg = os.loadavg()[0];
    const currentLoad = (loadAvg / cpuCores) * 100;

    let hasGPU = false;
    let gpuInfo = 'None detected';
    try {
        const nvidiaSmi = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', { stdio: 'pipe' }).toString().trim();
        if (nvidiaSmi) {
            hasGPU = true;
            gpuInfo = nvidiaSmi;
        }
    } catch { /* no NVIDIA */ }

    if (!hasGPU) {
        try {
            const metal = execSync('system_profiler SPDisplaysDataType | grep Metal', { stdio: 'pipe' }).toString();
            if (metal.includes('Metal')) {
                hasGPU = true;
                gpuInfo = 'Apple Silicon (Metal)';
            }
        } catch { /* not macOS */ }
    }

    let recommendedModelHint = '';
    if (totalRamGB >= 32 && hasGPU) {
        recommendedModelHint = 'llama3:8b (Q4_K_M) or larger';
    } else if (totalRamGB >= 16 || hasGPU) {
        recommendedModelHint = 'phi3:mini, mistral:7b (Q4)';
    } else {
        recommendedModelHint = 'gemma:2b or tinyllama (low RAM)';
    }

    return {
        cpuCores,
        freeRamGB,
        totalRamGB,
        hasGPU,
        gpuInfo,
        currentLoad,
        recommendedModelHint,
    };
}

export async function showResourceReport(): Promise<void> {
    const res = await analyzeResources();
    console.log(chalk.cyan('\n📊 System Resource Report'));
    console.log(chalk.gray(`   CPU cores: ${res.cpuCores} | Load: ${res.currentLoad.toFixed(1)}%`));
    console.log(chalk.gray(`   RAM: ${res.freeRamGB.toFixed(1)} GB free / ${res.totalRamGB.toFixed(1)} GB total`));
    console.log(chalk.gray(`   GPU: ${res.gpuInfo}`));
    console.log(chalk.gray(`   Recommended model type: ${res.recommendedModelHint}`));
}

export function setProcessPriority(): void {
    try {
        const pid = process.pid;
        if (process.platform === 'win32') {
            execSync(`wmic process where processid=${pid} call setpriority "high priority"`);
        } else if (process.platform === 'linux' || process.platform === 'darwin') {
            execSync(`renice -n -10 -p ${pid}`);
            if (process.platform === 'linux') {
                const cores = os.cpus().length;
                const mask = (1 << cores) - 1;
                execSync(`taskset -p ${mask} ${pid}`, { stdio: 'ignore' });
            }
        }
        logger.success('Process priority increased for faster inference.');
    } catch (err) {
        logger.warn('Could not change process priority (may require sudo).');
    }
}

export function optimizeOllamaEnv(): void {
    process.env.OLLAMA_NUM_PARALLEL = '1';
    process.env.OLLAMA_MAX_LOADED_MODELS = '1';
    logger.info('Ollama environment tuned: parallel=1, max_loaded=1');
}