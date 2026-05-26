export interface ModelMessage {
    modelId: string;
    role: 'proposal' | 'argument' | 'rebuttal' | 'agreement' | 'vote' | 'synthesis';
    content: string;
    round: number;
    timestamp: number;
}

export interface Vote {
    voter: string;
    nominee: string;
    reason: string;
    confidence: number;
}

export interface DebateState {
    topic: string;
    messages: ModelMessage[];
    proposals: Map<string, string>;
    votes: Vote[];
    winner: string | null;
    finalAnswer: string;
}