// Additional metrics can be defined here
import client from 'prom-client';
export const consensusDuration = new client.Histogram({
  name: 'consensus_duration_seconds',
  help: 'Duration of consensus rounds',
  registers: [client.register],
});
