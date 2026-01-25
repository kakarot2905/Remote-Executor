# CMD Executor - Architecture & Design

A detailed technical guide to the system architecture, design patterns, and component interactions.

## Table of Contents

- [System Overview](#system-overview)
- [Core Components](#core-components)
- [Communication Flow](#communication-flow)
- [Data Models](#data-models)
- [Authentication & Security](#authentication--security)
- [Scalability](#scalability)
- [Error Handling](#error-handling)

---

## System Overview

### Three-Tier Architecture

```
┌─────────────────────────────────────┐
│     PRESENTATION LAYER (React)      │
│  • Web UI Dashboard                 │
│  • File Upload Component            │
│  • Job Monitoring                   │
│  • Real-time Output Viewer          │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   APPLICATION LAYER (Next.js)       │
│  • REST API Endpoints               │
│  • Job Orchestration Logic          │
│  • Worker Management                │
│  • File Processing                  │
│  • Authentication                   │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│       DATA LAYER                    │
│  • MongoDB (persistent storage)     │
│  • Redis (caching)                  │
│  • File System (uploads)            │
└─────────────────────────────────────┘
```

---

## Core Components

### 1. Web Server (Next.js)

**Responsibilities:**
- HTTP request handling
- API routing
- Session management
- CORS handling
- Static file serving

**Key Modules:**
- `/src/app/api/` - API routes
- `/src/middleware.ts` - Request preprocessing
- `/src/lib/config.ts` - Configuration management

**Technology Stack:**
- Framework: Next.js 16.x
- Runtime: Node.js 18+
- HTTP: Built-in Next.js server

### 2. Worker Registry

**Responsibilities:**
- Track all connected workers
- Manage worker lifecycle (register, heartbeat, unregister)
- Store worker metadata

**Data Structure:**
```javascript
{
  workerId: string,           // Unique ID
  hostname: string,           // Machine name
  cpuCount: number,           // CPU cores
  totalMemoryMb: number,      // RAM
  status: "online"|"offline"|"error",
  lastHeartbeat: Date,        // Last update
  registeredAt: Date,         // Registration time
  currentJobId?: string,      // Currently executing
  metadata: {                 // Custom metadata
    osType: string,
    nodeVersion: string,
    tags: string[]
  }
}
```

**API Endpoints:**
- `POST /api/workers/register` - Register new worker
- `POST /api/workers/heartbeat` - Send heartbeat
- `GET /api/workers/list` - List all workers
- `DELETE /api/workers/[id]` - Unregister worker

### 3. Job Queue

**Responsibilities:**
- Accept job submissions
- Queue management (FIFO)
- Job assignment to workers
- Result collection

**Job Lifecycle:**
```
┌─────────┐    ┌────────┐    ┌────────┐    ┌───────────┐
│ QUEUED  │ → │ RUNNING │ → │ DONE   │ → │ COLLECTED │
└─────────┘    └────────┘    └────────┘    └───────────┘
  (waiting)     (worker)     (local)        (archived)
```

**Data Structure:**
```javascript
{
  jobId: string,              // Unique ID
  command: string,            // Command to execute
  fileUrl: string,            // ZIP file location
  status: JobStatus,          // Current state
  workerId?: string,          // Assigned worker
  createdAt: Date,            // Created timestamp
  startedAt?: Date,           // Execution start
  completedAt?: Date,         // Execution end
  stdout: string,             // Standard output
  stderr: string,             // Standard error
  exitCode?: number,          // Exit code
  timeout: number,            // Timeout in seconds
  result?: {
    success: boolean,
    duration: number,
    errors?: string[]
  }
}
```

**API Endpoints:**
- `POST /api/jobs/submit` - Submit new job
- `GET /api/jobs/get-job` - Get next job (worker)
- `POST /api/jobs/submit-result` - Submit result
- `GET /api/jobs/status` - Check status
- `GET /api/jobs/list` - List all jobs

### 4. File Management

**Responsibilities:**
- Accept file uploads (ZIP)
- Store files securely
- Serve files to workers
- Cleanup old files

**Storage:**
- **Local:** `public/uploads/` directory
- **Cloud:** Configurable S3/Azure Storage (future)

**Process:**
1. User uploads ZIP file
2. File validated and stored
3. URL provided to worker
4. Worker downloads and extracts
5. Execution happens in temp directory
6. Results collected

### 5. Authentication & Authorization

**Types:**
- **User Auth:** JWT tokens (login credentials)
- **Worker Auth:** HMAC tokens (worker registration)

**Implementation:**
```typescript
// User Authentication
export async function authenticateUser(req: NextRequest) {
  const token = extractBearer(req) || extractCookie(req);
  const decoded = jwt.verify(token, jwtSecret);
  return { ok: true, user: decoded };
}

// Worker Authentication
export async function authenticateWorker(req: NextRequest) {
  const token = req.headers.get('x-worker-token');
  const decoded = jwt.verify(token, workerSecret);
  return { ok: true, worker: decoded };
}
```

---

## Communication Flow

### Sequence: Submit and Execute Job

```
User                 Server              Worker
  │                    │                   │
  ├─Upload ZIP────────>│                   │
  │                    ├─Store file────────│
  │                    │<─Stored─────────────
  │<─File URL─────────│                   │
  │                    │                   │
  ├─Submit Job────────>│                   │
  │                    ├─Queue Job────────│
  │<─Job ID──────────│                   │
  │                    │                   │
  │                    │<─Poll Job──────────
  │                    ├─Assign Job─────────
  │                    ├─Send Job Details─→│
  │                    │                   ├─Download ZIP
  │                    │<─Download─────────│
  │                    ├─Serve ZIP────────>│
  │                    │                   ├─Extract
  │                    │                   ├─Execute
  │                    │                   │
  │                    │<─Stream Output────┤
  ├─Poll Status──────>│<─Output Stream────│
  │<─Output Text──────│                   │
  │                    │                   ├─Cleanup
  │                    │<─Submit Result────│
  │                    ├─Save Result───────│
  ├─Get Result───────>│                   │
  │<─Final Output─────│                   │
```

### Heartbeat Mechanism

```
Worker (every 30 seconds)
  │
  ├─POST /api/workers/heartbeat
  │  {
  │    workerId: "worker-001",
  │    status: "idle",
  │    jobsCompleted: 42
  │  }
  │
  └─Response
     {
       ok: true,
       serverTime: "2026-01-25T10:30:00Z"
     }

Server
  └─Update lastHeartbeat timestamp
  └─Mark as "online" if was "offline"
```

### Job Polling Cycle

```
Worker (every 5 seconds)
  │
  ├─GET /api/jobs/get-job
  │
  └─Response
     {
       jobId: "job-12345",
       command: "npm test",
       fileUrl: "/uploads/project.zip",
       timeout: 600
     }

  If no job:
     { jobId: null }

  If job:
     ├─Download file
     ├─Extract ZIP
     ├─Execute command
     ├─Collect output
     └─POST /api/jobs/submit-result
```

---

## Data Models

### Worker Model

```typescript
interface Worker {
  _id: ObjectId;
  workerId: string;           // Unique identifier
  hostname: string;           // Machine name
  cpuCount: number;           // CPU cores
  totalMemoryMb: number;      // RAM in MB
  status: 'online' | 'offline' | 'error';
  lastHeartbeat: Date;
  registeredAt: Date;
  currentJobId?: string;
  metadata?: {
    osType: string;
    nodeVersion: string;
    tags?: string[];
    customData?: Record<string, any>;
  };
}
```

### Job Model

```typescript
interface Job {
  _id: ObjectId;
  jobId: string;              // Unique identifier
  command: string;            // Shell command
  fileUrl: string;            // ZIP file URL
  status: 'queued' | 'running' | 'completed' | 'failed';
  workerId?: string;          // Assigned worker
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  stdout: string;             // Standard output
  stderr: string;             // Standard error
  exitCode?: number;
  timeout: number;            // Seconds
  error?: string;             // Error message
  result?: {
    success: boolean;
    duration: number;
    lines: number;
  };
}
```

### File Model

```typescript
interface UploadedFile {
  _id: ObjectId;
  fileId: string;             // Unique identifier
  originalName: string;
  uploadedAt: Date;
  size: number;               // Bytes
  path: string;               // Local path
  expiresAt?: Date;           // Auto-delete
  metadata?: {
    userAgent: string;
    ipAddress: string;
  };
}
```

---

## Authentication & Security

### Token Flow

```
┌──────────────────────┐
│ User Login           │
├──────────────────────┤
│ POST /api/auth/login │
│ {email, password}    │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────────┐
│ Validate Credentials     │
├──────────────────────────┤
│ Hash check against DB    │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Generate JWT Token       │
├──────────────────────────┤
│ Payload:                 │
│ - sub: user ID           │
│ - email: user email      │
│ - role: user role        │
│ - iat: issued time       │
│ - exp: expiry time       │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Return Token             │
├──────────────────────────┤
│ Set httpOnly cookie      │
│ Return in response body  │
└──────────────────────────┘
```

### Request Authentication

```javascript
// User request
GET /api/jobs/list
Authorization: Bearer eyJhbGc...

// Worker request
GET /api/jobs/get-job
x-worker-token: eyJhbGc...

// Or
Authorization: Bearer eyJhbGc...
```

### Rate Limiting

```javascript
// Key format: ratelimit:{endpoint}:{ip}
// Window: 1 minute
// Limit: 100 requests per minute

Example:
  Key: ratelimit:/api/jobs/submit:192.168.1.1
  Limit: 100 requests/min
  Reset: 60 seconds
```

---

## Scalability

### Horizontal Scaling

**Worker Nodes:**
- Unlimited workers can connect
- No single point of failure
- Load distributed via job queue

**Server Replication:**
```
┌──────────────┐      ┌──────────────┐
│  Server 1    │      │  Server 2    │
│  :3000       │◄────►│  :3001       │
└──────┬───────┘      └───────┬──────┘
       │                      │
       └──────────┬───────────┘
                  │
            ┌─────▼─────┐
            │  MongoDB  │
            │  (shared) │
            └───────────┘
```

### Database Optimization

**Indexes:**
```javascript
// Workers collection
db.workers.createIndex({ workerId: 1 }, { unique: true });
db.workers.createIndex({ status: 1 });
db.workers.createIndex({ lastHeartbeat: 1 });

// Jobs collection
db.jobs.createIndex({ jobId: 1 }, { unique: true });
db.jobs.createIndex({ status: 1 });
db.jobs.createIndex({ workerId: 1 });
db.jobs.createIndex({ createdAt: 1 });
```

**Archival Strategy:**
```javascript
// Move completed jobs to archive collection after 30 days
db.jobs.deleteMany({
  status: 'completed',
  completedAt: { $lt: new Date(Date.now() - 30*24*60*60*1000) }
});
```

### Caching Strategy

**Redis Keys:**
```
worker:list              - All workers (TTL: 30s)
worker:{id}              - Single worker (TTL: 30s)
job:{id}                 - Single job (TTL: 5m)
job:queue                - Queue stats (TTL: 10s)
auth:token:{token}       - Token validation (TTL: 1h)
ratelimit:*              - Rate limits (TTL: 60s)
```

---

## Error Handling

### Error Types

**Network Errors:**
- Worker offline
- File download failed
- Server unreachable

**Execution Errors:**
- Command not found
- Permission denied
- Timeout exceeded

**Data Errors:**
- Invalid ZIP
- Missing file
- Corrupted data

### Recovery Strategies

```
Job Failure Flow:

Job Submitted
    │
    ├─If worker offline
    │  └─Keep queued, retry on worker reconnect
    │
    ├─If file missing
    │  └─Mark failed, return error
    │
    ├─If execution fails
    │  └─Capture stderr, mark failed
    │
    ├─If timeout
    │  └─Kill process, mark failed
    │
    └─If network error
       └─Retry up to 3 times with backoff
```

### Logging

**Log Levels:**
- `error` - Critical failures
- `warn` - Degraded functionality
- `info` - Important events
- `debug` - Detailed trace

**Log Format:**
```
[timestamp] [level] [component] message
[2026-01-25T10:30:00.123Z] [info] [worker-agent] Job executed: job-001 (exit: 0)
```

---

## Performance Characteristics

### Latencies

| Operation | Typical | P95 | P99 |
|-----------|---------|-----|-----|
| Worker register | 50ms | 150ms | 300ms |
| Job queue | 10ms | 30ms | 100ms |
| Job assignment | 5ms | 20ms | 50ms |
| Status poll | 5ms | 15ms | 40ms |
| File upload (10MB) | 2s | 5s | 10s |

### Throughput

| Component | Capacity |
|-----------|----------|
| Concurrent workers | 1000+ |
| Jobs/second | 100+ |
| File uploads/minute | 60+ |
| Status updates/second | 10000+ |

---

## Design Patterns

### 1. Pull Model (vs Push)

**Why Pull?**
- Workers initiate requests
- Server stateless
- Firewall friendly
- Natural rate limiting

**Implementation:**
```javascript
// Worker loop
setInterval(async () => {
  const job = await getJob();
  if (job) {
    executeJob(job);
  }
}, 5000);
```

### 2. Heartbeat Pattern

**Purpose:**
- Detect offline workers
- Clean up stale records
- Monitor health

**Implementation:**
```javascript
// Worker: every 30 seconds
await sendHeartbeat();

// Server: timeout after 60 seconds
if (now - lastHeartbeat > 60000) {
  markWorkerOffline();
}
```

### 3. FIFO Queue

**Benefits:**
- Fair job distribution
- Predictable behavior
- No job starvation

**Implementation:**
```javascript
// Get oldest queued job
const job = await Job.findOne({
  status: 'queued'
}).sort({ createdAt: 1 });
```

### 4. Isolation

**Approach:**
- Each job in temp directory
- Separate process
- Full cleanup after

**Benefits:**
- No cross-job contamination
- Safe failure
- Resource cleanup

---

## Future Enhancements

- [ ] Persistent job queue (Redis)
- [ ] Multi-server clustering
- [ ] Kubernetes operator
- [ ] gRPC communication
- [ ] Job priority levels
- [ ] Partial result streaming
- [ ] Worker auto-scaling
- [ ] Machine learning for job distribution
