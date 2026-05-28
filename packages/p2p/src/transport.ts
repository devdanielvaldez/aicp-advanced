import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { plaintext } from '@libp2p/plaintext';
import { tls } from '@libp2p/tls';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';

export const transports:any = [tcp(), webSockets(), circuitRelayTransport()];
export const connectionEncryption = [tls(), plaintext()];