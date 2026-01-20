#!/usr/bin/env node
/**
 * Standalone WebSocket server for worker connections
 * Run this alongside your Next.js dev server:
 * node start-ws-server.cjs
 */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const http = require('http');

const PORT = process.env.WS_PORT || 7000;
const WORKER_TOKEN_SECRET = process.env.WORKER_TOKEN_SECRET || 'dev-worker-token-secret';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

const activeConnections = new Map();

// Fetch jobs from backend API
async function loadJobs() {
    try {
        return new Promise((resolve, reject) => {
            const url = `${BACKEND_URL}/api/jobs/list`;
            http.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const jobs = JSON.parse(data);
                        if (Array.isArray(jobs)) {
                            const map = new Map();
                            jobs.forEach(job => {
                                map.set(job.jobId || job.id, job);
                            });
                            resolve(map);
                        } else if (typeof jobs === 'object') {
                            resolve(new Map(Object.entries(jobs)));
                        } else {
                            resolve(new Map());
                        }
                    } catch (err) {
                        console.error(`⚠️ Failed to parse jobs API response:`, err.message);
                        resolve(new Map());
                    }
                });
            }).on('error', (err) => {
                console.error(`⚠️ Failed to fetch jobs from backend:`, err.message);
                resolve(new Map());
            });
        });
    } catch (err) {
        console.error(`⚠️ Job loading error:`, err.message);
        return new Map();
    }
}

console.log('='.repeat(60));
console.log('WORKER WEBSOCKET SERVER');
console.log('='.repeat(60));
console.log(`Port: ${PORT}`);
console.log(`Token Secret: ${WORKER_TOKEN_SECRET.substring(0, 20)}...`);
console.log('='.repeat(60));

// Track workers that have already received a job assignment
const assignedJobs = new Map(); // jobId -> workerId

// Poll for assigned jobs and send to workers
function checkAndAssignJobs() {
    loadJobs().then(jobs => {
        try {
            for (const [jobId, job] of jobs.entries()) {
                const actualJobId = jobId;
                const actualStatus = job.status;
                const actualWorker = job.assignedAgentId;

                // Look for ASSIGNED jobs that haven't been sent yet
                if (actualStatus === 'ASSIGNED' && actualWorker && !assignedJobs.has(actualJobId)) {
                    const workerId = actualWorker;
                    const ws = activeConnections.get(workerId);

                    if (ws && ws.readyState === 1) { // WebSocket.OPEN
                        // Send job assignment to worker
                        ws.send(JSON.stringify({
                            type: 'job-assign',
                            job: {
                                id: actualJobId,
                                command: job.command,
                                fileUrl: job.fileUrl,
                                filename: job.filename,
                                requiredCpu: job.requiredCpu || 1,
                                requiredRamMb: job.requiredRamMb || 256,
                                timeoutMs: job.timeoutMs || 300000,
                                containerImage: job.containerImage || null,
                                workDir: job.workDir || null,
                            }
                        }));

                        assignedJobs.set(actualJobId, workerId);
                        console.log(`📤 [${workerId}] Job assigned: ${actualJobId}`);
                        console.log(`   Command: ${(job.command || '').substring(0, 80)}...`);
                    } else {
                        if (!ws) console.log(`⚠️ Worker ${workerId} not connected for job ${actualJobId}`);
                    }
                }

                // Clean up completed/failed jobs from tracking
                if ((actualStatus === 'COMPLETED' || actualStatus === 'FAILED' || actualStatus === 'CANCELLED') && assignedJobs.has(actualJobId)) {
                    assignedJobs.delete(actualJobId);
                }
            }
        } catch (err) {
            console.error(`⚠️ Job assignment error:`, err.message);
        }
    });
}

// Start polling for jobs every 2 seconds
setInterval(checkAndAssignJobs, 2000);

const wss = new WebSocketServer({
    port: PORT
    // Note: Removed host binding to allow both IPv4 and IPv6 connections
});

wss.on('listening', () => {
    console.log(`✅ WebSocket server listening on ws://localhost:${PORT}`);
    console.log(`   Waiting for worker connections...`);
});

wss.on('connection', (ws, req) => {
    let workerId = null;

    try {
        // Extract token from header or query
        const headerToken = req.headers['x-worker-token'];
        const url = new URL(req.url, `http://${req.headers.host}`);
        const queryToken = url.searchParams.get('token');
        const token = headerToken || queryToken;

        if (!token) {
            console.log(`❌ Connection rejected: No token provided`);
            ws.close(1008, 'No token');
            return;
        }

        // Verify token
        const decoded = jwt.verify(token, WORKER_TOKEN_SECRET);
        if (!decoded.workerId) {
            console.log(`❌ Connection rejected: Invalid token payload`);
            ws.close(1008, 'Invalid token');
            return;
        }

        workerId = decoded.workerId;
        activeConnections.set(workerId, ws);

        console.log(`✅ Worker connected: ${workerId}`);
        console.log(`   Hostname: ${decoded.hostname || 'unknown'}`);
        console.log(`   Active connections: ${activeConnections.size}`);

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            workerId,
            message: 'WebSocket connection established'
        }));

        // Handle messages from worker
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                console.log(`📨 [${workerId}] Message:`, msg.type || 'unknown', msg);

                // Echo back for now (implement actual logic later)
                switch (msg.type) {
                    case 'heartbeat':
                        ws.send(JSON.stringify({ type: 'heartbeat-ack', timestamp: Date.now() }));
                        break;
                    case 'result':
                        console.log(`   → Job ${msg.jobId} completed with status: ${msg.status}`);
                        break;
                    case 'log':
                        console.log(`   → Log: ${msg.message}`);
                        break;
                    default:
                        console.log(`   → Unknown message type: ${msg.type}`);
                }
            } catch (err) {
                console.error(`❌ [${workerId}] Parse error:`, err.message);
            }
        });

        ws.on('close', (code, reason) => {
            console.log(`❌ Worker disconnected: ${workerId}`);
            console.log(`   Code: ${code}, Reason: ${reason || 'none'}`);
            console.log(`   Active connections: ${activeConnections.size - 1}`);
            activeConnections.delete(workerId);
        });

        ws.on('error', (err) => {
            console.error(`❌ [${workerId}] WebSocket error:`, err.message);
        });

    } catch (err) {
        console.error(`❌ Connection error:`, err.message);
        ws.close(1008, err.message);
    }
});

wss.on('error', (err) => {
    console.error(`❌ WebSocket server error:`, err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`   → Port ${PORT} is already in use`);
        console.error(`   → Stop the other process or use a different port`);
        process.exit(1);
    }
});

process.on('SIGINT', () => {
    console.log('\n' + '='.repeat(60));
    console.log('Shutting down WebSocket server...');
    wss.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

console.log('='.repeat(60));
console.log('Press Ctrl+C to stop');
console.log('='.repeat(60));
