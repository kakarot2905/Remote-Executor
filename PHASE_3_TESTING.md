# Phase 3 Testing & Quick Start

## Server Setup

```bash
# Install dependencies (if not already done)
npm install

# Start the Next.js server
npm run dev
# Server runs on http://localhost:3000
```

## Start Workers

```bash
# Terminal 1: Worker A (default: 4 parallel jobs)
node worker-agent.js

# Terminal 2: Worker B with custom parallelism
MAX_PARALLEL_JOBS=2 node worker-agent.js

# Terminal 3: Worker C with custom CPU/memory limits
DOCKER_MEMORY_LIMIT=256m DOCKER_CPU_LIMIT=1.0 node worker-agent.js
```

## Check Worker Status

```bash
# List all connected workers with resource metrics
curl http://localhost:3000/api/workers/list | jq

# Expected output:
{
  "success": true,
  "workers": [
    {
      "workerId": "worker-10d08fe4",
      "status": "IDLE",
      "hostname": "LAPTOP-XYZ",
      "os": "win32",
      "cpuCount": 4,
      "cpuUsage": 12.5,
      "ramTotalMb": 16384,
      "ramFreeMb": 8192,
      "currentJobIds": [],
      "reservedCpu": 0,
      "reservedRamMb": 0,
      "cooldownUntil": null
    }
  ],
  "totalWorkers": 1,
  "idleWorkers": 1,
  "busyWorkers": 0,
  "unhealthyWorkers": 0
}
```

## Create and Submit Jobs

### Method 1: Via Web UI

1. Navigate to http://localhost:3000
2. Upload a ZIP file with your project
3. Enter commands to execute
4. Select "Distributed Mode"
5. Watch job progress in the interface

### Method 2: Via cURL

```bash
# Create a simple test job
curl -X POST http://localhost:3000/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "command": "echo Hello from Phase 3 scheduler",
    "fileUrl": "/uploads/test.zip",
    "filename": "test.zip",
    "requiredCpu": 1,
    "requiredRamMb": 256,
    "timeoutMs": 30000,
    "maxRetries": 2
  }' | jq

# Response:
{
  "success": true,
  "jobId": "job-1768506443532-tt5j12bg1",
  "message": "Job created successfully"
}
```

### Method 3: Create test ZIP and upload

```bash
# Create a simple test script
mkdir test-project
cd test-project
echo "echo 'Job executed successfully!'" > test.sh
zip -r test.zip .

# Upload via distributed mode
curl -X POST http://localhost:3000/api/execute \
  -F "file=@test.zip" \
  -F "commands=bash test.sh" \
  -F "mode=distributed" | jq
```

## Monitor Job Progress

```bash
# Get job status
JOB_ID="job-1768506443532-tt5j12bg1"
curl http://localhost:3000/api/jobs/status?jobId=$JOB_ID | jq

# Expected output:
{
  "jobId": "job-1768506443532-tt5j12bg1",
  "status": "RUNNING",
  "assignedAgentId": "worker-10d08fe4",
  "attempts": 1,
  "maxRetries": 2,
  "requiredCpu": 1,
  "requiredRamMb": 256,
  "timeoutMs": 30000,
  "stdout": "Job executed successfully!",
  "stderr": "",
  "exitCode": 0,
  "startedAt": 1768506443532,
  "completedAt": 1768506445123
}
```

## Test Scenarios

### Scenario 1: Basic Job Execution

✓ Single job, single worker
✓ Verify scheduler assigns job
✓ Verify worker executes
✓ Verify output captured

```bash
curl -X POST http://localhost:3000/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "command": "echo test",
    "fileUrl": "/uploads/dummy.zip",
    "filename": "dummy.zip"
  }' | jq '.jobId' -r > job.txt

# Wait 5 seconds for assignment and execution
sleep 5

curl http://localhost:3000/api/jobs/status?jobId=$(cat job.txt) | jq '.status'
# Should output: "COMPLETED"
```

### Scenario 2: Multi-Job Parallelism

✓ Create 5 jobs
✓ Observe workers picking up multiple jobs concurrently
✓ Verify no resource overallocation

```bash
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/jobs/create \
    -H "Content-Type: application/json" \
    -d "{
      \"command\": \"echo Job $i\",
      \"fileUrl\": \"/uploads/dummy.zip\",
      \"filename\": \"dummy.zip\",
      \"requiredCpu\": 1,
      \"requiredRamMb\": 256
    }" | jq '.jobId' -r
done

# Check worker load
curl http://localhost:3000/api/workers/list | jq '.workers[0] | {status, currentJobIds, reservedCpu, reservedRamMb}'
```

### Scenario 3: Resource Constraints

✓ Create job requiring 8 CPU on 4-core machine
✓ Verify job stays QUEUED until capacity available
✓ Kill a worker, verify job requeued

