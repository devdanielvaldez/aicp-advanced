import { createLibp2p, Libp2p } from 'libp2p';
import { transports, connectionEncryption } from './transport.js';
import { createMdns, createDHT } from './discovery.js';
import { createRelay } from './relay.js';
import { loadOrCreatePeerId } from './identity.js';
import { ProtocolHandler } from './protocol.js';
import { NodeOptions, DebateMessage } from './types.js';
import { DEFAULT_PEER_ID_FILE, DEFAULT_BOOTSTRAP_PEERS } from './config.js';

export class P2PNode {
    private node: Libp2p | null = null;
    private protocol: ProtocolHandler | null = null;
    private rooms: Set<string> = new Set();
    private options: NodeOptions;

    constructor(options: NodeOptions = {}) {
        this.options = {
            bootstrapPeers: options.bootstrapPeers ?? DEFAULT_BOOTSTRAP_PEERS,
            enableMdns: options.enableMdns ?? true,
            enableDHT: options.enableDHT ?? true,
            enableRelay: options.enableRelay ?? true,
            peerIdFile: options.peerIdFile ?? DEFAULT_PEER_ID_FILE
        };
    }

    async start(): Promise<void> {
        const peerId = await loadOrCreatePeerId(this.options.peerIdFile!);
        const services: any = {};
        if (this.options.enableDHT) services.dht = createDHT();
        if (this.options.enableRelay) services.relay = createRelay();
        const peerDiscovery: any[] = [];
        if (this.options.enableMdns) peerDiscovery.push(createMdns());

        this.node = await createLibp2p({
            peerId,
            transports,
            connectionEncryption,
            peerDiscovery,
            services
        });

        await this.node.start();
        if (this.options.enableDHT) {
            const dht = this.node.services.dht;
            if (dht && typeof (dht as any).start === 'function') {
                await (dht as any).start();
            }
        }

        for (const addrStr of this.options.bootstrapPeers!) {
            try {
                await this.node.dial(addrStr as any);
                console.log(`Connected to bootstrap peer: ${addrStr}`);
            } catch (err: any) {
                console.error(`Failed to connect to ${addrStr}: ${err.message}`);
            }
        }

        this.protocol = new ProtocolHandler(this.node);
        this.protocol.register();

        this.node.addEventListener('peer:discovery', (evt) => {
            console.log(`Discovered peer: ${evt.detail.id.toString()}`);
        });

        console.log(`P2P node started with peerId: ${this.node.peerId.toString()}`);
        console.log(`Listening on: ${this.node.getMultiaddrs().join(', ')}`);
    }

    async stop(): Promise<void> {
        this.protocol?.unregister();
        await this.node?.stop();
        this.node = null;
    }

    getPeerId(): string | null {
        return this.node?.peerId.toString() ?? null;
    }

    getMultiaddrs(): string[] {
        return this.node?.getMultiaddrs().map(addr => addr.toString()) ?? [];
    }

    async joinRoom(room: string): Promise<void> {
        if (!this.node) throw new Error('Node not started');
        this.rooms.add(room);
        if (this.options.enableDHT) {
            const dht = this.node.services.dht;
            if (dht) await (dht as any).provide(room);
        }
        console.log(`Joined room: ${room}`);
    }

    async leaveRoom(room: string): Promise<void> {
        this.rooms.delete(room);
    }

    async broadcastToRoom(room: string, message: Omit<DebateMessage, 'from' | 'timestamp' | 'room'>): Promise<void> {
        if (!this.node || !this.protocol) throw new Error('Node not started');
        const dht = this.node.services.dht;
        if (!dht) throw new Error('DHT not enabled');
        const providers = await (dht as any).findProviders(room);
        const fullMsg = { ...message, room, from: this.node.peerId.toString(), timestamp: Date.now() };
        const data = Buffer.from(JSON.stringify(fullMsg));
        for (const provider of providers) {
            const peerIdStr = provider.id.toString();
            if (peerIdStr !== this.node.peerId.toString()) {
                try {
                    const stream = await this.node.dialProtocol(peerIdStr, '/aicp/debate/1.0.0');
                    await stream.sink([data]);
                    await stream.close();
                } catch (err) {
                    console.error(`Failed to send to ${peerIdStr}:`, err);
                }
            }
        }
    }

    async sendDirect(peerId: string, message: Omit<DebateMessage, 'from' | 'timestamp' | 'room'>): Promise<void> {
        if (!this.protocol) throw new Error('Node not started');
        await this.protocol.sendMessage(peerId, { ...message, room: '' });
    }

    onMessage(handler: (msg: DebateMessage) => void): void {
        this.protocol?.onMessage(handler);
    }
}