# Docker Container Sandboxing Implementation

## Overview

This document describes the isolated task execution system using Docker containers. Every received task now executes inside a short-lived, sandboxed Docker container with strict isolation guarantees.

## Architecture

### Isolation Guarantees

Each task execution container provides:

1. **Read-Only Root Filesystem**
   - Root filesystem is mounted as read-only
   - Only `/workspace`, `/run`, and `/tmp` are writable
   - Prevents container from modifying system files or binaries

2. **No Networking**
   - Containers run with `--network=none`
   - No access to host network or other containers
   - DNS and external communication blocked

3. **Resource Limits**
   - Memory: Limited to 512 MB by default (configurable)
   - CPU: Limited to 2.0 cores by default (configurable)
   - Swap: Disabled (`--memory-swap=-1`)
   - Max processes: 32 (`--pids-limit=32`)

4. **Security Constraints**
   - All Linux capabilities dropped (`--cap-drop=ALL`)
   - No privilege escalation (`--security-opt=no-new-privileges:true`)
   - Never run in privileged mode
   - No device access (no `--device` flags)

5. **Hard Timeout Enforcement**
   - Default timeout: 30 seconds
   - Container forcefully killed if timeout exceeded
   - Exit code 124 for timeout scenarios

### Execution Flow

```
Task Received
    ↓
Create temp workspace directory
    ↓
Extract/prepare files
    ↓
Build Docker run arguments
    ↓
Spawn Docker container with full isolation
    ↓
Capture stdout/stderr streams
    ↓
Monitor for timeout
    ↓
Container exits or timeout occurs
    ↓
Cleanup workspace directory
    ↓
Return structured result (stdout, stderr, exitCode)
```

## Configuration

### Environment Variables

```bash
# Enable/disable Docker isolation (default: true)
ENABLE_DOCKER=true

# Container timeout in milliseconds (default: 30000 = 30 seconds)
DOCKER_TIMEOUT=30000

# Memory limit per container (default: 512m)
DOCKER_MEMORY_LIMIT=512m

# CPU limit per container (default: 2.0)
DOCKER_CPU_LIMIT=2.0
```

### Docker Image Selection

The system supports multiple prebuilt images based on runtime type:

| Runtime  | Docker Image                                  | Use Case                         |
| -------- | --------------------------------------------- | -------------------------------- |
| `node`   | `node:22-alpine`                              | JavaScript/Node.js execution     |
| `python` | `python:3.11-slim`                            | Python script execution          |
| `cpp`    | `gcc:14-alpine`                               | C++ compilation and execution    |
| `java`   | `eclipse-temurin:21-alpine`                   | Java execution                   |
| `dotnet` | `mcr.microsoft.com/dotnet/runtime:8.0-alpine` | .NET execution                   |
| `bash`   | `alpine:latest`                               | General shell commands (default) |

## Implementation Details

### Worker Agent Integration

The worker agent (`worker-agent.js`) now includes:

1. **DockerExecutor Class**
   - Manages container lifecycle
   - Enforces isolation constraints
   - Handles timeout and resource limits
   - Manages cleanup

2. **Dual Execution Modes**
   - `executeCommandDocker()`: Secure Docker execution (recommended)
   - `executeCommandDirect()`: Legacy host execution (fallback, not recommended)

3. **Configuration Control**
   - Docker execution enabled by default
   - Can disable via `ENABLE_DOCKER=false` for legacy compatibility

### TypeScript Docker Executor Module

File: `src/lib/docker-executor.ts`

Provides:

- `DockerExecutor` class for container management
- `RuntimeType` enum for runtime selection
- Structured `ExecutionResult` interface
- Static utility methods for image management

```typescript
// Example usage
const executor = new DockerExecutor({
  timeout: 30000,
  memoryLimit: "512m",
  cpuLimit: "2.0",
});

const result = await executor.executeInContainer("echo 'Hello World'", "bash");
```

## Security Model

### Attack Scenarios Mitigated

1. **Filesystem Attacks**
   - ✓ Read-only root filesystem prevents modification of system files
   - ✓ Temp directories limited in size (10 MB `/run`, 50 MB `/tmp`)

2. **Network Attacks**
   - ✓ Network disabled prevents external connections
   - ✓ No DNS access, no communication with other hosts

3. **Resource Exhaustion**
   - ✓ Memory capped at 512 MB per container
   - ✓ CPU throttled to 2.0 cores
   - ✓ Process limit (32 max) prevents fork bombs

4. **Privilege Escalation**
   - ✓ All capabilities dropped
   - ✓ No privilege escalation allowed
   - ✓ Never run as privileged

5. **Timeout/Hanging**
   - ✓ Hard 30-second timeout enforced
   - ✓ Forceful container kill on timeout
   - ✓ Clean resource cleanup

### Non-Goals

