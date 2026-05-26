export const SLOW_MODEL_THRESHOLD_MS = 30_000;

export const TOKENS = {
    warmup:    5,
    proposal:  300,
    argument:  200,
    rebuttal:  150,
    vote:      60,
    synthesis: 500,
} as const;