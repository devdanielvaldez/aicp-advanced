import { ParticleSwarmOptimizer } from './pso.js';
import { ModelResponse } from '../consensus/types.js';
import { ReputationManager } from '../consensus/reputation.js';

export class SwarmConsensusOptimizer {
  private pso: ParticleSwarmOptimizer;
  private modelIds: string[];
  private repManager: ReputationManager;

  constructor(modelIds: string[], repManager: ReputationManager) {
    this.modelIds = modelIds;
    this.repManager = repManager;
    this.pso = new ParticleSwarmOptimizer(modelIds.length, 20);
  }

  async findOptimalWeights(responses: ModelResponse[]): Promise<number[]> {
    const scoreFunction = (weights: number[]): number => {
      let totalWeight = 0;
      let weightedResponseMap = new Map<string, number>();
      for (let i = 0; i < this.modelIds.length; i++) {
        const resp = responses.find(r => r.modelId === this.modelIds[i]);
        if (!resp) continue;
        const rep = this.repManager.getScore(resp.modelId);
        const w = weights[i] * rep * resp.confidence;
        totalWeight += w;
        const key = resp.content.trim().toLowerCase();
        weightedResponseMap.set(key, (weightedResponseMap.get(key) || 0) + w);
      }
      const maxWeight = Math.max(...weightedResponseMap.values());
      return totalWeight > 0 ? maxWeight / totalWeight : 0;
    };
    const bestWeights = this.pso.update(scoreFunction);
    const sum = bestWeights.reduce((a,b) => a+b, 0);
    return bestWeights.map(w => w / sum);
  }
}
