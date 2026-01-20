#!/usr/bin/env node
/**
 * Test WebSocket client to verify connection to ws://127.0.0.1:7000
 */
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const WORKER_TOKEN_SECRET = 'dev-worker-token-secret';
const workerId = 'test-worker-' + Date.now();

// Generate token
const token = jwt.sign({ workerId, hostname: 'test' }, WORKER_TOKEN_SECRET, { expiresIn: '24h' });

console.log('Testing WebSocket connection to ws://127.0.0.1:7000');
console.log('Worker ID:', workerId);
console.log('Token:', token.substring(0, 50) + '...');

const ws = new WebSocket(`ws://127.0.0.1:7000?token=${token}`);

ws.on('open', () => {
    console.log('✓ Connected successfully!');

    // Send a test heartbeat
    ws.send(JSON.stringify({
        type: 'heartbeat',
        workerId,
        timestamp: new Date().toISOString(),
        status: 'idle'
    }));

    console.log('✓ Sent heartbeat message');
});

ws.on('message', (data) => {
    console.log('✓ Received message:', data.toString());
});

ws.on('error', (error) => {
    console.error('✗ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('✗ Connection closed');
    process.exit(0);
});

setTimeout(() => {
    console.log('Closing connection...');
    ws.close();
}, 3000);
