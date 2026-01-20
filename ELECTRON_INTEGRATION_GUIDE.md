# Electron Worker ↔ Backend Integration Guide

## Overview

This guide covers how the Electron Worker Application integrates with the Command Executor backend server. All communication uses JWT authentication and WebSocket for real-time job delivery.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                   Command Executor System                     │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  Frontend                Backend                Worker (Electron)
│  ┌─────────┐             ┌─────────┐              ┌─────────┐
│  │ Web UI  │             │ Next.js │              │ Electron│
│  │ React   │─────JWT────→│ API     │              │ App     │
│  └─────────┘ (HTTP)      │ Routes  │              └─────────┘
│                          │         │                    ↓
│                          │MongoDB  │              ┌──────────┐
│                          │Redis    │→─WS(JWT)──→ │ Job Exec │
│                          └─────────┘ (real-time)  │ Docker   │
│                                ↑                   └──────────┘
│                                │
│                         Job Status
│                                │
│                          ┌─────────┐
│                          │ Database│
│                          │ Sync    │
│                          └─────────┘
│
└──────────────────────────────────────────────────────────────┘

Flow:
1. User submits job via Web UI (JWT auth)
2. Backend stores job in MongoDB
3. Worker polls for jobs or receives via WebSocket
4. Worker executes in Docker with resource limits
5. Results sent back to backend
6. User sees results in Web UI
```

## Authentication Flow

### Worker Token Generation

```
Electron App starts
       ↓
generate JWT with:
  - workerId: "worker-hostname-xxx"
  - hostname: os.hostname()
  - type: "electron"
  - iat: current timestamp
  - exp: +24 hours
       ↓
sign with WORKER_TOKEN_SECRET
       ↓
include in x-worker-token header
       ↓
register with backend
```

**JWT Payload Example**:

```json
{
  "workerId": "worker-MacBook-Pro-5x8y9z",
  "hostname": "MacBook-Pro.local",
  "type": "electron",
  "iat": 1705334400,
  "exp": 1705420800
}
```

### Backend Validation

```
Backend receives request with x-worker-token header
       ↓
extract JWT from header
       ↓
verify signature using WORKER_TOKEN_SECRET
       ↓
check expiration (24h)
       ↓
extract workerId, hostname
       ↓
