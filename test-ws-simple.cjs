#!/usr/bin/env node
/**
 * Simple WebSocket test server
 */
const { WebSocketServer } = require('ws');

console.log('Starting simple WebSocket server on port 8080...');

try {
    const wss = new WebSocketServer({ port: 8080 });

    wss.on('listening', () => {
        console.log('✓ Server listening on port 8080');
    });

    wss.on('connection', (ws) => {
        console.log('✓ Client connected');
        ws.send('Hello from server');
    });

    wss.on('error', (err) => {
        console.error('✗ Server error:', err.message);
    });
} catch (err) {
    console.error('✗ Failed to start server:', err.message);
}
