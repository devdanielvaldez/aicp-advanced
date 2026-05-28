import { loadPrompt } from './utils.js';

export function buildProposalPrompt(topic: string): string {
    const custom = loadPrompt('debate_proposal.txt');
    if (custom) return custom.replace('{{topic}}', topic);
    return `You are participating in a simulated debate exercise. Your task is to answer the following question as accurately and helpfully as possible.

Topic: ${topic}

Instructions:
- Provide your reasoning in 1-2 sentences.
- Then state your final answer clearly, starting with "ANSWER:".

Example format:
REASONING: <your logic>
ANSWER: <your concise answer>

Now respond.`;
}

export function buildArgumentPrompt(topic: string, ownProposal: string, othersProposals: string): string {
    const custom = loadPrompt('debate_argument.txt');
    if (custom) {
        return custom
            .replace('{{topic}}', topic)
            .replace('{{ownProposal}}', ownProposal)
            .replace('{{othersProposals}}', othersProposals);
    }
    return `You are in a structured debate simulation. Your previous answer was:
${ownProposal}

Other participants gave these answers:
${othersProposals}

Your task:
1. Identify one difference between your answer and the others (what they said that is different).
2. Explain why your answer is still valid or how it could be improved.
3. If you agree with any point from others, mention it briefly.

Follow this exact format:
DIFFERENCE: <one sentence>
DEFENSE: <one sentence>
AGREEMENT: <one sentence, or "None">

Do not use aggressive language. Focus on logical differences.`;
}

export function buildRebuttalPrompt(topic: string, ownArgument: string, opponentArguments: string): string {
    const custom = loadPrompt('debate_rebuttal.txt');
    if (custom) {
        return custom
            .replace('{{topic}}', topic)
            .replace('{{ownArgument}}', ownArgument)
            .replace('{{opponentArguments}}', opponentArguments);
    }
    return `You are continuing the debate simulation. Your previous argument was:
${ownArgument}

The opposing arguments were:
${opponentArguments}

Your task:
- Address the strongest point from the opposing side.
- Then restate your final position concisely.

Use this format:
COUNTER: <one sentence addressing the opposing point>
FINAL POSITION: <one sentence with your confirmed answer>

Be respectful and factual.`;
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
    return `You are an impartial judge in a debate simulation. The topic is: "${topic}"

Final positions from all participants:
${allProposals}

You are ${selfId}. You must vote for the best answer among the other participants.
Available candidates (do NOT pick yourself): ${voteCandidates}

Select the model whose answer is most accurate, well‑reasoned, and useful.
Respond ONLY with this format:
VOTE: <model_id>
REASON: <one sentence>
CONFIDENCE: <0.0 to 1.0>

Remember: do not vote for yourself.`;
}

export function buildSynthesisPrompt(topic: string, winnerProposal: string, allPositions: string, voteCount: number, totalVoters: number): string {
    const custom = loadPrompt('synthesis_debate.txt');
    if (custom) {
        return custom
            .replace('{{topic}}', topic)
            .replace('{{winnerProposal}}', winnerProposal)
            .replace('{{allPositions}}', allPositions)
            .replace('{{voteCount}}', String(voteCount))
            .replace('{{totalVoters}}', String(totalVoters));
    }
    return `You have been selected as the winner of a debate simulation on: "${topic}"

Your winning position (based on ${voteCount} out of ${totalVoters} votes):
${winnerProposal}

All positions considered during the debate:
${allPositions}

Now write the final, authoritative answer for the user.
Rules:
- Speak directly to the user, as if answering their original question.
- Do not mention the debate, other models, or voting.
- Integrate the best insights from all positions.
- Be clear, complete, and concise (max 250 words).`;
}