allow request → proceed
or deny → return 401 Unauthorized
```

## API Endpoints (Worker Usage)

All requests include header: `x-worker-token: <JWT>`

### 1. Register Worker

**Endpoint**: `POST /api/workers/register`

**Request**:

```json
{
  "workerId": "worker-hostname-xxx",
  "hostname": "MacBook-Pro.local",
  "platform": "darwin",
  "cpuCores": 8,
  "totalMemory": 17179869184,
  "capabilities": ["docker", "node", "shell"]
}
```

**Response**:

```json
{
  "success": true,
  "workerId": "worker-hostname-xxx",
  "registeredAt": "2024-01-15T10:30:00Z"
}
```

**Called in**: `Worker.start()` → `this.register()`

### 2. Send Heartbeat

**Endpoint**: `POST /api/workers/heartbeat`

**Request** (every 10 seconds):

```json
{
  "workerId": "worker-hostname-xxx",
  "timestamp": "2024-01-15T10:30:00Z",
  "status": "idle",
  "currentJobId": null,
  "cpuUsage": 23.5,
  "ramUsage": 45.2,
  "freeDiskSpace": 1234567890,
  "version": "4.0"
}
```

**Response**:

```json
{
  "success": true,
  "acknowledged": true
}
```

**Called in**: `Worker.startHeartbeat()` interval

### 3. Poll for Jobs

**Endpoint**: `GET /api/jobs/get-job`

**Query Parameters**:

- `workerId`: Worker identifier

**Response** (if job available):

```json
{
  "job": {
    "id": "job-123",
    "command": "npm test",
    "containerImage": "node:18-alpine",
    "timeout": 300,
    "environment": {
      "NODE_ENV": "test"
    },
    "createdAt": "2024-01-15T10:25:00Z"
  }
}
```

**Response** (no jobs):

```json
{
  "job": null
}
```

**Called in**: `Worker.startPolling()` interval (every 5s fallback)

### 4. Submit Job Result

**Endpoint**: `POST /api/jobs/submit-result`

**Request**:

```json
{
  "jobId": "job-123",
  "workerId": "worker-hostname-xxx",
  "status": "completed|failed",
  "output": "test results output...",
  "error": null,
  "duration": 12.5,
  "timestamp": "2024-01-15T10:30:12Z"
}
```

**Response**:

```json
{
  "success": true,
  "jobId": "job-123",
  "stored": true
}
```

**Called in**: `Worker.executeJob()` → after execution completes

### 5. Stream Job Output

**Endpoint**: `POST /api/jobs/stream-output`

**Request** (multiple times during execution):

```json
{
  "jobId": "job-123",
  "workerId": "worker-hostname-xxx",
  "chunk": "Running tests...\n",
  "timestamp": "2024-01-15T10:30:05Z"
}
```

**Response**:

```json
{
  "success": true
}
```

**Called in**: Optional - if backend supports live log streaming

### 6. Check for Cancellation

**Endpoint**: `GET /api/jobs/check-cancel`

**Query Parameters**:

- `jobId`: Job to check
- `workerId`: Worker identifier

**Response** (job not cancelled):

```json
{
  "cancelled": false
}
```

**Response** (job cancelled):

```json
{
  "cancelled": true,
  "reason": "user_request|timeout|resource_exceeded"
}
```

**Called in**: During job execution (check periodically)

## WebSocket Communication

### Connection

```
Worker (Electron App)
       ↓
connect to ws://SERVER_URL/ws
       ↓
send auth token in query: ?token=<JWT>
       ↓
backend validates token
       ↓
connection established
       ↓
listen for messages
```

**Connection Code** (in `Worker.connectWebSocket()`):

```javascript
const wsUrl = this.config.serverUrl.replace(/^http/, "ws");
const token = this.generateWorkerToken();
this.ws = new WebSocket(`${wsUrl}/ws?token=${encodeURIComponent(token)}`);
```

### Message Types

#### 1. Heartbeat (Worker → Backend)

Sent every 10 seconds:

```json
{
  "type": "heartbeat",
  "workerId": "worker-hostname-xxx",
  "timestamp": "2024-01-15T10:30:00Z",
  "status": "idle|busy",
  "currentJobId": "job-123",
  "cpuUsage": 45.2,
  "ramUsage": 512,
  "version": "4.0"
}
```

#### 2. Job Assignment (Backend → Worker)

Backend sends when new job available:

```json
{
  "type": "job-assign",
  "job": {
    "id": "job-456",
    "command": "echo 'Hello World'",
    "containerImage": "node:18",
    "timeout": 300,
    "environment": {}
  }
}
```

Worker responds by executing job immediately (priority over polling).

#### 3. Job Result (Worker → Backend)

After job execution:

```json
{
  "type": "result",
  "jobId": "job-456",
  "workerId": "worker-hostname-xxx",
  "status": "completed|failed",
  "output": "execution output",
  "error": null,
  "duration": 2.5,
  "timestamp": "2024-01-15T10:30:15Z"
}
```

#### 4. Job Cancellation (Backend → Worker)

Backend requests job stop:

```json
{
  "type": "job-cancel",
  "jobId": "job-456",
  "reason": "user_request|timeout"
}
```

Worker responds with:

```json
{
  "type": "cancel-ack",
  "jobId": "job-456",
  "workerId": "worker-hostname-xxx",
  "cancelled": true
}
```

#### 5. Log Chunk (Worker → Backend)

Optional real-time log streaming:

```json
{
  "type": "log-chunk",
  "jobId": "job-456",
  "workerId": "worker-hostname-xxx",
  "chunk": "test output line\n",
  "timestamp": "2024-01-15T10:30:05Z"
}
```

## Environment Variables (Backend)

The backend must have these set for worker authentication:

```env
# Shared secret for signing/verifying worker JWTs
WORKER_TOKEN_SECRET=T8mQK2ZxE7q9L4pM1vN3oX5z8

