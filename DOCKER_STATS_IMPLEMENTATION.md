# Docker Container Stats Display - Complete Implementation

## Overview

The Electron UI now displays real-time Docker container resource consumption for job execution containers managed by the worker-agent.

## How It Works

### Data Source Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Two Data Paths (Hybrid Approach)                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  PATH 1: Worker Logs (When Worker Running with Jobs)                │
│  ────────────────────────────────────────────────────────            │
│  worker-agent.js                                                    │
│  ├─ getDockerContainerStats()                                       │
│  ├─ Queries: docker ps --filter "name=cmd-exec"                    │
│  ├─ Queries: docker stats --no-stream for each container           │
│  └─ Logs: [WORKER-STATS] dockerContainers=X dockerCpuUsage=Y...    │
│      ↓                                                               │
│  Electron main.js                                                   │
│  ├─ Captures stdout from worker process                            │
│  ├─ parseWorkerHeartbeat() regex extracts values                   │
│  └─ Updates workerStats object with timestamp                      │
│      ↓                                                               │
│  Electron renderer.js                                               │
│  └─ Displays metrics (CPU%, Memory MB, Container Count)            │
│                                                                       │
│  ───────────────────────────────────────────────────────────────    │
│                                                                       │
│  PATH 2: Direct Docker Query (Fallback/When Worker Idle)           │
│  ──────────────────────────────────────────────────────────          │
│  Electron main.js                                                   │
│  ├─ getDockerContainerStats()                                       │
│  ├─ Checks: workerStats.lastUpdated < 5 seconds ago?              │
│  ├─ If YES: Use cached worker stats                                │
│  ├─ If NO: Query Docker directly                                   │
│  │   ├─ docker ps --filter "name=cmd-exec"                        │
│  │   ├─ docker stats --no-stream [container]                      │
│  │   └─ Parse and aggregate results                                │
│  └─ Return aggregated stats                                         │
│      ↓                                                               │
│  Electron renderer.js                                               │
│  └─ Displays metrics (CPU%, Memory MB, Container Count)            │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. worker-agent.js (`getDockerContainerStats()`)

```javascript
const getDockerContainerStats = () => {
  // Queries docker ps for containers matching "cmd-exec" pattern
  // Gets stats using docker stats --no-stream
  // Aggregates CPU% and memory MB
  // Returns: {containerCount, cpuUsage, memoryMb, containers}
};

// In sendHeartbeat():
log(
  `[WORKER-STATS] dockerContainers=${count} dockerCpuUsage=${cpu} dockerMemoryMb=${mem}`,
  "INFO",
);
```

### 2. Electron main.js

**Capture from Worker Logs:**

```javascript
function parseWorkerHeartbeat(data) {
  if (data.includes("[WORKER-STATS]")) {
    // Extract: dockerContainers=2 dockerCpuUsage=25.67 dockerMemoryMb=512
    workerStats = {
      dockerContainers,
      dockerCpuUsage,
      dockerMemoryMb,
      lastUpdated,
    };
  }
}
```

**Fallback to Direct Docker Query:**

```javascript
async function getDockerContainerStats() {
  // Use worker stats if fresh (<5 seconds old)
  if (workerStats.lastUpdated && Date.now() - workerStats.lastUpdated < 5000) {
    return { cpuUsage, memoryMb, containerCount };
  }

  // Otherwise query Docker directly
  // Executes: docker ps --filter "name=cmd-exec"
  // Then: docker stats --no-stream for each container
  // Returns aggregated stats
}
```

**IPC Handler:**

```javascript
ipcMain.handle("get-docker-stats", async () => {
  const stats = await getDockerContainerStats();
  console.log("[IPC] get-docker-stats called, returning:", stats);
  return stats;
});
```

### 3. Electron renderer.js

**Polling (Every 2 Seconds):**

```javascript
async function refreshDockerStats() {
  const stats = await window.electronAPI.getDockerStats();

  cpuMetric.textContent = `${stats.cpuUsage}%`;
  memMetric.textContent = `${stats.memoryMb} MB`;
  jobsMetric.textContent = `${stats.containerCount}`;
}

setInterval(refreshDockerStats, 2000);
```

## UI Display

### Status Panel Metrics

- **CPU**: Shows total CPU percentage across all running job containers
- **MEM**: Shows total memory in MB consumed by job containers
- **JOBS**: Shows count of running job containers

Example Display:

