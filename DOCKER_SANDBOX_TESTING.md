# Docker Sandbox Verification & Testing Guide

## Pre-Deployment Checklist

### Environment Verification

```bash
# 1. Verify Docker installation
docker --version
# Expected: Docker version 20.10+

# 2. Verify Docker daemon is running
docker ps
# Expected: Empty list or running containers

# 3. Verify Docker permissions (Linux)
groups $USER | grep docker
# Expected: docker group listed

# 4. If docker group missing, add it:
sudo usermod -aG docker $USER
newgrp docker
```

### Image Verification

```bash
# Check which images are available
docker images

# Pre-pull base images for faster startup
docker pull alpine:latest
docker pull node:22-alpine
docker pull python:3.11-slim
docker pull gcc:14-alpine
docker pull eclipse-temurin:21-alpine
docker pull mcr.microsoft.com/dotnet/runtime:8.0-alpine

# Verify each pulled successfully
docker images | grep -E "alpine|node|python|gcc|eclipse|dotnet"
```

## Unit Tests

### Test 1: Basic Container Isolation

```bash
# Verify read-only filesystem
docker run --rm --read-only alpine touch /test.txt
# Expected: FAIL with "Read-only file system"

# Verify network disabled
docker run --rm --network=none alpine ping -c 1 8.8.8.8
# Expected: FAIL (network unreachable)

# Verify writable /workspace
docker run --rm --read-only -v /tmp:/workspace:rw -w /workspace alpine \
  sh -c "echo test > file.txt && cat file.txt"
# Expected: SUCCESS (file created and read)
```

### Test 2: Resource Limits

```bash
# Test memory limit enforcement
docker run --rm --memory=512m alpine sh -c "python3 << 'EOF'
import array
try:
    # Try to allocate 600MB (exceeds 512MB limit)
    arr = array.array('I', [0] * (600 * 1024 * 1024 // 4))
except:
    print('Memory limit enforced')
EOF"
# Expected: Container killed due to OOM

# Test CPU limit
docker run --rm --cpus=1.0 alpine dd if=/dev/zero of=/dev/null count=1000000
# Expected: Single core CPU usage
```

### Test 3: Process Limit

```bash
# Test process limit (max 32)
docker run --rm --pids-limit=32 alpine sh -c \
  "for i in {1..50}; do sleep 100 & done; wait" || true
# Expected: Eventually fails (cannot fork)
```

### Test 4: Capability Dropping

```bash
# Verify capabilities are dropped
docker run --rm --cap-drop=ALL alpine sh -c \
  "ip link | head -5" || true
# Expected: FAIL (no network interface access)
```

### Test 5: Timeout Enforcement

```bash
# Create a container with 5 second timeout
docker run --rm alpine sleep 10 &
DOCKER_PID=$!

# Set timeout
sleep 5
docker kill $(docker ps -q --filter ancestor=alpine)

# Verify killed
wait $DOCKER_PID || echo "Process killed as expected"
```

## Integration Tests

### Test Suite: Complete Execution Pipeline

```bash
#!/bin/bash

set -e

echo "=== Docker Sandbox Integration Tests ==="

# Test directory
TEST_DIR=$(mktemp -d)
cd $TEST_DIR

# Test 1: Simple echo
echo "Test 1: Simple echo command"
docker run --rm --read-only -v $TEST_DIR:/workspace:rw -w /workspace alpine \
  echo "Hello Docker" > output.txt
grep "Hello Docker" output.txt && echo "✓ Test 1 passed"

# Test 2: File operations
echo "Test 2: File creation in /workspace"
docker run --rm --read-only -v $TEST_DIR:/workspace:rw -w /workspace alpine \
  sh -c "echo 'test content' > test.txt && cat test.txt" > output.txt
grep "test content" output.txt && echo "✓ Test 2 passed"

# Test 3: Multiple commands
echo "Test 3: Multiple commands piped"
docker run --rm --read-only -v $TEST_DIR:/workspace:rw -w /workspace alpine \
  sh -c "echo -e 'line1\nline2\nline3' | grep line2" > output.txt
grep "line2" output.txt && echo "✓ Test 3 passed"

# Test 4: Exit code preservation
echo "Test 4: Exit code preservation"
docker run --rm alpine sh -c "exit 42"
EXIT_CODE=$?
[ $EXIT_CODE -eq 42 ] && echo "✓ Test 4 passed" || echo "✗ Test 4 failed: got $EXIT_CODE"

# Test 5: stderr capture
echo "Test 5: stderr capture"
docker run --rm alpine sh -c "echo 'error' >&2" 2>&1 | grep "error" && echo "✓ Test 5 passed"

# Test 6: Resource limits
echo "Test 6: Memory limit (512m)"
docker run --rm --memory=512m alpine sh -c "free -m | grep Mem" | head -1

# Test 7: Timeout with sleep
echo "Test 7: Timeout handling"
timeout 5 docker run --rm alpine sleep 2 > /dev/null 2>&1
[ $? -eq 0 ] && echo "✓ Test 7 passed (sleep 2 within timeout)"

# Cleanup
cd /
rm -rf $TEST_DIR
echo "=== All integration tests completed ==="
```

