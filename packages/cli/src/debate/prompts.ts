import { loadPrompt } from './utils.js';

export function buildProposalPrompt(topic: string): string {
    const custom = loadPrompt('debate_proposal.txt');
    if (custom) return custom.replace('{{topic}}', topic);
    return `You are an expert analyst in a structured debate.

TOPIC: ${topic}

Reply in this exact format (nothing else):
REASONING: <2 sentences max explaining your logic>
ANSWER: <your final position, 2 sentences max>`;
}

export function buildArgumentPrompt(topic: string, ownProposal: string, othersProposals: string): string {
    const custom = loadPrompt('debate_argument.txt');
    if (custom) return custom.replace('{{topic}}', topic).replace('{{ownProposal}}', ownProposal).replace('{{othersProposals}}', othersProposals);
    return `Debate topic: "${topic}"

YOUR POSITION:
${ownProposal}

OTHERS SAID:
${othersProposals}

Reply in this exact format:
CRITIQUE: <one flaw in the opposing positions>
DEFENSE: <why your answer is better, one sentence>
CONCESSION: <one point from others you agree with, or "none">

Max 150 words total.`;
}

export function buildRebuttalPrompt(topic: string, ownArgument: string, opponentArguments: string): string {
    const custom = loadPrompt('debate_rebuttal.txt');
    if (custom) return custom.replace('{{topic}}', topic).replace('{{ownArgument}}', ownArgument).replace('{{opponentArguments}}', opponentArguments);
    return `Debate topic: "${topic}"

YOUR ARGUMENT:
${ownArgument}

OPPONENTS ARGUED:
${opponentArguments}

Reply in this exact format:
REBUTTAL: <counter the strongest opposing point, one sentence>
FINAL POSITION: <your confirmed or updated answer, one sentence>

Max 100 words total.`;
}

export function buildVotePrompt(topic: string, allProposals: string, candidates: string[], selfId: string): string {
    const custom = loadPrompt('debate_vote.txt');
    if (custom) {
        return custom
            .replace('{{topic}}', topic)
            .replace('{{allProposals}}', allProposals)
            .replace('{{candidates}}', candidates.join(', '))
            .replace('{{selfId}}', selfId);
    }
    const voteCandidates = candidates.filter(c => c !== selfId).join(', ');
    return `Debate on: "${topic}"

FINAL POSITIONS:
${allProposals}

You are ${selfId}. You MUST vote for another model.
You CANNOT vote for yourself. If you vote for yourself, your vote will be discarded.
Available candidates (do NOT pick yourself): ${voteCandidates}

Respond ONLY in this EXACT format:
VOTE: <model_id>
REASON: <one sentence>
CONFIDENCE: <0.0 to 1.0>

Remember: do not vote for ${selfId}.`;
}

export function buildSynthesisPrompt(topic: string, winnerProposal: string, allPositions: string, voteCount: number, totalVoters: number): string {
    const custom = loadPrompt('synthesis_debate.txt');
    if (custom) return custom.replace('{{topic}}', topic).replace('{{winnerProposal}}', winnerProposal).replace('{{allPositions}}', allPositions).replace('{{voteCount}}', String(voteCount)).replace('{{totalVoters}}', String(totalVoters));
    return `You won a debate (${voteCount}/${totalVoters} votes) on: "${topic}"

YOUR WINNING POSITION:
${winnerProposal}

ALL POSITIONS FROM THE DEBATE:
${allPositions}

Write the final answer for the user. Rules:
- Speak directly to the user, do NOT mention the debate or other models
- Integrate the best insights from all positions
- Be clear, complete, and concise
- Max 250 words.`;
}