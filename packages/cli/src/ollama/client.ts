import axios, { AxiosResponse } from 'axios';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: { parameter_size: string; quantization_level: string };
}

export type ChatMessage = { role: string; content: string };
export type StreamCallback = (chunk: string, fullContent: string) => void;

export class OllamaClient {
  private api = axios.create({ baseURL: OLLAMA_HOST, timeout: 300_000 });

  async isRunning(): Promise<boolean> {
    try {
      await this.api.get('/api/tags', { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async listLocalModels(): Promise<OllamaModel[]> {
    const res = await this.api.get('/api/tags');
    return res.data.models || [];
  }

  /**
   * Non‑streaming chat – returns the complete response after generation.
   * Still uses /api/chat (non‑streaming) for simplicity in voting / synthesis.
   */
  async chat(
    model: string,
    messages: ChatMessage[],
    maxTokens = 1000,
    temperature = 0.3
  ): Promise<{ content: string; confidence?: number }> {
    const res = await this.api.post('/api/chat', {
      model,
      messages,
      stream: false,
      options: { num_predict: maxTokens, temperature },
    });
    let content = res.data.message?.content?.trim() || '[No response]';
    let confidence: number | undefined;
    const match = content.match(/confidence:\s*([0-9.]+)/i);
    if (match) {
      confidence = parseFloat(match[1]);
      content = content.replace(/confidence:\s*[0-9.]+/i, '').trim();
    }
    return { content: content || '[No response]', confidence: confidence ?? 0.5 };
  }

  /**
   * Streaming chat – yields chunks as they arrive.
   * @param onChunk Called with (chunk, fullAccumulatedContent)
   */
  async chatStream(
    model: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
    onChunk: StreamCallback
  ): Promise<string> {
    const res = await this.api.post(
      '/api/chat',
      {
        model,
        messages,
        stream: true,
        options: { num_predict: maxTokens, temperature },
      },
      { responseType: 'stream' }
    );

    const stream = res.data;
    let buffer = '';
    let fullContent = '';
    let done = false;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullContent += data.message.content;
              onChunk(data.message.content, fullContent);
            }
            if (data.done === true) {
              done = true;
              resolve(fullContent);
            }
          } catch {
          }
        }
      });

      stream.on('end', () => {
        if (!done) resolve(fullContent);
      });

      stream.on('error', (err: any) => {
        reject(err);
      });
    });
  }

  async embed(model: string, input: string): Promise<{ embedding: number[] }> {
    const res = await this.api.post('/api/embed', { model, input });
    return { embedding: res.data.embeddings[0] };
  }
}