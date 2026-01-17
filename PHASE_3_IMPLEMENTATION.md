# Phase 3: Distributed Scheduling & Resource-Aware Execution

## Overview

Phase 3 introduces a centralized scheduler, resource tracking, and smart job assignment to maximize utilization across your distributed agent network. Jobs now wait in a queue until suitable resources become available, agents report their health and metrics continuously, and the system automatically retries failed jobs on different agents.

## Key Components

### 1. **Enhanced Data Models** (`src/lib/registries.ts`)

#### Job Lifecycle (8-state model)

```
SUBMITTED → QUEUED → ASSIGNED → RUNNING → COMPLETED
                  ↘ (if no capacity)
                  ↘ (timeout/failure) → FAILED (with retry)
```

**New Job Fields:**

- `requiredCpu`: Number of logical cores needed (default: 1)
- `requiredRamMb`: RAM requirement in MB (default: 256)
- `timeoutMs`: Per-job execution timeout (default: 5 minutes)
- `status`: SUBMITTED, QUEUED, ASSIGNED, RUNNING, COMPLETED, FAILED
- `assignedAgentId`: Worker currently executing this job
- `attempts`: Number of attempts made (for retries)
- `maxRetries`: Maximum retry attempts (default: 3)
- `queuedAt`, `assignedAt`, `startedAt`: Timing metadata

**New Worker Fields:**

- `cpuUsage`: Current CPU utilization percentage
- `ramTotalMb`, `ramFreeMb`: RAM metrics
- `status`: IDLE, BUSY, UNHEALTHY, OFFLINE
- `currentJobIds`: Array of jobs this agent is executing (multi-job support)
- `reservedCpu`, `reservedRamMb`: Resources committed to queued jobs
- `cooldownUntil`: Timestamp when agent recovers from failure penalty
- `healthReason`: Why agent is unhealthy (e.g., "heartbeat_timeout")

### 2. **Centralized Scheduler** (`src/lib/scheduler.ts`)

The scheduler runs every 5 seconds and on key events (job creation, heartbeat, job completion).

**Key Responsibilities:**

#### Heartbeat & Health Tracking

- Marks workers **OFFLINE** if no heartbeat for 30+ seconds
- Automatically rereleases their jobs back to the queue
- Clears cooldown flags once workers recover

#### Resource Awareness

- Tracks reserved (promised) and free resources per agent
- Avoids overloading workers even if they report available capacity
- Considers both CPU and RAM when scoring agents

#### Timeout Enforcement

- Checks running jobs against their `timeoutMs`
- Reclaims resources and requeues jobs if timeout exceeded
- Respects `maxRetries` limit before marking as FAILED

#### Smart Job Assignment

```
For each QUEUED job (in arrival order):
  1. Find agents that:
     - Have status IDLE or BUSY
     - Are not in cooldown
     - Have enough free CPU and RAM
     - CPU usage < 90% (overload guard)
  2. Score each candidate by:
     - Current CPU load (60% weight)
     - CPU saturation (30% weight)
     - RAM saturation (10% weight)
  3. Assign to lowest-scoring agent
  4. Reserve resources so not double-booked
```

#### Failure Handling

- Records failure, imposes 30-second cooldown
- Releases agent's jobs for requeue if retries remain
- Marks jobs FAILED if max retries exceeded

### 3. **Agent Enhancements** (`worker-agent.js`)

#### Rich Heartbeats

Agents now send every 10 seconds:

```json
{
  "workerId": "worker-abc123",
  "cpuUsage": 45.2,
  "ramFreeMb": 2048,
  "ramTotalMb": 8192,
  "status": "BUSY" or "IDLE"
}
```

#### Multi-Job Concurrency

- Respects configured parallelism limit (default: CPU count / 2, configurable via `MAX_PARALLEL_JOBS`)
- Polls for new jobs only if below capacity
- Manages job lifecycle per-job without shared state

#### Per-Job Timeouts

- Each job has its own `timeoutMs` (not global)
- Docker executor receives per-job timeout
- Enables diverse workload types (quick scripts vs. long processes)

**Configuration:**

```bash
MAX_PARALLEL_JOBS=4 node worker-agent.js  # Run up to 4 jobs in parallel
DOCKER_TIMEOUT=600000 node worker-agent.js  # Override default 5-min timeout
```

### 4. **API Enhancements**

#### `/api/workers/register` (POST)

Now captures initial resource snapshot:

```json
{
  "workerId": "...",
  "cpuUsage": 25,
  "ramTotalMb": 8192,
  "ramFreeMb": 4096,
  "status": "IDLE"
}
```

#### `/api/workers/heartbeat` (POST)

Accepts resource metrics:

```json
{
  "workerId": "...",
  "cpuUsage": 35,
  "ramFreeMb": 3500,
  "ramTotalMb": 8192,
  "status": "BUSY"
}
```

#### `/api/workers/list` (GET)

Returns expanded worker details:

```json
{
  "workers": [
    {
      "workerId": "...",
      "status": "BUSY",
      "cpuCount": 4,
      "cpuUsage": 35,
      "ramTotalMb": 8192,
      "ramFreeMb": 3500,
      "currentJobIds": ["job-123", "job-456"],
      "reservedCpu": 2,
      "reservedRamMb": 512,
      "cooldownUntil": null,
      "updatedAt": 1234567890
    }
  ],
  "idleWorkers": 2,
  "busyWorkers": 3,
  "unhealthyWorkers": 1
}
```

#### `/api/jobs/create` (POST)

