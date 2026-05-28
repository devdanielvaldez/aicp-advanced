export interface DebateMessage {
    type: 'proposal' | 'argument' | 'rebuttal' | 'vote' | 'synthesis';
    room: string;
    from: string;
    to?: string;
    content: any;
    timestamp: number;
}

export interface NodeOptions {
    bootstrapPeers?: string[];
    enableMdns?: boolean;
    enableDHT?: boolean;
    enableRelay?: boolean;
    peerIdFile?: string;
}