```bash
curl -X POST http://localhost:3000/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "command": "echo high-resource job",
    "fileUrl": "/uploads/dummy.zip",
    "filename": "dummy.zip",
    "requiredCpu": 8,
    "requiredRamMb": 2048
  }' | jq '.jobId' -r > job.txt

# Check status
curl http://localhost:3000/api/jobs/status?jobId=$(cat job.txt) | jq '.status'
# Should stay "QUEUED" until a worker becomes available
```

### Scenario 4: Job Timeout

✓ Create job with short timeout (5 seconds)
✓ Job timeout should trigger, resources reclaimed
✓ Job requeued for retry

```bash
curl -X POST http://localhost:3000/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "command": "sleep 30",
    "fileUrl": "/uploads/dummy.zip",
    "filename": "dummy.zip",
    "timeoutMs": 5000,
    "maxRetries": 1
  }' | jq '.jobId' -r > job.txt

# Wait for timeout + scheduler sweep
sleep 10

# Check status - should be requeued
curl http://localhost:3000/api/jobs/status?jobId=$(cat job.txt) | jq '.status, .attempts'
```

### Scenario 5: Worker Failure & Cooldown

✓ Start a worker, create jobs
✓ Kill the worker (Ctrl+C)
✓ Verify jobs marked UNHEALTHY/reassigned
✓ Verify heartbeat timeout triggers (30 seconds)

```bash
# Start worker, let it get 2 jobs assigned
# Then: Ctrl+C to kill it
# Observe: Worker marked OFFLINE after 30 seconds
# Observe: Jobs released back to queue
```

### Scenario 6: Job Cancellation

✓ Create job
✓ While QUEUED, cancel it
✓ Verify job marked FAILED, resources released

```bash
JOB_ID=$(curl -X POST http://localhost:3000/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "command": "sleep 100",
    "fileUrl": "/uploads/dummy.zip",
    "filename": "dummy.zip",
    "timeoutMs": 300000
  }' | jq '.jobId' -r)

# Immediately cancel
curl -X POST http://localhost:3000/api/jobs/cancel \
  -H "Content-Type: application/json" \
  -d "{\"jobId\": \"$JOB_ID\"}" | jq

# Check status
curl http://localhost:3000/api/jobs/status?jobId=$JOB_ID | jq '.status'
# Should be "FAILED" with errorMessage "Job cancelled by user"
```

## Monitoring Tools

### Watch Dashboard

```bash
# Keep browser open to http://localhost:3000
# Refresh every 3 seconds to see:
# - Worker count by status
# - CPU/RAM per worker
# - Active jobs
```

### Tail Logs

```bash
# Terminal running server
# Watch for scheduler logs:
# [INFO] Worker marked as offline
# [INFO] Job assigned to worker
# [ERROR] Job execution failed

# Terminal running worker(s)
# Watch for:
# [SUCCESS] Job completed
# [INFO] Executing job
# [ERROR] Download failed
```

### Query API Directly

```bash
# Full system state
curl http://localhost:3000/api/workers/list | jq
curl http://localhost:3000/api/jobs/create | jq  # GET lists all jobs

# Real-time polling
watch -n 1 'curl -s http://localhost:3000/api/workers/list | jq ".workers | length"'
```

## Troubleshooting

### Worker won't register

```
✗ Error: Failed to register: Connection refused
→ Check server is running on http://localhost:3000
→ Check --server flag: node worker-agent.js --server http://localhost:3000
```

### Worker registers but no jobs assigned

```
✗ Jobs stay in QUEUED, no ASSIGNED
→ Check /api/jobs/create returned successfully
→ Check /api/workers/list shows worker as IDLE
→ Check scheduler is running (logs should show "Scheduler running")
→ Verify job requirements fit worker capacity
```

### Job times out immediately

```
✗ Status: FAILED, errorMessage: "Execution timeout"
→ Docker image might be downloading, increase timeoutMs
→ Check DOCKER_TIMEOUT env var on worker
```

### Heartbeat errors

```
! Heartbeat error: Connection refused
→ Server might have restarted
→ Check network connectivity
→ Worker will retry heartbeat every 10 seconds
```

## Performance Tuning

**For high throughput:**

- Increase `MAX_PARALLEL_JOBS` on workers with high CPU count
- Decrease `SCHEDULER_INTERVAL_MS` for faster job assignment
- Use smaller Docker images to reduce pull time

**For high reliability:**

- Increase `maxRetries` in job submission
- Increase `timeoutMs` for slow operations
- Deploy multiple workers for redundancy

**For low latency:**

- Pre-pull Docker images: `docker pull python:3.11-slim`
- Use lightweight base images
- Deploy workers geographically close to server

---

**Phase 3 is now ready for testing! Start with Scenario 1, then progressively test more complex scenarios.** 🧪
