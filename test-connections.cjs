#!/usr/bin/env node
/**
 * Connection Debug Test Script
 * Tests all backend connections and endpoints
 */

const http = require('http');
const https = require('https');
const { MongoClient } = require('mongodb');
const redis = require('redis');

const BACKEND_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:8080';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cmd-executor';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log('='.repeat(60));
console.log('CONNECTION DEBUG TEST');
console.log('='.repeat(60));
console.log(`Backend: ${BACKEND_URL}`);
console.log(`WebSocket: ${WS_URL}`);
console.log(`MongoDB: ${MONGODB_URI}`);
console.log(`Redis: ${REDIS_URL}`);
console.log('='.repeat(60));

// Test HTTP endpoint
async function testHttp(url, path) {
  return new Promise((resolve) => {
    console.log(`\n[HTTP] Testing: ${url}${path}`);
    const req = http.get(`${url}${path}`, (res) => {
      console.log(`✅ HTTP ${res.statusCode} ${res.statusMessage}`);
      console.log(`   Headers:`, JSON.stringify(res.headers, null, 2));
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data) {
          try {
            console.log(`   Body:`, JSON.parse(data));
          } catch {
            console.log(`   Body:`, data.substring(0, 200));
          }
        }
        resolve({ ok: true, status: res.statusCode });
      });
    });

    req.on('error', (err) => {
      console.log(`❌ HTTP Error: ${err.message}`);
      resolve({ ok: false, error: err.message });
    });

    req.setTimeout(5000, () => {
      console.log(`❌ HTTP Timeout`);
      req.destroy();
      resolve({ ok: false, error: 'Timeout' });
    });
  });
}

// Test WebSocket
async function testWebSocket() {
  return new Promise((resolve) => {
    console.log(`\n[WS] Testing WebSocket: ${WS_URL}`);
    try {
      const WebSocket = require('ws');
      const ws = new WebSocket(WS_URL);

      const timeout = setTimeout(() => {
        console.log(`❌ WebSocket connection timeout`);
        ws.close();
        resolve({ ok: false, error: 'Timeout' });
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        console.log(`✅ WebSocket connected`);
        ws.close();
        resolve({ ok: true });
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        console.log(`❌ WebSocket error: ${err.message}`);
        resolve({ ok: false, error: err.message });
      });
    } catch (err) {
      console.log(`❌ WebSocket error: ${err.message}`);
      resolve({ ok: false, error: err.message });
    }
  });
}

// Test MongoDB
async function testMongoDB() {
  console.log(`\n[MongoDB] Testing connection...`);
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log(`✅ MongoDB connected`);
    
    const db = client.db();
    const collections = await db.listCollections().toArray();
    console.log(`   Database: ${db.databaseName}`);
    console.log(`   Collections: ${collections.map(c => c.name).join(', ') || '(none)'}`);
    
    await client.close();
    return { ok: true };
  } catch (err) {
    console.log(`❌ MongoDB error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// Test Redis
async function testRedis() {
  console.log(`\n[Redis] Testing connection...`);
  
  try {
    const client = redis.createClient({ url: REDIS_URL });
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.quit();
        reject(new Error('Connection timeout'));
      }, 5000);

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      client.on('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.connect();
    });

    console.log(`✅ Redis connected`);
    const info = await client.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
    console.log(`   Redis version: ${version || 'unknown'}`);
    
    await client.quit();
    return { ok: true };
  } catch (err) {
    console.log(`❌ Redis error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// Test Worker Registration
async function testWorkerRegister() {
  const jwt = require('jsonwebtoken');
  const workerId = `test-worker-${Date.now()}`;
  
  // Generate token
  const token = jwt.sign(
    { workerId, hostname: 'test-host', type: 'test' },
    process.env.WORKER_TOKEN_SECRET || 'dev-worker-token-secret',
    { expiresIn: '1h' }
  );

  console.log(`\n[Worker API] Testing registration...`);
  console.log(`   Worker ID: ${workerId}`);
  console.log(`   Token: ${token.substring(0, 50)}...`);

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      workerId,
      hostname: 'test-host',
      os: 'test-os',
      cpuCount: 4,
      ramTotalMb: 8192
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/workers/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-worker-token': token
      }
    };

    const req = http.request(options, (res) => {
      console.log(`✅ Worker Register: ${res.statusCode} ${res.statusMessage}`);
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data) {
          try {
            console.log(`   Response:`, JSON.parse(data));
          } catch {
            console.log(`   Response:`, data);
          }
        }
        resolve({ ok: res.statusCode === 200, status: res.statusCode });
      });
    });

    req.on('error', (err) => {
      console.log(`❌ Worker Register error: ${err.message}`);
      resolve({ ok: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
}

// Run all tests
(async () => {
  const results = {
    backend: await testHttp(BACKEND_URL, '/'),
    healthCheck: await testHttp(BACKEND_URL, '/api/health'),
    mongodb: await testMongoDB(),
    redis: await testRedis(),
    websocket: await testWebSocket(),
    workerRegister: await testWorkerRegister(),
  };

  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  Object.entries(results).forEach(([name, result]) => {
    const icon = result.ok ? '✅' : '❌';
    const status = result.ok ? 'PASS' : 'FAIL';
    const error = result.error ? ` (${result.error})` : '';
    console.log(`${icon} ${name.padEnd(20)} ${status}${error}`);
  });
  console.log('='.repeat(60));

  const allPass = Object.values(results).every(r => r.ok);
  process.exit(allPass ? 0 : 1);
})();
