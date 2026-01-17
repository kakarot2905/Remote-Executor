# Docker Container Sandbox - Technical Reference

## Complete Docker Run Command

### Full Command Structure

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

### Parameter Breakdown

#### Identification & Cleanup

| Argument | Purpose              | Value             |
| -------- | -------------------- | ----------------- |
| `--name` | Container identifier | `cmd-exec-{uuid}` |
| `--rm`   | Auto-remove on exit  | Required          |

#### Isolation & Security

| Argument                                | Purpose               | Value          |
| --------------------------------------- | --------------------- | -------------- |
| `--read-only`                           | Read-only root FS     | Always applied |
| `--cap-drop=ALL`                        | Drop all capabilities | Required       |
| `--security-opt=no-new-privileges:true` | Block setuid/setgid   | Required       |
| `--network=none`                        | Disable networking    | Required       |

#### Resource Management

| Argument        | Purpose       | Value         | Default      |
| --------------- | ------------- | ------------- | ------------ |
| `--memory`      | Memory limit  | 512m          | Configurable |
| `--cpus`        | CPU limit     | 2.0           | Configurable |
| `--memory-swap` | Swap limit    | -1 (disabled) | Fixed        |
| `--pids-limit`  | Max processes | 32            | Fixed        |

#### Volume Mounts

| Mount                    | Purpose         | Mode       | Size      |
| ------------------------ | --------------- | ---------- | --------- |
| `-v <dir>:/workspace:rw` | Task files      | Read-write | Unlimited |
| `--tmpfs=/run:size=10m`  | Runtime data    | Temp       | 10 MB     |
| `--tmpfs=/tmp:size=50m`  | Temporary files | Temp       | 50 MB     |

#### Working Context

| Argument | Purpose           | Value                |
| -------- | ----------------- | -------------------- |
| `-w`     | Working directory | `/workspace`         |
| Image    | Base runtime      | `alpine:latest`      |
| Command  | Execution         | `/bin/sh -c "<cmd>"` |

## Environment Variables (Worker Configuration)

### Timeout Configuration

```bash
# Default: 30 seconds
export DOCKER_TIMEOUT=30000

# Custom timeouts (in milliseconds)
export DOCKER_TIMEOUT=5000   # 5 seconds (aggressive)
export DOCKER_TIMEOUT=60000  # 60 seconds (lenient)
```

**Impact**: Containers exceeding timeout are forcefully killed with SIGKILL

### Memory Configuration

```bash
# Default: 512 MB per container
export DOCKER_MEMORY_LIMIT=512m

# Common values
export DOCKER_MEMORY_LIMIT=256m  # Lightweight
export DOCKER_MEMORY_LIMIT=1g    # Standard
export DOCKER_MEMORY_LIMIT=2g    # Heavy workloads
```

**Impact**: Containers exceeding limit are OOM-killed

### CPU Configuration

```bash
# Default: 2.0 CPU cores per container
export DOCKER_CPU_LIMIT=2.0

# Common values
export DOCKER_CPU_LIMIT=0.5  # Single thread throttled
export DOCKER_CPU_LIMIT=1.0  # Single core
export DOCKER_CPU_LIMIT=4.0  # Quad core
```

**Impact**: CPU time is throttled at cgroup level

### Enable/Disable

```bash
# Enable Docker (default)
export ENABLE_DOCKER=true
# or just omit this variable

# Disable Docker (legacy mode)
export ENABLE_DOCKER=false
```

## Image Registry

### Prebuilt Images

```dockerfile
# Node.js 22 (Alpine)
node:22-alpine
# - Size: ~200 MB
# - Includes: Node 22, npm, common utilities
# - Use for: JavaScript/Node.js execution

# Python 3.11 (Slim)
python:3.11-slim
# - Size: ~150 MB
# - Includes: Python 3.11, pip, build essentials
# - Use for: Python script execution

# GCC 14 (Alpine)
gcc:14-alpine
# - Size: ~300 MB
# - Includes: GCC 14, G++, Make, libc dev
# - Use for: C/C++ compilation and execution

# Eclipse Temurin 21 (Alpine)
eclipse-temurin:21-alpine
# - Size: ~250 MB
# - Includes: JDK 21, Java runtime
# - Use for: Java execution

# .NET 8 Runtime (Alpine)
mcr.microsoft.com/dotnet/runtime:8.0-alpine
# - Size: ~200 MB
# - Includes: .NET 8 runtime
# - Use for: .NET execution

# Alpine Linux (Minimal)
alpine:latest
# - Size: ~7 MB
# - Includes: Basic utilities, shell
# - Use for: General purpose, shell scripts
```

