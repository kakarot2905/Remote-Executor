# Phase 2 Quick Reference Card

## Start the System (3 Commands)

```bash
# Terminal 1: Start Server
npm run dev

# Terminal 2: Start Worker
node worker-agent.js --server http://localhost:3000

# Terminal 3: Use Web UI
# Open: http://localhost:3000
# Select "Distributed" mode, upload ZIP, enter commands, click Execute
```

## Core APIs

| Method | Endpoint                     | Purpose          |
| ------ | ---------------------------- | ---------------- |
| POST   | `/api/workers/register`      | Worker registers |
| POST   | `/api/workers/heartbeat`     | Worker heartbeat |
| GET    | `/api/workers/register`      | List workers     |
| POST   | `/api/jobs/create`           | Create job       |
| GET    | `/api/jobs/get-job`          | Get next job     |
| GET    | `/api/jobs/status?jobId=...` | Check status     |
| POST   | `/api/jobs/submit-result`    | Submit results   |
| PUT    | `/api/jobs/submit-result`    | Report failure   |
| GET    | `/api/jobs/create`           | List jobs        |

## Worker Agent Commands

```bash
# Start worker
node worker-agent.js

# Custom server
node worker-agent.js --server http://example.com:3000

# Custom worker ID
WORKER_ID=my-worker node worker-agent.js

# Environment variables
WORKER_ID=worker-1 HOSTNAME=my-pc node worker-agent.js
```

## Quick Testing

```bash
# Check workers
curl http://localhost:3000/api/workers/register | jq

# Check jobs
curl http://localhost:3000/api/jobs/create | jq

# Check specific job
curl "http://localhost:3000/api/jobs/status?jobId=job-..." | jq

# Get job output
curl "http://localhost:3000/api/jobs/status?jobId=job-..." | jq .stdout
```

## Files to Know

| File                                       | Purpose           |
| ------------------------------------------ | ----------------- |
| `src/app/api/workers/register/route.ts`    | Worker registry   |
| `src/app/api/workers/heartbeat/route.ts`   | Heartbeat handler |
| `src/app/api/jobs/create/route.ts`         | Job creation      |
| `src/app/api/jobs/get-job/route.ts`        | Job assignment    |
| `src/app/api/jobs/status/route.ts`         | Status checking   |
| `src/app/api/jobs/submit-result/route.ts`  | Result handling   |
| `worker-agent.js`                          | Worker process    |
| `src/app/components/TerminalInterface.tsx` | Web UI            |

## Job Lifecycle

```
PENDING       RUNNING       COMPLETED
   ↓            ↓              ↓
[Pending] → [Running] → [Completed] → [Display Results]
             ↓
          [Failed]
```

## Key Configuration

```javascript
// In worker-agent.js
const HEARTBEAT_INTERVAL = 10000; // Worker heartbeat (ms)
const JOB_POLL_INTERVAL = 5000; // Job polling (ms)

// In API routes
const heartbeatTimeout = 30000; // Worker offline timeout (ms)

// In TerminalInterface.tsx
const pollInterval = 500; // Status polling (ms)
const maxPollAttempts = 600; // Max polling attempts
```

## Troubleshooting

| Problem              | Solution                                              |
| -------------------- | ----------------------------------------------------- |
| Worker won't connect | Check server is running: `curl http://localhost:3000` |
| Jobs stay pending    | Ensure worker is running and polling                  |
| Results not showing  | Check `/api/jobs/status` for job details              |
| Worker crashes       | Check logs for error, restart worker                  |
| High latency         | Check file size and network speed                     |

## Performance Targets

| Operation         | Typical Time |
| ----------------- | ------------ |
| Register worker   | < 1ms        |
| Heartbeat         | < 1ms        |
| Create job        | < 5ms        |
| Get next job      | < 2ms        |
| Check status      | < 1ms        |
| Submit result     | < 2ms        |
| File download     | 1-10s        |
| Command execution | Variable     |

