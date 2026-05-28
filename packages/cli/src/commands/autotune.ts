import { loadConfig } from '../config/manager.js';
import { OllamaClient } from '../ollama/client.js';
import { logger } from '../utils/logger.js';
import chalk from 'chalk';
import { consensusCommand } from './consensus.js';
import input from '@inquirer/input';
import number from '@inquirer/number';
import select from '@inquirer/select';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.aicp');
const BEST_PARAMS_FILE = path.join(CONFIG_DIR, 'best_params.json');

interface DebateParams {
    rounds: number;           // 1-5
    proposalTokens: number;   // 100-500
    argumentTokens: number;   // 100-400
    rebuttalTokens: number;   // 100-300
    voteTokens: number;       // 30-100
    synthesisTokens: number;  // 300-800
    temperature: number;      // 0.1-0.7
    voteTemperature: number;  // 0.01-0.3
    energyPenaltyFactor: number; // 0.01-0.2 (penalty per 10s)
    accuracyReward: number;   // 0.05-0.2
}

const DEFAULT_RANGES: Record<keyof DebateParams, [number, number]> = {
    rounds: [1, 5],
    proposalTokens: [100, 500],
    argumentTokens: [100, 400],
    rebuttalTokens: [100, 300],
    voteTokens: [30, 100],
    synthesisTokens: [300, 800],
    temperature: [0.1, 0.7],
    voteTemperature: [0.01, 0.3],
    energyPenaltyFactor: [0.01, 0.2],
    accuracyReward: [0.05, 0.2],
};

function randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function randomIntInRange(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function createRandomParams(): DebateParams {
    return {
        rounds: randomIntInRange(DEFAULT_RANGES.rounds[0], DEFAULT_RANGES.rounds[1]),
        proposalTokens: randomIntInRange(DEFAULT_RANGES.proposalTokens[0], DEFAULT_RANGES.proposalTokens[1]),
        argumentTokens: randomIntInRange(DEFAULT_RANGES.argumentTokens[0], DEFAULT_RANGES.argumentTokens[1]),
        rebuttalTokens: randomIntInRange(DEFAULT_RANGES.rebuttalTokens[0], DEFAULT_RANGES.rebuttalTokens[1]),
        voteTokens: randomIntInRange(DEFAULT_RANGES.voteTokens[0], DEFAULT_RANGES.voteTokens[1]),
        synthesisTokens: randomIntInRange(DEFAULT_RANGES.synthesisTokens[0], DEFAULT_RANGES.synthesisTokens[1]),
        temperature: randomInRange(DEFAULT_RANGES.temperature[0], DEFAULT_RANGES.temperature[1]),
        voteTemperature: randomInRange(DEFAULT_RANGES.voteTemperature[0], DEFAULT_RANGES.voteTemperature[1]),
        energyPenaltyFactor: randomInRange(DEFAULT_RANGES.energyPenaltyFactor[0], DEFAULT_RANGES.energyPenaltyFactor[1]),
        accuracyReward: randomInRange(DEFAULT_RANGES.accuracyReward[0], DEFAULT_RANGES.accuracyReward[1]),
    };
}

function crossover(parentA: DebateParams, parentB: DebateParams): DebateParams {
    const child = {} as DebateParams;
    for (const key of Object.keys(parentA) as (keyof DebateParams)[]) {
        if (Math.random() < 0.5) {
            child[key] = parentA[key];
        } else {
            child[key] = parentB[key];
        }
    }
    return child;
}

function mutate(params: DebateParams, mutationRate = 0.2): DebateParams {
    const mutated = { ...params };
    for (const key of Object.keys(mutated) as (keyof DebateParams)[]) {
        if (Math.random() < mutationRate) {
            const [min, max] = DEFAULT_RANGES[key];
            if (typeof mutated[key] === 'number') {
                if (Number.isInteger(mutated[key])) {
                    mutated[key] = randomIntInRange(min, max);
                } else {
                    mutated[key] = randomInRange(min, max);
                }
            }
        }
    }
    return mutated;
}

async function evaluateParams(
    params: DebateParams,
    testQuestions: { prompt: string; expectedAnswer: string }[],
    judgeModel: string
): Promise<number> {
    const ollama = new OllamaClient();
    let totalScore = 0;
    for (const q of testQuestions) {
        const finalAnswer = await runDebateWithParams(q.prompt, params);
        const score = await scoreAnswer(finalAnswer, q.expectedAnswer, judgeModel, ollama);
        totalScore += score;
    }
    return totalScore / testQuestions.length;
}

async function runDebateWithParams(prompt: string, params: DebateParams): Promise<any> {
    const originalTokens = { ...(global as any).__AICP_TOKENS };
    (global as any).__AICP_TOKENS = {
        proposal: params.proposalTokens,
        argument: params.argumentTokens,
        rebuttal: params.rebuttalTokens,
        vote: params.voteTokens,
        synthesis: params.synthesisTokens,
    };
    const originalTemp = (global as any).__AICP_TEMPERATURE;
    (global as any).__AICP_TEMPERATURE = params.temperature;
    const originalVoteTemp = (global as any).__AICP_VOTE_TEMPERATURE;
    (global as any).__AICP_VOTE_TEMPERATURE = params.voteTemperature;
    const originalEnergy = (global as any).__AICP_ENERGY_PENALTY;
    (global as any).__AICP_ENERGY_PENALTY = params.energyPenaltyFactor;
    const originalAccuracy = (global as any).__AICP_ACCURACY_REWARD;
    (global as any).__AICP_ACCURACY_REWARD = params.accuracyReward;

    const originalLog = console.log;
    const originalError = console.error;
    console.log = () => {};
    console.error = () => {};

    try {
        const finalAnswer = await consensusCommand(prompt, { 
            rounds: params.rounds, 
            interactive: false, 
            graph: false, 
            turbo: false, 
            selfEval: false, 
            memory: false,
            silent: true 
        });
        return finalAnswer;
    } catch (err) {
        console.error = originalError;
        console.error(`Debate failed for prompt "${prompt}":`, err);
        return '';
    } finally {
        console.log = originalLog;
        console.error = originalError;
        // Restore globals
        (global as any).__AICP_TOKENS = originalTokens;
        (global as any).__AICP_TEMPERATURE = originalTemp;
        (global as any).__AICP_VOTE_TEMPERATURE = originalVoteTemp;
        (global as any).__AICP_ENERGY_PENALTY = originalEnergy;
        (global as any).__AICP_ACCURACY_REWARD = originalAccuracy;
    }
}

async function scoreAnswer(answer: string, expected: string, judgeModel: string, ollama: OllamaClient): Promise<number> {
    const prompt = `You are a strict judge. Rate the following answer on a scale 0.0 to 1.0 based on how well it matches the expected answer.

Expected answer: "${expected}"

Given answer: "${answer}"

Reply ONLY with a single number between 0.0 and 1.0.`;
    const response = await ollama.chat(judgeModel, [{ role: 'user', content: prompt }], 50, 0.1);
    const score = parseFloat(response.content.trim());
    return isNaN(score) ? 0.5 : Math.min(1, Math.max(0, score));
}

export async function autotuneCommand() {
    logger.info('AutoTune - Genetic evolution of debate parameters');
    console.log(chalk.cyan('\nThis will run multiple debates to find optimal parameters.\n'));

    const testQuestionsFile = await input({
        message: 'Path to JSON file with test questions (array of {prompt, expectedAnswer}):',
        default: './test_questions.json',
    });
    let testQuestions: { prompt: string; expectedAnswer: string }[];
    try {
        const content = await fs.readFile(testQuestionsFile, 'utf-8');
        testQuestions = JSON.parse(content);
        if (!Array.isArray(testQuestions) || testQuestions.length === 0) throw new Error();
    } catch {
        logger.error('Invalid file. Please provide a JSON array with {prompt, expectedAnswer}.');
        return;
    }

    const judgeModel = await select({
        message: 'Select judge model for evaluating answers:',
        choices: (await new OllamaClient().listLocalModels()).map(m => ({ name: m.name, value: m.name })),
    });

    const populationSize = await number({ message: 'Population size (default 10):', default: 10, min: 5, max: 30 });
    const generations = await number({ message: 'Number of generations (default 5):', default: 5, min: 1, max: 20 });

    let population: DebateParams[] = [];
    for (let i = 0; i < populationSize!; i++) {
        population.push(createRandomParams());
    }

    let bestParams: DebateParams | null = null;
    let bestFitness = -Infinity;

    for (let gen = 0; gen < generations!; gen++) {
        console.log(chalk.bold.yellow(`\n=== Generation ${gen+1}/${generations} ===`));
        const fitnesses: number[] = [];
        for (let i = 0; i < population.length; i++) {
            console.log(chalk.gray(`Evaluating individual ${i+1}/${population.length}...`));
            const fitness = await evaluateParams(population[i], testQuestions, judgeModel);
            fitnesses.push(fitness);
            if (fitness > bestFitness) {
                bestFitness = fitness;
                bestParams = { ...population[i] };
                await fs.writeFile(BEST_PARAMS_FILE, JSON.stringify({ params: bestParams, fitness: bestFitness }, null, 2));
                logger.success(`New best fitness: ${bestFitness.toFixed(3)}`);
            }
        }
        const indexed = population.map((p, idx) => ({ params: p, fitness: fitnesses[idx] }));
        indexed.sort((a, b) => b.fitness - a.fitness);
        const eliteCount = Math.max(2, Math.floor(populationSize! * 0.3));
        const newPopulation: DebateParams[] = indexed.slice(0, eliteCount).map(x => x.params);
        while (newPopulation.length < populationSize!) {
            const parentA = indexed[Math.floor(Math.random() * eliteCount)].params;
            const parentB = indexed[Math.floor(Math.random() * eliteCount)].params;
            let child = crossover(parentA, parentB);
            child = mutate(child);
            newPopulation.push(child);
        }
        population = newPopulation;
        console.log(chalk.green(`Best fitness this generation: ${Math.max(...fitnesses).toFixed(3)}`));
    }

    console.log(chalk.bold.green(`\n✅ Optimization finished. Best fitness: ${bestFitness.toFixed(3)}`));
    console.log(chalk.cyan('Best parameters:'));
    console.log(JSON.stringify(bestParams, null, 2));
    console.log(chalk.yellow(`Saved to ${BEST_PARAMS_FILE}`));
}