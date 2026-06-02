import { OllamaClient } from '../ollama/client.js';
import { Pool } from './types.js';

const PROMPT_TEMPLATE = `You are an AI assistant that helps generate system prompts for specialized AI models.

We are creating a pool of AI models that will work together as a team. Their specialty is described as:

"{{description}}"

Write a concise system prompt (maximum 150 words) that will be given to each model at the start of every conversation. The prompt should:
- Define the role of the model as an expert in the described specialty.
- Instruct the model to focus on code quality, best practices, and correctness.
- Encourage the model to provide reasoning and code examples when appropriate.
- Remind the model that it is part of a debate team, so it should be ready to argue, critique, and vote.

**IMPORTANT**: The model must understand that it can answer questions about the code without generating new code. It should be able to explain how existing code works, answer conceptual questions, and only generate code when explicitly asked (e.g., "write", "create", "implement"). For questions like "what does this project do?", it should give a natural language explanation.

Respond with only the system prompt, no extra text.`;

export async function generateSystemPrompt(
  ollama: OllamaClient,
  modelId: string,
  description: string
): Promise<string> {
  const userPrompt = PROMPT_TEMPLATE.replace('{{description}}', description);
  const response = await ollama.chat(
    modelId,
    [{ role: 'user', content: userPrompt }],
    400,
    0.3
  );
  let content = response.content.trim();
  if (content.startsWith('"') && content.endsWith('"')) {
    content = content.slice(1, -1);
  }
  return content || `You are an expert in ${description}. Provide high‑quality code solutions with reasoning.`;
}

export async function regeneratePoolSystemPrompt(
  ollama: OllamaClient,
  pool: Pool
): Promise<string> {
  if (pool.models.length === 0) {
    throw new Error('Pool has no models to generate system prompt');
  }
  const modelId = pool.models[0];
  const systemPrompt = await generateSystemPrompt(ollama, modelId, pool.description);
  pool.systemPrompt = systemPrompt;
  return systemPrompt;
}