# MongoDB connection for state storage
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db

# Redis for rate limiting
REDIS_URL=redis://localhost:6379

# JWT for user authentication
JWT_SECRET=user-jwt-secret-key

# WebSocket server port
WS_PORT=8080

# Rate limiting (per worker/IP/minute)
RATE_LIMIT_JOBS_PER_MINUTE=60
RATE_LIMIT_HEARTBEAT_PER_MINUTE=600
```

## Electron Worker Configuration

Set in `.env` or Configuration UI:

```env
# Backend server address
SERVER_URL=http://localhost:3000

# Must match backend WORKER_TOKEN_SECRET (used for JWT signing)
WORKER_TOKEN_SECRET=T8mQK2ZxE7q9L4pM1vN3oX5z8

# Resource limits for job execution
CPU_LIMIT=2
RAM_LIMIT=512

# Auto-start on app launch
AUTO_START=false
```

## Data Flow: Complete Job Execution

### 1. Job Submission (User → Backend)

```
User submits job in Web UI
       ↓
POST /api/jobs/create (with JWT)
       ↓
Backend validates JWT (user authentication)
       ↓
Backend stores job in MongoDB (status: PENDING)
       ↓
Backend notifies connected workers via WebSocket
       ↓
Response: { jobId: "job-123", status: "PENDING" }
```

### 2. Job Assignment (Backend → Worker)

**Option A: WebSocket (Real-time)**

```
Backend checks available workers
       ↓
selects idle worker
       ↓
sends job-assign message via WebSocket
       ↓
Worker receives (job-assign)
       ↓
Worker.executeJob() called immediately
```

**Option B: Polling (Fallback)**

```
Worker polls every 5 seconds
       ↓
GET /api/jobs/get-job?workerId=worker-xxx
       ↓
Backend selects next job for worker
       ↓
Response: { job: {...} }
       ↓
Worker.executeJob() called
```

### 3. Job Execution (Worker)

```
Docker container spawned with:
  - image: containerImage from job
  - cpus: CPU_LIMIT
  - memory: RAM_LIMIT
  - cmd: job.command
       ↓
process.spawn() or docker exec()
       ↓
capture stdout/stderr
       ↓
every ~1s: send log-chunk to backend (optional)
       ↓
execution completes or timeout reached
       ↓
collect full output and error
       ↓
calculate duration
```

### 4. Result Reporting (Worker → Backend)

**WebSocket** (preferred):

```
Worker sends result message
       ↓
Backend receives via WebSocket handler
       ↓
updates MongoDB job record (status: COMPLETED/FAILED)
       ↓
updates Redis (cache invalidation)
```

**REST Fallback**:

```
POST /api/jobs/submit-result
       ↓
Backend stores result
       ↓
updates job status
```

### 5. Status Retrieval (User → Backend → UI)

```
User checks job status in Web UI
       ↓
GET /api/jobs/status?jobId=job-123 (with JWT)
       ↓
Backend queries MongoDB
       ↓
returns: { status: "COMPLETED", output: "...", duration: 2.5 }
       ↓
Web UI updates dashboard
```

## Error Handling

### Worker-Side Error Recovery

```
WebSocket connection fails
       ↓
worker.ws.on('close')
       ↓
log error
       ↓
wait 5 seconds
       ↓
attempt reconnect
       ↓
repeat until success or worker stopped
```

**Code**:

```javascript
this.ws.on("close", () => {
  this.log("WebSocket disconnected", "warn");
  if (this.isRunning) {
    setTimeout(() => this.connectWebSocket(), 5000);
  }
});
```

### Backend-Side Error Recovery

```
Worker stops responding (no heartbeat > 60s)
       ↓
