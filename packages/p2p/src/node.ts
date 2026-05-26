import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { kadDHT } from '@libp2p/kad-dht';

export async function createP2PNode() {
  const node = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0', '/ip4/0.0.0.0/tcp/0/ws'] },
    transports: [tcp(), webSockets()],
  });
  await node.start();
  console.log(`P2P node started with peerId: ${node.peerId.toString()}`);
  return node;
}
