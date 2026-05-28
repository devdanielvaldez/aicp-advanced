import type { Libp2p } from 'libp2p';
import { DebateMessage } from './types.js';
import { DEBATE_PROTOCOL } from './config.js';

export type MessageHandler = (msg: DebateMessage) => void;

export class ProtocolHandler {
    private handlers: MessageHandler[] = [];

    constructor(private node: Libp2p) {}

    register() {
        this.node.handle(DEBATE_PROTOCOL, async ({ stream }) => {
            const chunks: Uint8Array[] = [];
            for await (const chunk of stream.source) {
                if (typeof chunk.subarray === 'function') {
                    chunks.push(chunk.subarray());
                } else {
                    chunks.push(new Uint8Array(chunk as any));
                }
            }
            const buffer = Buffer.concat(chunks);
            const msg = JSON.parse(buffer.toString()) as DebateMessage;
            for (const handler of this.handlers) {
                handler(msg);
            }
            await stream.close();
        });
    }

    unregister() {
        this.node.unhandle(DEBATE_PROTOCOL);
        this.handlers = [];
    }

    onMessage(handler: MessageHandler) {
        this.handlers.push(handler);
    }

    async sendMessage(peerId: string, message: Omit<DebateMessage, 'from' | 'timestamp'>) {
        const fullMsg: DebateMessage = {
            ...message,
            from: this.node.peerId.toString(),
            timestamp: Date.now()
        };
        const data = Buffer.from(JSON.stringify(fullMsg));
        const stream = await this.node.dialProtocol(peerId as any, DEBATE_PROTOCOL);
        await stream.sink([data]);
        await stream.close();
    }
}