## Sample cURL Requests

### Register Worker

```bash
curl -X POST http://localhost:3000/api/workers/register \
  -H "Content-Type: application/json" \
  -d '{"workerId":"w-1","hostname":"pc-1","cpuCount":4}'
```

### Create Job

```bash
curl -X POST http://localhost:3000/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "command":"npm install",
    "fileUrl":"/uploads/test.zip",
    "filename":"test.zip"
  }'
```

### Check Status

```bash
curl "http://localhost:3000/api/jobs/status?jobId=job-1705329400000-abc123" \
  | jq '.{status,stdout,exitCode}'
```

## Documentation Files

| File                      | Contains                      |
| ------------------------- | ----------------------------- |
| `PHASE_2_README.md`       | Architecture, design, setup   |
| `IMPLEMENTATION_GUIDE.md` | Code structure, customization |
| `API_REFERENCE.md`        | Complete API documentation    |
| `DEPLOYMENT_SUMMARY.md`   | Overview and quick start      |
| `CHECKLIST.md`            | Implementation completeness   |
| `QUICK_REFERENCE.md`      | This file                     |

## Web UI Usage

1. Open http://localhost:3000
2. Select execution mode:
   - **Distributed** (Phase 2) - Execute on worker
   - **Direct** (Phase 1) - Execute on server
3. Upload ZIP file
4. Enter commands (one per line)
5. Click "Execute"
6. Watch results appear

## Common Commands

```bash
# Start everything at once (in different windows)
npm run dev & node worker-agent.js

# Run demo
npm run quickstart

# Create test ZIP
zip -r myproject.zip myproject/

# Test with curl
curl -X POST http://localhost:3000/api/execute \
  -F "file=@project.zip" \
  -F "commands=npm install" \
  -F "mode=distributed"
```

## Worker Agent Output Example

```
[2024-01-15T12:00:00.000Z] [INFO] Starting worker worker-abc123
[2024-01-15T12:00:00.001Z] [INFO] Server: http://localhost:3000
[2024-01-15T12:00:00.500Z] [SUCCESS] Worker registered successfully
[2024-01-15T12:00:00.501Z] [SUCCESS] Worker ready. Waiting for jobs...
[2024-01-15T12:00:05.000Z] [INFO] Executing job job-xyz789
[2024-01-15T12:00:05.100Z] [INFO] Downloading file...
[2024-01-15T12:00:05.500Z] [SUCCESS] File downloaded
[2024-01-15T12:00:05.600Z] [INFO] Running: npm install
[2024-01-15T12:00:15.000Z] [SUCCESS] Job completed with exit code 0
```

## Status Codes

| Code | Meaning     | Action                            |
| ---- | ----------- | --------------------------------- |
| 200  | OK          | Success                           |
| 202  | Accepted    | Try again later (no jobs/workers) |
| 400  | Bad Request | Check parameters                  |
| 403  | Forbidden   | Worker not authorized             |
| 404  | Not Found   | Resource doesn't exist            |
| 500  | Error       | Check server logs                 |

## Security Notes (Phase 3)

Current Phase 2 assumes trusted environments:

- ✅ Works behind firewalls (polling model)
- ⚠️ No authentication (add in Phase 3)
- ⚠️ No encryption (add HTTPS in Phase 3)
- ⚠️ No job sandboxing (add containers in Phase 3)

## Next Steps

1. **Test with multiple workers** - Verify load balancing
2. **Monitor logs** - Understand system behavior
3. **Plan Phase 3** - Database, auth, clustering
4. **Document modifications** - For your environment

## Support Resources

- **API Details**: `API_REFERENCE.md`
- **Architecture**: `PHASE_2_README.md`
- **Code Details**: `IMPLEMENTATION_GUIDE.md`
- **Issues**: Check logs and `IMPLEMENTATION_GUIDE.md` troubleshooting

---

**Everything you need to run Phase 2 on one page!**
