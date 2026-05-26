export interface Particle {
  position: number[];
  velocity: number[];
  bestPosition: number[];
  bestScore: number;
}

export class ParticleSwarmOptimizer {
  private particles: Particle[];
  private globalBestPosition: number[] = [];
  private globalBestScore: number = -Infinity;
  private w: number = 0.7;
  private c1: number = 1.4;
  private c2: number = 1.4;

  constructor(public dim: number, swarmSize: number = 30) {
    this.particles = [];
    for (let i = 0; i < swarmSize; i++) {
      const position = Array(dim).fill(0).map(() => Math.random());
      const velocity = Array(dim).fill(0).map(() => (Math.random() - 0.5) * 0.2);
      this.particles.push({
        position,
        velocity,
        bestPosition: [...position],
        bestScore: -Infinity,
      });
    }
  }

  update(scoreFunction: (pos: number[]) => number): number[] {
    for (const p of this.particles) {
      const score = scoreFunction(p.position);
      if (score > p.bestScore) {
        p.bestScore = score;
        p.bestPosition = [...p.position];
      }
      if (score > this.globalBestScore) {
        this.globalBestScore = score;
        this.globalBestPosition = [...p.position];
      }
      for (let d = 0; d < this.dim; d++) {
        const r1 = Math.random(), r2 = Math.random();
        p.velocity[d] = this.w * p.velocity[d] +
          this.c1 * r1 * (p.bestPosition[d] - p.position[d]) +
          this.c2 * r2 * (this.globalBestPosition[d] - p.position[d]);
        p.position[d] += p.velocity[d];
        p.position[d] = Math.min(1, Math.max(0, p.position[d]));
      }
    }
    return this.globalBestPosition;
  }
}
