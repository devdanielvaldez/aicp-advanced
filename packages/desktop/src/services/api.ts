const API_BASE = 'http://localhost:3000/api';

export async function fetchModels() {
  const res = await fetch(`${API_BASE}/models`);
  return res.json();
}

export async function selectModels(models: string[]) {
  const res = await fetch(`${API_BASE}/models/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models }),
  });
  return res.json();
}

export function startDebateWebSocket(
  prompt: string,
  rounds: number,
  interactive: boolean,
  graph: boolean,
  turbo: boolean,
  selfEval: boolean,
  memory: boolean
): WebSocket {
  const params = new URLSearchParams({
    prompt,
    rounds: rounds.toString(),
    interactive: String(interactive),
    graph: String(graph),
    turbo: String(turbo),
    selfEval: String(selfEval),
    memory: String(memory),
  });
  const ws = new WebSocket(`ws://localhost:3000?${params.toString()}`);
  return ws;
}

export type DebateEvent =
  | { type: 'log'; content: string }
  | { type: 'final'; content: string }
  | { type: 'error'; content: string };