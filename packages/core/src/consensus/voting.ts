import { ModelResponse } from './types.js';
import { ReputationManager } from './reputation.js';

export function weightedVote(responses: ModelResponse[], repManager: ReputationManager): ModelResponse | null {
  const weights = new Map<string, number>();
  for (const resp of responses) {
    const rep = repManager.getScore(resp.modelId);
    const weight = rep * resp.confidence;
    const key = resp.content.trim().toLowerCase();
    weights.set(key, (weights.get(key) || 0) + weight);
  }
  let bestKey = '';
  let bestWeight = -1;
  for (const [key, w] of weights) {
    if (w > bestWeight) {
      bestWeight = w;
      bestKey = key;
    }
  }
  return responses.find(r => r.content.trim().toLowerCase() === bestKey) || null;
}