### Runtime Type to Image Mapping

```typescript
// From docker-executor.ts
const DOCKER_IMAGES = {
  node: "node:22-alpine",
  python: "python:3.11-slim",
  cpp: "gcc:14-alpine",
  java: "eclipse-temurin:21-alpine",
  dotnet: "mcr.microsoft.com/dotnet/runtime:8.0-alpine",
  bash: "alpine:latest",
};
```

## Execution Context

### Inside Container

**Available**:

- `/workspace` - Task files (read/write)
- `/tmp` - Temporary space (max 50 MB)
- `/run` - Runtime data (max 10 MB)
- Standard shell utilities (sh, sed, awk, etc.)
- Language runtimes (Node, Python, etc.)

**NOT Available**:

- Networking (DNS, external IPs)
- Host filesystem (read-only root)
- Host processes (container isolated)
- Privilege escalation (caps dropped)
- System configuration files
- Other containers

### Exit Codes

| Code  | Meaning           | Example                         |
| ----- | ----------------- | ------------------------------- |
| 0     | Success           | Command completed normally      |
| 1     | General error     | Syntax error, file not found    |
| 2     | Misuse of shell   | Missing variable                |
| 124   | Timeout           | Exceeded time limit             |
| 125   | Docker error      | Image not found, mount failed   |
| 126   | Permission denied | Command not executable          |
| 127   | Command not found | Binary missing in container     |
| 128+N | Signal exit       | Kill signal (N = signal number) |

## Resource Limits Explained

### Memory Limit (512 MB default)

```bash
# Hard limit per container
--memory=512m

# What happens at limit:
# 1. Container requests >512 MB RAM
# 2. OS kernel triggers OOM killer
# 3. Container process killed
# 4. Exit code: 137 (SIGKILL)
# 5. No graceful shutdown
```

**Tuning**:

- Increase for memory-intensive tasks
- Monitor actual usage: `docker stats`
- Allow headroom for runtime overhead

### CPU Limit (2.0 cores default)

```bash
# CPU throttle per container
--cpus=2.0

# What happens at limit:
# 1. Container trying to use >2 cores
# 2. CPU time is throttled by cgroup
# 3. Process slows down (not killed)
# 4. Can take longer to complete
```

**Tuning**:

- Increase for CPU-intensive tasks
- Decrease for resource sharing
- Single core: `--cpus=1.0`
- No limit: remove flag (not recommended)

### Process Limit (32 max)

```bash
# Maximum number of processes
--pids-limit=32

# What happens at limit:
# 1. Container has 32 processes running
# 2. fork() call fails
# 3. Applications can't spawn new processes
# 4. Can prevent fork bombs
```

**Tuning**:

- 32 is typically sufficient
- Increase only if needed
- Monitor with `ps` inside container

### Swap Disabled

```bash
# No swap for this container
--memory-swap=-1

# Meaning:
# - Containers limited to physical RAM only
# - No spilling to disk
# - Prevents slowdown from swap thrashing
# - Guarantees performance predictability
```

**Why disabled**:

- Swap degrades performance
- Makes resource limits meaningless
- Creates unpredictable latency

## Security Architecture

### Defense Layers

```
┌─────────────────────────────────────┐
│ Layer 1: Filesystem Isolation       │
│ - Read-only root filesystem         │
│ - Limited writable areas (/workspace)
│ - Size limits on /tmp, /run         │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ Layer 2: Network Isolation          │
│ - Network stack disabled            │
│ - No DNS resolution                 │
│ - No communication with outside     │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ Layer 3: Privilege Isolation        │
│ - All capabilities dropped          │
│ - No privilege escalation           │
│ - Never privileged mode             │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ Layer 4: Resource Isolation         │
│ - CPU throttled (2.0 cores)        │
│ - Memory limited (512 MB)          │
│ - Processes limited (32 max)       │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ Layer 5: Timeout Protection         │
│ - Hard 30 second timeout           │
│ - Forceful container kill          │
│ - No resource leaks                │
└─────────────────────────────────────┘
```

### Linux Capabilities

Dropped capabilities (none available):