## Worker Agent Tests

### Test 1: Docker Executor Class

```bash
# Start worker with Docker enabled
ENABLE_DOCKER=true node worker-agent.js --server http://localhost:3000 &
WORKER_PID=$!

# Verify in logs
sleep 2
grep "Docker isolation: ENABLED" /var/log/worker.log || echo "Check console output"

# Stop worker
kill $WORKER_PID
```

### Test 2: Task Execution with Docker

```bash
# 1. Start server
node src/app/api/execute &
SERVER_PID=$!

# 2. Start worker with Docker
ENABLE_DOCKER=true node worker-agent.js --server http://localhost:3000 &
WORKER_PID=$!

# 3. Create test job (via API or CLI)
# Task should execute in Docker container

# 4. Verify results
# Check logs: "Execution context: Docker container (isolated)"

# 5. Cleanup
kill $WORKER_PID $SERVER_PID
```

### Test 3: Fallback to Legacy Mode

```bash
# Start worker with Docker disabled
ENABLE_DOCKER=false node worker-agent.js --server http://localhost:3000 &
WORKER_PID=$!

# Verify in logs
sleep 2
grep "Docker isolation: DISABLED" /var/log/worker.log || echo "Check console output"

# Should see: "Execution context: Host process (LEGACY MODE)"

# Cleanup
kill $WORKER_PID
```

## Performance Tests

### Test 1: Container Startup Time

```bash
#!/bin/bash

echo "=== Container Startup Performance ==="

# Measure startup time
time docker run --rm alpine echo "test" > /dev/null

# Run 5 times and average
TOTAL_TIME=0
for i in {1..5}; do
  START=$(date +%s%N)
  docker run --rm alpine sleep 0.1 > /dev/null
  END=$(date +%s%N)
  ELAPSED=$(( ($END - $START) / 1000000 ))
  TOTAL_TIME=$(( $TOTAL_TIME + $ELAPSED ))
  echo "Run $i: ${ELAPSED}ms"
done

AVG=$(( $TOTAL_TIME / 5 ))
echo "Average startup time: ${AVG}ms"
```

### Test 2: Memory Overhead

```bash
#!/bin/bash

echo "=== Memory Overhead Per Container ==="

# Get base system memory
BEFORE=$(free -m | grep "^Mem" | awk '{print $3}')

# Start 10 containers
for i in {1..10}; do
  docker run -d --rm alpine sleep 100 > /dev/null
done

sleep 1

# Get memory after
AFTER=$(free -m | grep "^Mem" | awk '{print $3}')

# Calculate
OVERHEAD=$(( ($AFTER - $BEFORE) / 10 ))
echo "Memory overhead per container: ~${OVERHEAD}MB"

# Cleanup
docker kill $(docker ps -q) 2>/dev/null || true
```

### Test 3: CPU Efficiency

```bash
#!/bin/bash

echo "=== CPU Efficiency Test ==="

# Single threaded task
START=$(date +%s)
docker run --rm --cpus=1.0 alpine sh -c \
  "i=0; while [ \$i -lt 100000 ]; do i=\$((i+1)); done; echo done"
END=$(date +%s)
DURATION=$(( $END - $START ))
echo "CPU-limited task: ${DURATION}s"
```

## Isolation Verification

### Test 1: Filesystem Isolation

```bash
#!/bin/bash

echo "=== Filesystem Isolation Test ==="

# Create a test file on host
echo "host-file" > /tmp/host-test.txt

# Try to access from container
docker run --rm alpine ls /tmp/host-test.txt 2>&1 | grep -q "No such file"
[ $? -eq 0 ] && echo "✓ Filesystem isolated" || echo "✗ Filesystem not isolated"

# Cleanup
rm /tmp/host-test.txt
```

