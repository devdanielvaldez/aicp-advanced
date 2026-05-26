export class VectorMemory {
  private store: Map<string, number[]> = new Map();

  add(id: string, vector: number[]) {
    this.store.set(id, vector);
  }

  get(id: string): number[] | undefined {
    return this.store.get(id);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const normA = Math.hypot(...a);
    const normB = Math.hypot(...b);
    return dot / (normA * normB);
  }

  search(query: number[], topK: number = 5): { id: string; score: number }[] {
    const results: { id: string; score: number }[] = [];
    for (const [id, vec] of this.store.entries()) {
      const sim = this.cosineSimilarity(query, vec);
      results.push({ id, score: sim });
    }
    results.sort((a,b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
