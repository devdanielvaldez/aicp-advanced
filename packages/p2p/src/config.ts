import os from 'os';
import path from 'path';

export const DEFAULT_PEER_ID_FILE = path.join(os.homedir(), '.aicp', 'peer-id.key');

export const DEFAULT_BOOTSTRAP_PEERS = [
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb'
];

export const MDNS_SERVICE_TAG = 'aicp-p2p';
export const MDNS_INTERVAL = 10_000;

export const DHT_PROTOCOL = '/ipfs/kad/1.0.0';
export const DHT_BUCKET_SIZE = 20;

export const RELAY_MAX_RESERVATIONS = 100;
export const RELAY_RESERVATION_TTL = 2 * 60 * 1000;

export const DEBATE_PROTOCOL = '/aicp/debate/1.0.0';