import { mdns } from '@libp2p/mdns';
import { kadDHT } from '@libp2p/kad-dht';
import { MDNS_INTERVAL, MDNS_SERVICE_TAG, DHT_PROTOCOL, DHT_BUCKET_SIZE } from './config.js';

export const createMdns: any = () => mdns({ interval: MDNS_INTERVAL, serviceTag: MDNS_SERVICE_TAG });

export const createDHT = () => kadDHT({
    clientMode: false,
    protocol: DHT_PROTOCOL,
    kBucketSize: DHT_BUCKET_SIZE
});