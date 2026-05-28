import { P2PNode } from '@aicp/p2p';
import { logger } from '../utils/logger.js';
import chalk from 'chalk';
import input from '@inquirer/input';
import select from '@inquirer/select';

let p2pNode: P2PNode | null = null;
let currentRoom: string | null = null;

async function startNode() {
    if (p2pNode) {
        logger.warn('Node already running');
        return;
    }
    const bootstrapInput = await input({
        message: 'Enter bootstrap peers (comma separated, optional):',
        default: ''
    });
    const bootstrapPeers = bootstrapInput ? bootstrapInput.split(',').map(s => s.trim()) : undefined;
    const enableMdns = await select({
        message: 'Enable local discovery (mDNS)?',
        choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false }
        ]
    });
    const enableDHT = await select({
        message: 'Enable global discovery (DHT)?',
        choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false }
        ]
    });
    p2pNode = new P2PNode({
        bootstrapPeers,
        enableMdns,
        enableDHT,
        enableRelay: true
    });
    try {
        await p2pNode.start();
        logger.success(`P2P node started. PeerId: ${p2pNode.getPeerId()}`);
        console.log(chalk.gray(`Listening on: ${p2pNode.getMultiaddrs().join(', ')}`));
    } catch (err: any) {
        logger.error(`Failed to start node: ${err.message}`);
        p2pNode = null;
    }
}

async function stopNode() {
    if (!p2pNode) {
        logger.warn('No node running');
        return;
    }
    await p2pNode.stop();
    p2pNode = null;
    currentRoom = null;
    logger.success('P2P node stopped');
}

async function statusNode() {
    if (!p2pNode) {
        logger.info('Node not running');
        return;
    }
    console.log(chalk.green(`PeerId: ${p2pNode.getPeerId()}`));
    console.log(chalk.gray(`Addresses: ${p2pNode.getMultiaddrs().join(', ')}`));
    console.log(chalk.gray(`Current room: ${currentRoom || 'none'}`));
}

async function joinRoom() {
    if (!p2pNode) {
        logger.error('Start a node first (`aicp node start`)');
        return;
    }
    const room = await input({ message: 'Enter room ID:' });
    await p2pNode.joinRoom(room);
    currentRoom = room;
    logger.success(`Joined room: ${room}`);
    p2pNode.onMessage((msg) => {
        console.log(chalk.blue(`\n[P2P] ${msg.type} from ${msg.from}:`), msg.content);
    });
}

async function leaveRoom() {
    if (!p2pNode || !currentRoom) {
        logger.warn('Not in any room');
        return;
    }
    await p2pNode.leaveRoom(currentRoom);
    logger.success(`Left room: ${currentRoom}`);
    currentRoom = null;
}

async function broadcastMessage() {
    if (!p2pNode || !currentRoom) {
        logger.error('Not in a room. Use `join` first.');
        return;
    }
    const type = await select({
        message: 'Message type:',
        choices: [
            { name: 'proposal', value: 'proposal' },
            { name: 'argument', value: 'argument' },
            { name: 'rebuttal', value: 'rebuttal' },
            { name: 'vote', value: 'vote' },
            { name: 'synthesis', value: 'synthesis' }
        ]
    });
    const contentStr = await input({ message: 'Message content (JSON or text):' });
    let content;
    try {
        content = JSON.parse(contentStr);
    } catch {
        content = contentStr;
    }
    await p2pNode.broadcastToRoom(currentRoom, { type, content });
    logger.info('Message broadcasted');
}

export async function nodeCommand() {
    const action: any = await select({
        message: 'P2P Node Management',
        choices: [
            { name: 'Start node', value: 'start' },
            { name: 'Stop node', value: 'stop' },
            { name: 'Status', value: 'status' },
            { name: 'Join room', value: 'join' },
            { name: 'Leave room', value: 'leave' },
            { name: 'Broadcast message', value: 'broadcast' },
            { name: 'Back', value: 'back' }
        ]
    });
    switch (action) {
        case 'start':
            await startNode();
            break;
        case 'stop':
            await stopNode();
            break;
        case 'status':
            await statusNode();
            break;
        case 'join':
            await joinRoom();
            break;
        case 'leave':
            await leaveRoom();
            break;
        case 'broadcast':
            await broadcastMessage();
            break;
        case 'back':
            return;
    }
    if (action !== 'back') await nodeCommand();
}