mark worker as OFFLINE
       ↓
reassign pending jobs to other workers
       ↓
if worker reconnects
       ↓
mark as ONLINE again
```

### Rate Limiting

```
Worker exceeds rate limit (e.g., heartbeat spam)
       ↓
Redis counter incremented
       ↓
if count > limit for window
       ↓
return 429 Too Many Requests
       ↓
Retry-After header: seconds until reset
       ↓
Worker backs off and retries
```

## Monitoring & Observability

### Logs to Review

**Electron App** (in-app Activity Log):

- Worker registration
- WebSocket connection/disconnection
- Job execution start/completion
- Errors and warnings

**Backend** (server logs):

```bash
# See all worker heartbeats
tail -f logs/backend.log | grep heartbeat

# See job assignments
tail -f logs/backend.log | grep job-assign

# See failures
tail -f logs/backend.log | grep ERROR
```

### Metrics to Track

| Metric                | Source                     | Threshold                |
| --------------------- | -------------------------- | ------------------------ |
| **Worker Count**      | MongoDB workers collection | > 1 (high availability)  |
| **Avg Job Duration**  | Job logs                   | < 5 minutes (baseline)   |
| **Success Rate**      | Job results                | > 99%                    |
| **Heartbeat Latency** | WebSocket messages         | < 100ms                  |
| **Queue Depth**       | Jobs with status=PENDING   | < 100 (scale up workers) |
| **Worker CPU Usage**  | OS metrics                 | < 80% (headroom)         |

### Health Check

```bash
# Verify worker connected
curl http://localhost:3000/api/workers/list

# Check job queue
curl http://localhost:3000/api/jobs/list?status=PENDING

# Test WebSocket
wscat -c ws://localhost:8080 -H "Authorization: Bearer <token>"
```

## Performance Optimization

### Reduce Latency

1. **Colocate services**: Backend and Worker on same network
2. **Use IP addresses**: Avoid DNS lookups in SERVER_URL
3. **Enable compression**: Gzip for large responses
4. **Batch operations**: Send multiple logs in one message

### Increase Throughput

1. **Increase CPU/RAM limits**: More jobs in parallel
2. **Use Docker images**: Faster startup than shell
3. **Optimize job commands**: Profile and optimize
4. **Scale horizontally**: Add more worker instances

### Monitor Resource Usage

```bash
# Watch Docker resource usage
docker stats

# Monitor Electron app memory
ps aux | grep electron

# Check backend DB load
mongosh db.jobs.stats()
```

## Troubleshooting Integration Issues

### Worker not registering

1. Check SERVER_URL: `curl http://SERVER_URL/api/workers/list`
2. Verify WORKER_TOKEN_SECRET matches backend
3. Check firewall/network: `ping SERVER_URL`
4. Review Activity Log for JWT signing errors

### Jobs not assigned

1. Check backend logs: job queue not empty?
2. Verify worker status: IDLE or BUSY?
3. Test polling: `curl -H "x-worker-token: <token>" http://SERVER_URL/api/jobs/get-job`
4. Check WebSocket: `wscat` test connection

### Slow execution

1. Profile job command: `time <command>`
2. Check resource limits: too restrictive?
3. Verify Docker image cached: `docker images | grep <image>`
4. Monitor network: latency between backend/worker?

### Authentication failures

1. Verify WORKER_TOKEN_SECRET: compare backend vs worker config
2. Check JWT expiry: heartbeat failing after 24h?
3. Validate JWT: `jwt.verify()` in backend logs
4. Test registration: ensure token sent in header

---

**Next Steps**:

1. Set up backend server with MongoDB/Redis
2. Configure WORKER_TOKEN_SECRET in both backend and worker
3. Test WebSocket connectivity
4. Deploy worker app to user machines
5. Monitor in production
