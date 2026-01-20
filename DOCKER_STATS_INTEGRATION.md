# Docker Container Stats Integration

## Overview

The Electron UI now gets Docker container stats directly from the worker-agent.js backend, which has direct knowledge of the running job containers.

## Architecture

### Data Flow

```
worker-agent.js
    ↓ (collects Docker stats via docker ps/docker stats)
    ↓ (logs stats in heartbeat output)
    ↓
Electron main.js
    ↓ (parses stats from worker stdout)
    ↓ (stores in workerStats object)
    ↓
Electron renderer.js
    ↓ (queries main.js every 2 seconds)
    ↓
UI Display (CPU%, Memory MB, Container Count)
```

## Implementation Details

### 1. worker-agent.js Changes

**New Function: `getDockerContainerStats()`**

- Located after `collectSystemStats()` function
- Queries running Docker containers matching pattern `cmd-exec-*`
- Uses `docker ps` to list containers
- Uses `docker stats --no-stream` to get CPU and memory metrics
- Aggregates stats across all running job containers
- Returns: `{containerCount, cpuUsage, memoryMb, containers}`

**Updated Method: `sendHeartbeat()`**

- Now calls `getDockerContainerStats()` on every heartbeat
- Includes Docker stats in the server heartbeat request
- **Logs Docker stats** in format: `[WORKER-STATS] dockerContainers=X dockerCpuUsage=Y dockerMemoryMb=Z`
- This log line is captured by Electron for UI updates

### 2. Electron main.js Changes

**New State Variables:**

```javascript
let workerStats = {
  dockerContainers: 0,
  dockerCpuUsage: 0,
  dockerMemoryMb: 0,
};
```

**New Function: `parseWorkerHeartbeat(data)`**

- Regex extracts Docker stats from worker stdout
- Updates `workerStats` object with latest metrics
- Called on every worker stdout event

**Updated Function: `getDockerContainerStats()`**

- Now returns stats from `workerStats` instead of querying Docker directly
- Much more efficient (no Docker CLI calls from Electron)
- Gets accurate data from the worker that's managing the containers

**Updated stdout Handler:**

```javascript
workerProcess.stdout.on("data", (data) => {
  // ... existing code ...

  // Parse Docker stats from heartbeat output
  parseWorkerHeartbeat(text);

  // ... existing code ...
});
```

### 3. No Changes to Electron Renderer

- Renderer.js already polls `get-docker-stats` every 2 seconds
- Display updates automatically with new worker-provided data

## Benefits

1. **Accuracy**: Stats come from the source (worker that manages containers)
2. **Efficiency**: No redundant Docker CLI calls from Electron
3. **Real-time**: Heartbeat already sends stats every 10 seconds
4. **Reliable**: Worker has authoritative knowledge of job containers

## Supported Metrics

- **CPU Usage**: Percentage (e.g., "12.34%") - aggregated across all containers
- **Memory Usage**: Megabytes - aggregated across all containers
- **Container Count**: Number of running job containers

## Example Output

```
[2026-01-20T15:30:45.123Z] [INFO] [WORKER-STATS] dockerContainers=2 dockerCpuUsage=25.67 dockerMemoryMb=512
```

Parsed by Electron:

```javascript
workerStats = {
  dockerContainers: 2,
  dockerCpuUsage: 25.67,
  dockerMemoryMb: 512,
};
```

## Testing

1. Start the Electron app
2. Configure worker settings
3. Click "Start Worker"
4. Submit some jobs to the server
5. Observe CPU%, Memory MB, and Container Count updating in the Status Panel

## Fallback Behavior

If Docker is unavailable or no containers are running:

- `containerCount`: 0
- `cpuUsage`: 0
- `memoryMb`: 0

This ensures the UI never crashes and gracefully handles edge cases.
