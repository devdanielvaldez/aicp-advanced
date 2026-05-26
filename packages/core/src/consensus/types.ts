export interface ConsensusRound {
  roundNumber: number;
  prompt: string;
  responses: ModelResponse[];
  winner?: ModelResponse;
  finalAnswer?: string;
}

export interface ModelResponse {
  modelId: string;
  content: string;
  confidence: number;
  latencyMs: number;
}

export interface ReputationRecord {
  modelId: string;
  score: number;
  accuracy: number;
  honesty: number;
  energy: number;
  lastUpdated: number;
}