```
┌─────────────────────────────────────────┐
│ STATUS: RUNNING [ID: worker-abcd1234]   │
│ PID: 12345                              │
├─────────────────────────────────────────┤
│  CPU: 45.23%     MEM: 1024 MB   JOBS: 3 │
└─────────────────────────────────────────┘
```

## Data Flow During Job Execution

### Timeline Example (3 containers running)

**T=0s** - Worker heartbeat interval triggers (10 second interval)

```
worker-agent.js:
  docker ps → Lists: container-1, container-2, container-3
  docker stats → CPU: 15% + 20% + 10% = 45%
               → MEM: 256 + 512 + 256 = 1024 MB
  Logs: [WORKER-STATS] dockerContainers=3 dockerCpuUsage=45 dockerMemoryMb=1024
```

**T=0.1s** - Electron captures log

```
main.js parseWorkerHeartbeat():
  Regex matches: containerCount=3, cpuUsage=45, memoryMb=1024
  Updates: workerStats = {3, 45, 1024, timestamp}
```

**T=2s** - First renderer refresh (runs every 2s)

```
renderer.js refreshDockerStats():
  Calls: getDockerContainerStats()
  main.js:
    Checks: is workerStats.lastUpdated within 5 seconds? YES
    Returns: cached stats {45, 1024, 3}
  renderer.js updates:
    cpuMetric.textContent = "45%"
    memMetric.textContent = "1024 MB"
    jobsMetric.textContent = "3"
```

**T=4s** - Second renderer refresh (stats still fresh)

```
renderer.js: Same display (uses cached stats from T=0.1s)
```

**T=5.5s** - Renderer refresh (stats now stale)

```
renderer.js refreshDockerStats():
  Calls: getDockerContainerStats()
  main.js:
    Checks: is workerStats.lastUpdated within 5 seconds? NO (5.4s ago)
    Queries Docker directly:
      docker ps → container-1, container-3 (container-2 finished)
      docker stats → CPU: 18% + 12% = 30%
                   → MEM: 256 + 256 = 512 MB
    Returns: {30, 512, 2}
  renderer.js updates: CPU 30%, MEM 512 MB, JOBS 2
```

## Error Handling

### Docker Unavailable

- Returns: `{cpuUsage: 0, memoryMb: 0, containerCount: 0}`
- UI displays: CPU: 0%, MEM: 0 MB, JOBS: 0

### No Containers Running

- Returns: `{cpuUsage: 0, memoryMb: 0, containerCount: 0}`
- UI displays: CPU: 0%, MEM: 0 MB, JOBS: 0

### Worker Not Started

- Returns: `{cpuUsage: 0, memoryMb: 0, containerCount: 0}`
- UI displays: CPU: 0%, MEM: 0 MB, JOBS: 0 (until you start worker and submit jobs)

## Memory Units Parsing

The system handles multiple Docker memory output formats:

- `256B` → converts to MB
- `512KiB` → converts to MB (÷1024)
- `256MiB` → already in MB
- `2GiB` → converts to MB (×1024)

## Performance Considerations

1. **Rendering Refresh Rate**: 2 seconds
2. **Worker Heartbeat**: 10 seconds (logs stats)
3. **Cache Duration**: 5 seconds (uses worker stats if fresh)
4. **Docker Query Overhead**: Only when cache is stale

## Debugging

Console logs available:

- `[IPC] get-docker-stats called, returning: {...}`
- `[STATS PARSED] {...}` (when worker logs captured)
- `[RENDERER] Docker stats received: {...}`
- `[RENDERER] Updated CPU metric: X%`

To see these, open DevTools in Electron (automatically opens if NODE_ENV=development).

## Testing Steps

1. Start Electron app: `npm run electron`
2. Configure worker settings
3. Click "Start Worker"
4. Watch for logs: `[WORKER-STATS]` messages
5. Submit jobs to the server
6. Observe CPU%, Memory MB, Container Count updating in Status Panel

## Limitations

1. Only shows containers named `cmd-exec-*` (job containers)
2. Aggregates stats (doesn't show per-container breakdown)
3. Stats updated every 2-10 seconds (not real-time)
4. Requires Docker daemon running
5. On systems without Docker, shows 0 values

## Future Enhancements

- [ ] Per-container breakdown view
- [ ] Historical stats trending/graphing
- [ ] Container-specific logs viewer
- [ ] Resource threshold alerts
- [ ] Export stats to CSV/JSON