Now accepts resource requirements:

```json
{
  "command": "python train.py",
  "fileUrl": "/uploads/project.zip",
  "filename": "project.zip",
  "requiredCpu": 2,
  "requiredRamMb": 1024,
  "timeoutMs": 3600000,
  "maxRetries": 3
}
```

#### `/api/jobs/get-job` (GET)

Now requires `workerId` query param:

```
GET /api/jobs/get-job?workerId=worker-123
```

Returns only jobs assigned to that specific worker.

#### `/api/jobs/status` (GET)

Returns full lifecycle metadata:

```json
{
  "jobId": "...",
  "status": "RUNNING",
  "assignedAgentId": "worker-123",
  "attempts": 2,
  "maxRetries": 3,
  "requiredCpu": 2,
  "requiredRamMb": 512,
  "timeoutMs": 300000,
  "queuedAt": 1234567890,
  "assignedAt": 1234567900,
  "startedAt": 1234567910,
  "completedAt": null
}
```

#### `/api/jobs/submit-result` (POST)

Returns with resource release:

- Success → releases reserved resources, marks job COMPLETED, triggers reschedule
- Failure → triggers retry decision (requeue or mark FAILED) and agent cooldown

#### `/api/jobs/cancel` (POST)

Respects job state:

- QUEUED/ASSIGNED: Cancel immediately, release resources
- RUNNING: Mark for cancellation, let worker cleanup

## Execution Flow Example

```
1. Client submits job with requiredCpu=2, requiredRamMb=512, timeoutMs=60000
   → Job enters QUEUED state, scheduler triggered

2. Scheduler runs:
   - Finds 3 idle workers, scores each
   - Worker-A has lowest score (least loaded)
   - Reserves 2 CPU and 512 MB on Worker-A
   - Job transitions to ASSIGNED

3. Worker-A polls /api/jobs/get-job?workerId=Worker-A
   - Gets assigned job, transitions to RUNNING
   - startedAt timestamp recorded
   - Worker executes in Docker with job's timeoutMs

4a. [SUCCESS PATH]
    - Job completes, worker calls submit-result
    - Resources released (2 CPU, 512 MB freed on Worker-A)
    - Job marked COMPLETED
    - Scheduler reschedules waiting QUEUED jobs

4b. [TIMEOUT PATH]
    - Scheduler periodic check finds job exceeded timeoutMs
    - Resources reclaimed from Worker-A
    - Job transitions to QUEUED for retry (if attempts < maxRetries)
    - On next poll, different agent might get it

4c. [FAILURE PATH]
    - Worker reports error via submit-result (PUT)
    - Worker gets 30-second cooldown
    - If attempts < maxRetries: job requeued as QUEUED
    - If attempts >= maxRetries: job marked FAILED
```

## Persistence

All state is persisted to temp files (rebuild on server restart):

- `{tmpdir}/cmd-executor-jobs.json`
- `{tmpdir}/cmd-executor-workers.json`

On load, legacy field names are normalized to new model automatically.

## Monitoring & Logs

**Key log patterns to watch:**

```
✓ Worker registered successfully (health check: CPU/RAM captured)
✓ Heartbeat received with updated metrics
✓ Job {jobId} assigned to worker {workerId}
✓ Scheduler reclaimed {N} timed-out jobs
✓ Job {jobId} completed
! Job execution error: {reason}
! Worker {workerId} marked as offline (heartbeat timeout)
! Job {jobId} max retries exceeded
```

## Configuration

**Worker Agent:**

```bash
WORKER_ID=custom-id
SERVER=http://my-server:3000
HEARTBEAT_INTERVAL=10000       # ms between heartbeats (default: 10s)
JOB_POLL_INTERVAL=5000         # ms between job polls (default: 5s)
MAX_PARALLEL_JOBS=8            # 0=auto (default: CPU/2)
DOCKER_TIMEOUT=300000          # ms (default: 5min)
DOCKER_MEMORY_LIMIT=512m       # per job
DOCKER_CPU_LIMIT=2.0           # per job
ENABLE_DOCKER=false            # disable sandboxing if needed
```

**Scheduler:**

```
HEARTBEAT_TIMEOUT_MS=30000     # mark offline after this gap
AGENT_COOLDOWN_MS=30000        # penalty duration after failure
SCHEDULER_INTERVAL_MS=5000     # periodic sweep frequency
```

## UI Updates

Worker dashboard now shows:

- IDLE / BUSY / UNHEALTHY / OFFLINE status indicators
- CPU usage percentage
- Free/total RAM
- Number of active jobs per agent
- Unhealthy count in summary stats

## Next Steps

1. **Test multi-agent scenarios** with jobs of varying resource requirements
2. **Tune scheduler parameters** based on your workload patterns
3. **Implement persistent storage** (PostgreSQL, MongoDB) for production
4. **Add agent telemetry/metrics** export to monitoring systems
5. **Implement priority queues** for time-sensitive jobs
6. **Add job dependencies** (Job B waits for Job A completion)
7. **Implement dynamic scaling** (trigger new containers based on queue depth)

## Known Limitations

- In-memory state lost on server restart (implement DB persistence)
- Single-machine scheduler (not distributed for very large clusters)
- No preemption (running jobs can't be paused)
- Basic CPU/RAM scoring (doesn't account for GPU, disk I/O, etc.)
- No cross-zone or locality awareness

---

**Phase 3 enables a production-ready distributed job queue with resource awareness and automatic failure recovery.** 🚀