```
cap_chown           # Can't change file ownership
cap_dac_override     # Can't bypass permission checks
cap_setfcap          # Can't set file capabilities
cap_setuid           # Can't change UID (privilege escalation)
cap_setgid           # Can't change GID
cap_sys_ptrace       # Can't debug other processes
cap_net_bind_service # Can't bind to ports
cap_net_raw          # Can't send raw packets
cap_all_others...    # All 40+ capabilities dropped
```

## Data Flow

### Input

```
┌─────────────────┐
│ Task Received   │
│ (files + cmd)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Create Temp Workspace       │
│ /tmp/docker-task-{uuid}     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Extract Task Files          │
│ Into /workspace mount       │
└────────┬────────────────────┘
```

### Execution

```
┌─────────────────────────────┐
│ Build Docker Run Args       │
│ (all isolation settings)    │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Spawn Container             │
│ /bin/sh -c <command>        │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Capture Streams             │
│ stdout, stderr, exit code   │
└────────┬────────────────────┘
```

### Output

```
┌─────────────────────────────┐
│ Container Exits/Times Out   │
│ Auto-cleanup (--rm)         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Cleanup Workspace Directory │
│ Remove /tmp/docker-task-*   │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Return ExecutionResult      │
│ {stdout, stderr, exitCode}  │
└─────────────────────────────┘
```

## Performance Optimization

### Container Startup Time

```
Cold start (first run):       ~1-2 seconds
  - Image pull (if needed):   500-1000 ms
  - Container start:          200-500 ms
  - Command execution:        Variable

Warm start (cached image):    ~200-500 ms
  - Image cached:             0 ms
  - Container start:          200-300 ms
  - Command execution:        Variable

Multiple containers:          Linear with count
  - N containers:             N × 300ms (typical)
```

### Memory Efficiency

```
Alpine base:                  ~15-20 MB
Node image overhead:          ~150 MB
Python image overhead:        ~120 MB
Runtime object:               ~5 MB

Total per task:               ~520 MB (with 512 MB limit)
```

### CPU Efficiency

```
Container scheduling:         <1% overhead
Cgroup enforcement:           <1% overhead
Total infrastructure:         ~1-2% CPU

Available for workload:       ~98-99% CPU
```

## Docker Commands for Administration

### Image Management

```bash
# List all images
docker images

# Pull specific image
docker pull <image>

# Remove image
docker rmi <image>

# Remove dangling images
docker image prune

# View image history
docker history <image>
```

### Container Management

```bash
# List running containers
docker ps

# List all containers
docker ps -a

# Stop container
docker stop <container>

# Kill container
docker kill <container>

# Remove stopped container
docker rm <container>

# Remove all stopped containers
docker container prune
```

### Inspection & Debugging

```bash
# Inspect container details
docker inspect <container>

# View container logs
docker logs <container>

# Execute command in container
docker exec -it <container> sh

# View resource usage
docker stats <container>

# View processes in container
docker top <container>
```

### Cleanup & Maintenance

```bash
# Remove all stopped containers
docker container prune -f

# Remove all dangling images
docker image prune -f

# Remove all unused images
docker image prune -a

# Remove all unused resources
docker system prune -a

# View disk usage
docker system df
```

## Troubleshooting Commands

### Check Docker Status

```bash
# Verify Docker daemon
sudo systemctl status docker

# View Docker logs (Linux)
sudo journalctl -u docker -n 50

# Verify permissions
groups $USER

# Test Docker functionality
docker run --rm alpine echo "test"
```

### Debug Container Issues

```bash
# Keep container alive for debugging
docker run -it --name debug alpine sh
# then: docker exec -it debug sh

# View logs
docker logs <container>

# Inspect exit code
docker inspect <container> | grep ExitCode

# Check resource usage during run
docker stats --no-stream <container>

# View mounted volumes
docker inspect -f "{{json .Mounts}}" <container>
```

### Performance Analysis

```bash
# Measure container startup time
time docker run --rm alpine echo test

# Profile CPU usage
docker run --cpuset-cpus 0,1 <image>

# Profile memory usage
docker run --memory-swap=<limit> <image>

# Network inspection
docker network inspect bridge
```

## Production Checklist

- [ ] Docker installed and verified
- [ ] Base images pre-pulled
- [ ] Worker can reach Docker daemon
- [ ] Resource limits configured appropriately
- [ ] Timeout value suitable for workloads
- [ ] Logging enabled and monitored
- [ ] Cleanup processes verified working
- [ ] Fallback mode available if needed
- [ ] Performance baseline established
- [ ] Security model understood
- [ ] Documentation accessible
- [ ] Runbooks prepared for operators