### Test 2: Network Isolation

```bash
#!/bin/bash

echo "=== Network Isolation Test ==="

# Try to reach external IP from container
docker run --rm --network=none alpine sh -c \
  "ping -c 1 1.1.1.1 2>&1" | grep -q "Network unreachable"
[ $? -eq 0 ] && echo "✓ Network isolated" || echo "✗ Network not isolated"

# Try to reach host
docker run --rm --network=none alpine sh -c \
  "ping -c 1 127.0.0.1 2>&1" | grep -q "Network unreachable"
[ $? -eq 0 ] && echo "✓ Host unreachable" || echo "✗ Host reachable"
```

### Test 3: Privilege Escalation Prevention

```bash
#!/bin/bash

echo "=== Privilege Escalation Test ==="

# Try to change file permissions (requires CAP_FOWNER)
docker run --rm --cap-drop=ALL alpine sh -c \
  "chmod 777 /etc/hosts 2>&1" | grep -q "Operation not permitted"
[ $? -eq 0 ] && echo "✓ Privilege escalation blocked" || echo "✗ Check failed"
```

## Debugging Tests

### Enable Verbose Logging

```bash
# Worker with verbose output
DEBUG=* node worker-agent.js --server http://localhost:3000

# Or set environment
ENABLE_DOCKER=true \
DOCKER_TIMEOUT=30000 \
DOCKER_MEMORY_LIMIT=512m \
DOCKER_CPU_LIMIT=2.0 \
node worker-agent.js
```

### Inspect Running Containers

```bash
# List all running Docker containers
docker ps

# Show container details
docker inspect <container-id>

# View container logs
docker logs <container-id>

# Execute command in running container (for debugging)
docker exec -it <container-id> sh
```

### Cleanup Test Artifacts

```bash
# Stop all containers
docker stop $(docker ps -q) 2>/dev/null || true

# Remove all stopped containers
docker container prune -f

# Remove dangling images
docker image prune -f

# Remove all images (full cleanup)
docker image prune -a -f
```

## Success Criteria Verification

- [ ] Docker is installed and running
- [ ] Base images are pre-pulled
- [ ] Worker starts with "Docker isolation: ENABLED"
- [ ] Tasks execute with "Execution context: Docker container"
- [ ] Container startup time < 1 second
- [ ] Memory overhead < 50MB per container
- [ ] Read-only filesystem is enforced
- [ ] Network is disabled in containers
- [ ] Timeout kills containers forcefully
- [ ] Resource limits are applied
- [ ] Containers auto-cleanup on exit
- [ ] Results are structured and consistent
- [ ] Fallback to legacy mode works
- [ ] No orphaned Docker resources

## Troubleshooting

### Docker Not Found

```bash
# Install Docker
# macOS: brew install docker
# Ubuntu: sudo apt-get install docker.io
# Windows: Download Docker Desktop

# Verify installation
docker --version
```

### Permission Denied

```bash
# Linux: add user to docker group
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

### Image Not Found

```bash
# Pull specific image
docker pull alpine:latest

# Or pre-pull all required images
bash DOCKER_SANDBOX_QUICKSTART.md  # See image pre-pull section
```

### Container Timeout Issues

```bash
# Increase timeout for slow tasks
DOCKER_TIMEOUT=60000 node worker-agent.js

# Or per-task in job definition
```

### Memory Limit Issues

```bash
# Increase memory for memory-intensive tasks
DOCKER_MEMORY_LIMIT=1g node worker-agent.js
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Docker Sandbox Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Verify Docker
        run: docker --version && docker ps

      - name: Pre-pull images
        run: docker pull alpine:latest

      - name: Run container tests
        run: bash test/docker-container-tests.sh

      - name: Start worker with Docker
        run: |
          ENABLE_DOCKER=true timeout 30 node worker-agent.js &
          sleep 5
          docker ps | grep -E "cmd-exec"
```

## Sign-Off

After all tests pass:

```bash
echo "✓ Docker container sandboxing verified"
echo "✓ Isolation confirmed (FS read-only, networking disabled)"
echo "✓ Resource limits enforced"
echo "✓ Timeout mechanism working"
echo "✓ Auto-cleanup functioning"
echo "✓ Production ready"
```
