import { createEd25519PeerId, createFromPrivKey } from '@libp2p/peer-id-factory';
import fs from 'fs/promises';
import path from 'path';

export async function loadOrCreatePeerId(peerIdFile: string): Promise<any> {
    try {
        const privKeyBytes = await fs.readFile(peerIdFile);
        return await createFromPrivKey(new Uint8Array(privKeyBytes) as any);
    } catch {
        const peerId = await createEd25519PeerId();
        const privateKey = (peerId as any).privateKey;
        const privKeyBytes = privateKey.bytes;
        await fs.mkdir(path.dirname(peerIdFile), { recursive: true });
        await fs.writeFile(peerIdFile, Buffer.from(privKeyBytes));
        return peerId;
    }
}