The following are NOT implemented (out of scope):

- VM-based isolation (too heavyweight)
- Seccomp filters (simple sandbox sufficient for use case)
- GPU access (not required)
- USB/device passthrough (not required)
- Long-running containers (not supported)
- Container persistence (containers are ephemeral)

## Docker Container Arguments

Each container is started with these security arguments:

```bash
docker run \
  --name <unique-container-id> \
  --rm \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --network=none \
  --memory=512m \
  --cpus=2.0 \
  --memory-swap=-1 \
  --pids-limit=32 \
  -v <workspace>:/workspace:rw \
  --tmpfs=/run:size=10m \
  --tmpfs=/tmp:size=50m \
  -w /workspace \
  <image-name> \
  /bin/sh -c "<command>"
```

## Execution Results

All executions return a structured `ExecutionResult`:

```typescript
interface ExecutionResult {
  success: boolean; // exitCode === 0
  stdout: string; // Combined stdout output
  stderr: string; // Combined stderr output
  exitCode: number; // Container exit code
  executionTime: number; // Milliseconds elapsed
  timedOut: boolean; // Whether timeout occurred
  error?: string; // Error message if failed
}
```

## Logging and Monitoring

Worker logs now include:

- `[INFO]` Execution context (Docker or host)
- `[SUCCESS]` Container startup and execution success
- `[WARN]` Timeout events, legacy mode usage
- `[ERROR]` Docker unavailable, setup failures

Example log output:

```
[2025-01-17T10:30:45.123Z] [INFO] Executing job job-123
[2025-01-17T10:30:45.234Z] [SUCCESS] File downloaded
[2025-01-17T10:30:45.345Z] [SUCCESS] Extraction complete
[2025-01-17T10:30:45.456Z] [INFO] Running: npm test
[2025-01-17T10:30:45.567Z] [INFO] Execution context: Docker container (isolated, read-only FS, no networking)
[2025-01-17T10:30:48.123Z] [SUCCESS] Job completed successfully
```

## Maintenance Operations

### Pre-pulling Images

Before running workers, pre-pull required Docker images:

```bash
docker pull node:22-alpine
docker pull python:3.11-slim
docker pull gcc:14-alpine
docker pull eclipse-temurin:21-alpine
docker pull mcr.microsoft.com/dotnet/runtime:8.0-alpine
docker pull alpine:latest
```

### Cleanup Dangling Resources

```bash
# Remove stopped containers
docker container prune -f

# Remove dangling images
docker image prune -f
```

## Performance Characteristics

### Container Startup Time

- Typical: 200-500 ms per container
- Alpine base images used for minimal overhead

### Memory Overhead

- Alpine base: ~5-20 MB per container
- Total per container with limit: 512 MB

### Network Overhead

- No network overhead (network disabled)
- All communication is local container I/O

## Troubleshooting

### Docker Not Available

**Error**: `Docker is not installed or not available in PATH`

**Solution**:

1. Verify Docker is installed: `docker --version`
2. Verify Docker daemon is running
3. Verify user has Docker permissions: `docker ps`
4. On Linux, add user to docker group: `sudo usermod -aG docker $USER`

### Image Not Found

**Error**: `Failed to pull Docker image <image>`

**Solution**:

1. Verify internet connection
2. Check Docker can reach registry: `docker pull <image>`
3. Pre-pull images: `docker pull node:22-alpine`

### Container Timeout

**Error**: `[TIMEOUT] Container exceeded 30000ms timeout and was killed`

**Solution**:

1. Increase `DOCKER_TIMEOUT` if command legitimately needs more time
2. Optimize the command to run faster
3. Check for infinite loops or blocking operations

### Resource Limit Exceeded

**Error**: Container exits with no output

**Solution**:

1. Increase `DOCKER_MEMORY_LIMIT` if command uses more RAM
2. Optimize command to use less memory
3. Check for memory leaks in scripts

## Future Enhancements

Possible improvements (not implemented):

1. **Runtime Selection by File Type**
   - Auto-detect Python vs Node.js vs C++ files
   - Select appropriate Docker image automatically

2. **Per-Job Configuration**
   - Allow jobs to specify timeout, memory, CPU limits
   - Support for custom Docker images per job

3. **Container Pooling**
   - Warm pool of containers for faster startup
   - Reuse containers for similar workloads

4. **Observability**
   - Container metrics collection
   - Resource usage tracking
   - Performance analytics

5. **Advanced Networking**
   - Optional network access for specific jobs
   - Network rate limiting
   - DNS filtering

## References

- [Docker Run Security](https://docs.docker.com/engine/reference/commandline/run/#security-configuration)
- [Alpine Linux](https://alpinelinux.org/)
- [Linux Capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- [cgroups v2](https://docs.kernel.org/admin-guide/cgroups-v2.html)
