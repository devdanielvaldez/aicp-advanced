import { WebSocket } from 'ws';
import { consensusCommand } from '@aicp/cli';

export function handleDebateStream(ws: WebSocket, prompt: string, options: any) {
  const originalConsoleLog = console.log;
  const logs: string[] = [];

  console.log = (...args) => {
    const line = args.join(' ');
    logs.push(line);
    ws.send(JSON.stringify({ type: 'log', content: line }));
    originalConsoleLog(...args);
  };

  (async () => {
    try {
      const finalAnswer = await consensusCommand(prompt, options);
      ws.send(JSON.stringify({ type: 'final', content: finalAnswer }));
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'error', content: err.message }));
    } finally {
      console.log = originalConsoleLog;
      ws.close();
    }
  })();
}