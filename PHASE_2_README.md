# Distributed Command Executor - Phase 2 Implementation

This document describes the Phase 2 implementation of the distributed compute system that allows idle PCs to act as worker nodes for command execution.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Web UI (React)                              │
│                  (TerminalInterface.tsx)                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ HTTP POST
                           │ (mode=distributed)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Central Server                               │
│                    (Next.js Backend)                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Worker Registry                                         │   │
│  │ - POST /api/workers/register    (register worker)       │   │
│  │ - POST /api/workers/heartbeat   (worker heartbeat)      │   │
│  │ - GET  /api/workers/register    (list workers)          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Job Queue & Assignment                                  │   │
│  │ - POST /api/jobs/create         (create job)            │   │
│  │ - GET  /api/jobs/get-job        (assign job)            │   │
│  │ - GET  /api/jobs/status         (check status)          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Result Submission                                       │   │
│  │ - POST /api/jobs/submit-result  (completed)             │   │
│  │ - PUT  /api/jobs/submit-result  (failed)                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ File Storage                                            │   │
│  │ - /public/uploads/*.zip         (user uploaded files)   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         ▲                                  ▲
         │ HTTP                            │ HTTP
         │ Polling                         │ Polling
         │ (every 5s)                      │ (every 5s)
         │                                 │
  ┌──────┴─────────────────────────────────┴──────┐
  │                                                │
  │  Worker Agent Nodes (worker-agent.js)         │
  │                                                │
  │  ┌────────────────────────────────────────┐   │
  │  │ PC-1 (Idle Machine)                    │   │
  │  │ - Worker Agent Process                 │   │
  │  │ - Register on startup                  │   │
  │  │ - Heartbeat (every 10s)                │   │
  │  │ - Poll for jobs                        │   │
  │  │ - Execute commands in isolated dir     │   │
  │  │ - Download files from server           │   │
  │  │ - Submit results                       │   │
  │  └────────────────────────────────────────┘   │
  │                                                │
  │  ┌────────────────────────────────────────┐   │
  │  │ PC-2 (Idle Machine)                    │   │
  │  │ - Worker Agent Process                 │   │
  │  │ - Register on startup                  │   │
  │  │ - Heartbeat (every 10s)                │   │
  │  │ - Poll for jobs                        │   │
  │  │ - Execute commands in isolated dir     │   │
  │  │ - Download files from server           │   │
  │  │ - Submit results                       │   │
  │  └────────────────────────────────────────┘   │
  │                                                │
  │  ┌────────────────────────────────────────┐   │
  │  │ PC-N (Idle Machine)                    │   │
  │  │ - Worker Agent Process                 │   │
  │  │ ...                                    │   │
  │  └────────────────────────────────────────┘   │
  │                                                │
  └────────────────────────────────────────────────┘
```

## Job Lifecycle

```
┌─────────────┐
│   PENDING   │  Job created by web UI
│             │  File uploaded to server
└──────┬──────┘
       │
       │ Worker polls /api/jobs/get-job
       │ (only if no idle workers)
       ▼
┌─────────────┐
│   RUNNING   │  Job assigned to idle worker
│             │  Worker downloads file
│             │  Worker executes commands
└──────┬──────┘
       │
       ├─ success ──────────────────┐
       │                            │
       │                            ▼
       │                       ┌──────────────┐
       │                       │  COMPLETED   │
       │                       │              │
       │                       │ (exit 0)     │
       │                       └──────────────┘
       │
       └─ failure ──────────────────┐
                                    │
                                    ▼
                               ┌──────────────┐
                               │    FAILED    │
                               │              │
                               │ (exit != 0)  │
                               └──────────────┘
```

## Files & Directories

### Server-side (Next.js Backend)

```
src/app/api/
├── workers/
│   ├── register/
│   │   └── route.ts         # POST register worker, GET list workers
│   └── heartbeat/
│       └── route.ts         # POST worker heartbeat
│
├── jobs/
│   ├── create/
│   │   └── route.ts         # POST create job, GET list jobs
│   ├── get-job/
│   │   └── route.ts         # GET next available job for worker
│   ├── submit-result/
│   │   └── route.ts         # POST submit results, PUT report failure
│   └── status/
│       └── route.ts         # GET job status
│
└── execute/
    └── route.ts             # POST (Phase 1 + Phase 2 integrated)

public/uploads/               # Temporary file storage for jobs
```

### Client-side Worker Agent

```
worker-agent.js               # Standalone worker process (Node.js)
```

## Setup & Installation

### 1. Server Setup

The server is already integrated into the existing Next.js app. No additional setup needed.

### 2. Worker Agent Setup

The worker agent can run on any machine with Node.js installed.

**On a Windows machine (idle PC):**

```powershell
# Copy worker-agent.js to the idle PC
# Then run:
node worker-agent.js --server http://central-server-ip:3000
```

**On a Linux machine (idle PC):**

```bash
# Copy worker-agent.js to the idle PC
# Then run:
node worker-agent.js --server http://central-server-ip:3000
```

**Advanced: Running as a background service**

**Windows (Task Scheduler):**

1. Create a new task in Task Scheduler
2. Set trigger to "At startup"
3. Set action to: `C:\path\to\node.exe C:\path\to\worker-agent.js --server http://server:3000`
4. Set to run with highest privileges
5. Enable "Run whether user is logged in or not"

**Linux (systemd):**

Create `/etc/systemd/system/cmd-executor-worker.service`:

```ini
[Unit]
Description=CMD Executor Worker Agent
After=network.target

[Service]
Type=simple
User=nobody
WorkingDirectory=/opt/cmd-executor-worker
ExecStart=/usr/bin/node /opt/cmd-executor-worker/worker-agent.js --server http://server:3000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cmd-executor-worker
sudo systemctl start cmd-executor-worker
```

## API Reference

### Worker APIs

#### Register Worker

```http
POST /api/workers/register
Content-Type: application/json

{
  "workerId": "worker-xyz123",
  "hostname": "pc-name",
  "os": "win32",
  "cpuCount": 4,
  "version": "1.0.0"
}

Response (200 OK):
{
  "success": true,
  "workerId": "worker-xyz123",
  "message": "Worker worker-xyz123 registered successfully"
}
```

#### Worker Heartbeat

```http
POST /api/workers/heartbeat
Content-Type: application/json

{
  "workerId": "worker-xyz123"
}

Response (200 OK):
{
  "success": true,
  "workerId": "worker-xyz123",
  "timestamp": 1705329400000
}
```

#### List All Workers

```http
GET /api/workers/register

Response (200 OK):
{
  "workers": [
    {
      "workerId": "worker-abc123",
      "hostname": "pc-1",
      "os": "win32",
      "cpuCount": 4,
      "status": "idle",
      "lastHeartbeat": 1705329400000,
      "version": "1.0.0"
    }
  ],
  "count": 1
}
```

### Job APIs

#### Create Job

```http
POST /api/jobs/create
Content-Type: application/json

{
  "command": "npm install && npm test",
  "fileUrl": "/uploads/project-123456.zip",
  "filename": "project.zip"
}

Response (200 OK):
{
  "success": true,
  "jobId": "job-1705329400000-abc123",
  "message": "Job created successfully"
}
```

#### Get Next Available Job

```http
GET /api/jobs/get-job

Response (200 OK) - Job available:
{
  "success": true,
  "job": {
    "jobId": "job-1705329400000-abc123",
    "command": "npm install && npm test",
    "fileUrl": "/uploads/project-123456.zip",
    "filename": "project.zip"
  }
}

Response (202 Accepted) - No jobs available:
{
  "success": false,
  "message": "No idle workers available",
  "job": null
}
```

#### Check Job Status

```http
GET /api/jobs/status?jobId=job-1705329400000-abc123

Response (200 OK):
{
  "jobId": "job-1705329400000-abc123",
  "status": "completed",
  "workerId": "worker-xyz123",
  "command": "npm install && npm test",
  "filename": "project.zip",
  "stdout": "...",
  "stderr": "...",
  "exitCode": 0,
  "errorMessage": null,
  "createdAt": 1705329400000,
  "startedAt": 1705329402000,
  "completedAt": 1705329410000
}
```

#### Submit Job Result

```http
POST /api/jobs/submit-result
Content-Type: application/json

{
  "jobId": "job-1705329400000-abc123",
  "workerId": "worker-xyz123",
  "stdout": "...",
  "stderr": "...",
  "exitCode": 0
}

Response (200 OK):
{
  "success": true,
  "jobId": "job-1705329400000-abc123",
  "message": "Job result submitted successfully"
}
```

#### Report Job Failure

```http
PUT /api/jobs/submit-result
Content-Type: application/json

{
  "jobId": "job-1705329400000-abc123",
  "workerId": "worker-xyz123",
  "errorMessage": "File download failed"
}

Response (200 OK):
{
  "success": true,
  "jobId": "job-1705329400000-abc123",
  "message": "Job failure recorded successfully"
}
```

#### List All Jobs

```http
GET /api/jobs/create

Response (200 OK):
{
  "jobs": [
    {
      "jobId": "job-1705329400000-abc123",
      "status": "completed",
      "workerId": "worker-xyz123",
      ...
    }
  ],
  "count": 1
}
```

## Using the System

### From Web UI (Distributed Mode)

1. Open the web UI in your browser
2. Click "Upload file" and select a ZIP archive
3. Enter commands to execute
4. Click "Execute"
5. The system will:
   - Create a job on the server
   - Return a job ID
   - Poll the job status in the background
6. Results appear when the assigned worker completes the job

### Monitoring

**View all workers:**

```bash
curl http://localhost:3000/api/workers/register
```

**View all jobs:**

```bash
curl http://localhost:3000/api/jobs/create
```

**Check specific job status:**

```bash
curl "http://localhost:3000/api/jobs/status?jobId=job-1705329400000-abc123"
```

## Key Features of Phase 2

✅ **Decentralized Execution**

- Commands execute on remote worker nodes, not the server
- Server only manages job assignment and result collection

✅ **Worker Registration & Management**

- Workers register on startup with unique IDs
- Automatic online/offline status tracking
- Heartbeat mechanism to detect dead workers

✅ **Job Queue Management**

- FIFO job assignment to idle workers
- Automatic load balancing across available workers
- Job state tracking (pending → running → completed/failed)

✅ **Resilient Communication**

- HTTP polling (no persistent connections required)
- Works across firewalls and NAT
- Workers always initiate requests (pull model)

✅ **Isolation & Safety**

- Each job runs in its own temporary directory
- Jobs cleaned up after completion
- No job can affect the worker agent's core files

✅ **Comprehensive Logging**

- All operations logged with timestamps
- Worker and job lifecycle events tracked
- stdout/stderr capture from executed commands

## Worker Agent Details

### Initialization Flow

```
1. Parse command-line arguments (--server URL)
2. Generate or load persistent worker_id
3. Create work directory (~/.cmd-executor-worker)
4. Register with server
5. Start heartbeat interval (10s)
6. Start job polling interval (5s)
7. Listen for graceful shutdown (SIGINT/SIGTERM)
```

### Job Execution Flow

```
1. Poll /api/jobs/get-job every 5 seconds (if idle)
2. If job available:
   - Download file from server
   - Extract ZIP archive
   - Parse command list
   - Execute each command sequentially
   - Capture stdout, stderr, exit code
   - POST results to /api/jobs/submit-result
3. If job fails:
   - Capture error message
   - PUT failure to /api/jobs/submit-result
4. Cleanup job directory
5. Return to idle state
```

### Configuration Environment Variables

```bash
WORKER_ID=custom-worker-1       # Custom worker ID (default: auto-generated)
HOSTNAME=my-pc                  # Hostname to register (default: system hostname)
```

## Limitations & Future Improvements

### Current Limitations

1. **Persistence**: Jobs stored in-memory + JSON file (not crash-safe)
2. **No Database**: Should use PostgreSQL/MongoDB for production
3. **No Authentication**: Anyone can submit jobs or register workers
4. **No Encryption**: Files transferred in plain HTTP
5. **No Retry Logic**: Failed jobs not automatically retried
6. **Single Server**: No clustering or failover

### Phase 3 Improvements

- [ ] Database backend (PostgreSQL)
- [ ] Authentication & authorization
- [ ] TLS/HTTPS encryption
- [ ] Automatic job retry with exponential backoff
- [ ] Server clustering & load balancing
- [ ] Worker resource constraints (CPU, memory)
- [ ] Job priorities and scheduling
- [ ] Result caching
- [ ] Web dashboard with real-time job monitoring
- [ ] Worker lifecycle management (graceful shutdown, drain mode)
- [ ] Job timeout enforcement
- [ ] Sandboxing/containerization
- [ ] Distributed tracing & metrics

## Testing

### 1. Start the server

```bash
npm run dev
```

### 2. Start a worker (in another terminal)

```bash
node worker-agent.js --server http://localhost:3000
```

### 3. From the web UI:

- Upload a test ZIP file
- Enter a simple command (e.g., `dir` on Windows or `ls` on Linux)
- Click Execute
- Watch the worker logs for execution

### 4. Check job status via API

```bash
curl "http://localhost:3000/api/jobs/status?jobId=YOUR_JOB_ID"
```

## Example Workflow

**Terminal 1 (Server):**

```bash
$ npm run dev
> next dev
  ▲ Next.js 16.1.2
  - Local:        http://localhost:3000
```

**Terminal 2 (Worker on PC-1):**

```bash
$ node worker-agent.js --server http://localhost:3000
[2024-01-15T12:00:00.000Z] [INFO] Starting worker worker-abc123
[2024-01-15T12:00:00.001Z] [INFO] Server: http://localhost:3000
[2024-01-15T12:00:00.002Z] [INFO] Work directory: /Users/username/.cmd-executor-worker
[2024-01-15T12:00:00.500Z] [SUCCESS] Worker registered successfully
[2024-01-15T12:00:00.501Z] [SUCCESS] Worker ready. Waiting for jobs...
```

**Terminal 3 (cURL - Submit Job):**

```bash
$ curl -X POST http://localhost:3000/api/execute \
  -F "file=@project.zip" \
  -F "commands=npm install\nnpm test" \
  -F "mode=distributed"

{
  "success": true,
  "jobId": "job-1705329400000-abc123",
  "mode": "distributed",
  "message": "Job created. Waiting for idle worker to pick it up.",
  "checkStatusUrl": "/api/jobs/status?jobId=job-1705329400000-abc123"
}
```

**Worker logs (Terminal 2):**

```
[2024-01-15T12:00:05.000Z] [INFO] Executing job job-1705329400000-abc123
[2024-01-15T12:00:05.001Z] [INFO] Command: npm install\nnpm test
[2024-01-15T12:00:05.002Z] [INFO] Downloading file from /uploads/project-123456.zip...
[2024-01-15T12:00:05.100Z] [SUCCESS] File downloaded
[2024-01-15T12:00:05.101Z] [INFO] Extracting zip file...
[2024-01-15T12:00:05.200Z] [SUCCESS] Extraction complete
[2024-01-15T12:00:05.201Z] [INFO] Running: npm install
...npm output...
[2024-01-15T12:00:15.500Z] [INFO] Running: npm test
...test output...
[2024-01-15T12:00:25.000Z] [INFO] Submitting results to server...
[2024-01-15T12:00:25.100Z] [SUCCESS] Job job-1705329400000-abc123 completed successfully
[2024-01-15T12:00:25.101Z] [INFO] Job directory cleaned up
```

**Check job status (Terminal 3):**

```bash
$ curl "http://localhost:3000/api/jobs/status?jobId=job-1705329400000-abc123"

{
  "jobId": "job-1705329400000-abc123",
  "status": "completed",
  "workerId": "worker-abc123",
  "command": "npm install\nnpm test",
  "filename": "project.zip",
  "stdout": "...npm and test output...",
  "stderr": "",
  "exitCode": 0,
  "errorMessage": null,
  "createdAt": 1705329400000,
  "startedAt": 1705329405000,
  "completedAt": 1705329425100
}
```

## Conclusion

Phase 2 transforms the system from a simple web server executing commands locally to a distributed computing platform where idle PCs work together to process jobs. The architecture is extensible and ready for Phase 3 enhancements.
