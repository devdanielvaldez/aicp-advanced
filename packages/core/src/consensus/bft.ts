import crypto from 'crypto';
import { ReputationManager } from './reputation.js';
import { ModelResponse } from './types.js';

export interface BFTConfig {
  f: number;
  lambda: number;
  roundTimeoutMs: number;
}

export class BFTAdaptiveConsensus {
  private nodes: string[];
  private reputation: ReputationManager;
  private config: BFTConfig;
  private round: number = 0;

  constructor(nodes: string[], reputation: ReputationManager, config: BFTConfig) {
    this.nodes = nodes;
    this.reputation = reputation;
    this.config = config;
    if (this.nodes.length < 3 * this.config.f + 1) {
      throw new Error(`Need at least ${3 * this.config.f + 1} nodes for f=${this.config.f}`);
    }
  }

  private sign(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private verify(signature: string, data: string): boolean {
    return signature === this.sign(data);
  }

  async runRound(proposals: Map<string, ModelResponse>): Promise<ModelResponse> {
    const votes = new Map<string, Set<string>>();
    for (const [nodeId, resp] of proposals.entries()) {
      const rep = this.reputation.getScore(nodeId);
      if (rep < this.config.lambda) continue;
      const data = JSON.stringify({ nodeId, content: resp.content, round: this.round });
      const sig = this.sign(data);
      if (!this.verify(sig, data)) continue;
      const key = resp.content.trim().toLowerCase();
      if (!votes.has(key)) votes.set(key, new Set());
      votes.get(key)!.add(nodeId);
    }

    let winnerContent = '';
    let maxVotes = 0;
    for (const [content, voters] of votes.entries()) {
      if (voters.size > maxVotes && voters.size >= 2 * this.config.f + 1) {
        maxVotes = voters.size;
        winnerContent = content;
      }
    }
    if (!winnerContent) {
      throw new Error('BFT consensus failed: no supermajority');
    }
    const winnerResp = proposals.get([...votes.get(winnerContent)!][0])!;
    this.round++;
    return winnerResp;
  }
}
