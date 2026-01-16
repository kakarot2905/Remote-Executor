# Docker Sandbox - Quick Start Guide

## What Changed?

Every task executed by workers now runs **inside an isolated Docker container** instead of directly on the host.

## Security Improvements

| Aspect               | Before                         | After                                 |
| -------------------- | ------------------------------ | ------------------------------------- |
| Filesystem access    | Full read/write access to host | Read-only root FS + limited temp dirs |
| Networking           | Full network access            | No network access                     |
| Resource limits      | Process-level only             | Container-level CPU/memory caps       |
| Execution timeout    | Soft timeout (may not kill)    | Hard timeout (forceful kill)          |
| Privilege escalation | Possible                       | Blocked via capabilities drop         |
| System stability     | Can interfere with host        | Fully isolated                        |

## Enabling/Disabling Docker Execution

### Enable (Default)

```bash
node worker-agent.js --server http://localhost:3000
# Docker execution is ON by default
```

### Disable (Legacy Mode)

```bash
ENABLE_DOCKER=false node worker-agent.js --server http://localhost:3000
# Falls back to direct host execution (not recommended)
```

## Configuration

Set environment variables to customize container behavior:

```bash
# Execution timeout: 30 seconds
DOCKER_TIMEOUT=30000

# Memory per container: 512 MB
DOCKER_MEMORY_LIMIT=512m

# CPU per container: 2.0 cores
DOCKER_CPU_LIMIT=2.0

# Enable/disable Docker (default: true)
ENABLE_DOCKER=true

node worker-agent.js
```

## Requirements

1. **Docker Installed**

   ```bash
   docker --version
   docker ps  # Verify daemon is running
   ```

2. **Linux Permissions** (if on Linux)

   ```bash
   # Add current user to docker group
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. **Images Pre-pulled** (optional but recommended)
   ```bash
   docker pull alpine:latest
   docker pull node:22-alpine
   docker pull python:3.11-slim
   docker pull gcc:14-alpine
   ```

## How It Works

### Container Lifecycle Per Task

```
1. Create unique temp directory
2. Extract/prepare task files
3. Spawn Docker container with:
   - Read-only root filesystem
   - No network access
   - Memory limit: 512 MB
   - CPU limit: 2.0 cores
   - Timeout: 30 seconds
4. Execute command inside container
5. Capture all output (stdout/stderr)
6. Wait for container exit or timeout
7. Forcefully kill if timeout exceeded
8. Auto-cleanup container and temp files
9. Return results to server
```

### Isolation Details

**What's Isolated:**

- ✓ Filesystem (read-only root)
- ✓ Networking (disabled)
- ✓ Resources (CPU/memory capped)
- ✓ Processes (max 32)
- ✓ Capabilities (all dropped)

**What's Available:**

- `/workspace`: Task files and working directory
- `/tmp`: Up to 50 MB writable space
- `/run`: Up to 10 MB writable space
- Standard shell utilities (sh, sed, grep, etc.)

## Troubleshooting

### Check Docker Status

```bash
# Verify Docker is running
docker ps

# Pull required images
docker pull alpine:latest

# Test container execution
docker run --rm -v /tmp:/workspace -w /workspace alpine echo "Hello"
```

### Increase Resource Limits

If tasks fail with out-of-memory or timeout errors:

```bash
# Increase memory limit to 1 GB
DOCKER_MEMORY_LIMIT=1g node worker-agent.js

# Increase CPU limit to 4 cores
DOCKER_CPU_LIMIT=4.0 node worker-agent.js

# Increase timeout to 60 seconds
DOCKER_TIMEOUT=60000 node worker-agent.js
```

### View Running Containers

```bash
# See all running containers
docker ps

# Kill a specific container
docker kill <container-id>

# Cleanup all stopped containers
docker container prune -f
```

## Performance Tips

1. **Pre-pull Images**: Docker images are cached locally

   ```bash
   docker pull alpine:latest  # Downloaded once, reused always
   ```

2. **Optimize Scripts**: Keep execution time under 30 seconds
   - Move heavy computation to build phase
   - Use efficient algorithms
   - Minimize I/O operations

3. **Resource Sizing**: Match limits to typical task needs
   - Most tasks need < 256 MB (set to 512 MB for safety)
   - Most tasks use < 1 core (set to 2 cores for parallelism)

## Logging

Worker logs show execution context:

```
[2025-01-17T10:30:45.567Z] [INFO] Docker isolation: ENABLED (Secure)
[2025-01-17T10:30:45.678Z] [INFO] Execution context: Docker container (isolated)
```

Legacy mode logging (when disabled):

```
[2025-01-17T10:30:45.567Z] [INFO] Docker isolation: DISABLED (Legacy)
[2025-01-17T10:30:45.678Z] [WARN] Execution context: Host process (LEGACY MODE)
```

## Architecture

### Components

1. **DockerExecutor** (`worker-agent.js`)
   - Manages container lifecycle
   - Enforces isolation constraints
   - Handles timeouts and cleanup

2. **Docker Executor Module** (`src/lib/docker-executor.ts`)
   - TypeScript implementation
   - Supports multiple runtime types
   - Structured result returns

3. **Worker Agent Integration**
   - Transparent to existing code
   - Backward compatible fallback
   - Configurable per-worker

### Data Flow

```
Task from Server
    ↓
Download files
    ↓
Extract to temp dir
    ↓
Execute in Docker container  ← NEW ISOLATION HERE
    ↓
Capture output
    ↓
Cleanup resources
    ↓
Report results to server
```

## Security Model

### What's Protected

- ✓ **Host Filesystem**: Can't modify system files
- ✓ **Host Network**: Can't access external resources
- ✓ **Host Resources**: Can't exhaust CPU or memory
- ✓ **Privilege Escalation**: Capabilities dropped
- ✓ **Execution Runaway**: Hard timeout enforced

### What Runs Inside Container

Only the task command runs inside the container:

- Task files (read/write in /workspace)
- Standard utilities (sh, awk, etc.)
- No access to:
  - Other containers
  - Host kernel modules
  - System services
  - External networks

## Migration from Legacy Mode

### Before (Legacy - No Isolation)

```javascript
// Commands ran directly on host - NOT SAFE
child = spawn("bash", ["-c", command], { cwd });
// Risks: malicious code, resource exhaustion, network access
```

### After (Docker Sandboxed - SAFE)

```javascript
// Commands run in isolated container
const executor = new DockerExecutor();
const result = await executor.execute(command, workspaceDir);
// Safe: read-only FS, no network, CPU/memory limits, timeout
```

### Backward Compatibility

If you need legacy mode:

```bash
ENABLE_DOCKER=false node worker-agent.js
# Worker falls back to direct host execution
# Not recommended, but available for compatibility
```

## Next Steps

1. Ensure Docker is installed and running
2. Pre-pull images for faster startup
3. Configure resource limits for your workload
4. Start workers with Docker sandboxing enabled
5. Monitor logs to verify Docker execution
6. Gradually increase resource limits if needed

## Support

For issues:

1. Check [DOCKER_SANDBOX.md](./DOCKER_SANDBOX.md) for detailed documentation
2. Verify Docker installation: `docker ps`
3. Check worker logs for errors
4. Increase logging verbosity if needed
