# Phase 2 API Reference

Complete API documentation for the Distributed Command Executor system.

## Base URL

```
http://localhost:3000
```

## Authentication

Currently no authentication required. Phase 3 will add API key/token validation.

## Common Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {}
}
```

### Error Response (4xx/5xx)

```json
{
  "error": "Error description",
  "statusCode": 400
}
```

---

## Worker APIs

### 1. Register Worker

Register a new worker node with the central server.

**Endpoint:** `POST /api/workers/register`

**Request Headers:**

```
Content-Type: application/json
```

**Request Body:**

```json
{
  "workerId": "worker-abc123",
  "hostname": "pc-1",
  "os": "win32",
  "cpuCount": 4,
  "version": "1.0.0"
}
```

**Parameters:**

- `workerId` (string, required): Unique worker identifier
- `hostname` (string, required): Machine hostname
- `os` (string, optional): Operating system (win32, linux, darwin)
- `cpuCount` (number, optional): Number of CPU cores
- `version` (string, optional): Worker agent version

**Response (200 OK):**

```json
{
  "success": true,
  "workerId": "worker-abc123",
  "message": "Worker worker-abc123 registered successfully"
}
```

**Response (400 Bad Request):**

```json
{
  "error": "workerId and hostname are required"
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/workers/register \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": "worker-abc123",
    "hostname": "my-pc",
    "os": "win32",
    "cpuCount": 4,
    "version": "1.0.0"
  }'
```

---

### 2. Worker Heartbeat

Send periodic heartbeat to update last-seen timestamp.

**Endpoint:** `POST /api/workers/heartbeat`

**Request Headers:**

```
Content-Type: application/json
```

**Request Body:**

```json
{
  "workerId": "worker-abc123"
}
```

**Parameters:**

- `workerId` (string, required): Worker ID

**Response (200 OK):**

```json
{
  "success": true,
  "workerId": "worker-abc123",
  "timestamp": 1705329400000
}
```

**Response (404 Not Found):**

```json
{
  "error": "Worker not found"
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/workers/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"workerId": "worker-abc123"}'
```

**Notes:**

- Server expects heartbeats every ~10 seconds
- Workers not sending heartbeat for 30+ seconds are marked as offline
- Heartbeat is sent by the worker agent automatically

---

### 3. List All Workers

Get list of all registered workers and their status.

**Endpoint:** `GET /api/workers/register`

**Response (200 OK):**

```json
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
    },
    {
      "workerId": "worker-def456",
      "hostname": "pc-2",
      "os": "linux",
      "cpuCount": 8,
      "status": "busy",
      "lastHeartbeat": 1705329395000,
      "version": "1.0.0"
    }
  ],
  "count": 2
}
```

**Worker Status Values:**

- `idle` - Ready to accept jobs
- `busy` - Currently executing a job
- `offline` - No heartbeat for 30+ seconds

**Example:**

```bash
curl http://localhost:3000/api/workers/register | jq
```

---

## Job APIs

### 4. Create Job

Create a new job for remote execution.

**Endpoint:** `POST /api/jobs/create`

**Request Headers:**

```
Content-Type: application/json
```

**Request Body:**

```json
{
  "command": "npm install && npm test",
  "fileUrl": "/uploads/project-123456.zip",
  "filename": "project.zip"
}
```

**Parameters:**

- `command` (string, required): Commands to execute (newline-separated)
- `fileUrl` (string, required): URL to download ZIP file from
- `filename` (string, required): Original filename for reference

**Response (200 OK):**

```json
{
  "success": true,
  "jobId": "job-1705329400000-abc123",
  "message": "Job created successfully"
}
```

**Response (400 Bad Request):**

```json
{
  "error": "command, fileUrl, and filename are required"
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npm install\nnpm test",
    "fileUrl": "/uploads/project-123456.zip",
    "filename": "project.zip"
  }'
```

**Notes:**

- Commands are executed in the order provided
- File must be accessible from worker via fileUrl
- Job ID is returned and used for status polling

---

### 5. Get Next Job (Worker)

Poll for the next available job to execute.

**Endpoint:** `GET /api/jobs/get-job`

**Response (200 OK) - Job Available:**

```json
{
  "success": true,
  "job": {
    "jobId": "job-1705329400000-abc123",
    "command": "npm install && npm test",
    "fileUrl": "/uploads/project-123456.zip",
    "filename": "project.zip"
  }
}
```

**Response (202 Accepted) - No Jobs Available:**

```json
{
  "success": false,
  "message": "No idle workers available",
  "job": null
}
```

**Response Logic:**

1. Find first idle worker
2. If no idle workers → return 202
3. Find first pending job
4. If no pending jobs → return 202
5. Assign job to worker
6. Update job status to "running"
7. Return 200 with job details

**Example:**

```bash
curl http://localhost:3000/api/jobs/get-job
```

**Notes:**

- This is called by worker every 5 seconds
- Only one job returned at a time
- Server automatically updates worker status to "busy"
- Once assigned, job status becomes "running"

---

### 6. Check Job Status

Get current status and results of a job.

**Endpoint:** `GET /api/jobs/status`

**Query Parameters:**

- `jobId` (string, required): Job ID to check

**Response (200 OK) - Pending:**

```json
{
  "jobId": "job-1705329400000-abc123",
  "status": "pending",
  "workerId": null,
  "command": "npm install && npm test",
  "filename": "project.zip",
  "stdout": "",
  "stderr": "",
  "exitCode": null,
  "errorMessage": null,
  "createdAt": 1705329400000,
  "startedAt": null,
  "completedAt": null
}
```

**Response (200 OK) - Running:**

```json
{
  "jobId": "job-1705329400000-abc123",
  "status": "running",
  "workerId": "worker-abc123",
  "command": "npm install && npm test",
  "filename": "project.zip",
  "stdout": "",
  "stderr": "",
  "exitCode": null,
  "errorMessage": null,
  "createdAt": 1705329400000,
  "startedAt": 1705329402000,
  "completedAt": null
}
```

**Response (200 OK) - Completed:**

```json
{
  "jobId": "job-1705329400000-abc123",
  "status": "completed",
  "workerId": "worker-abc123",
  "command": "npm install && npm test",
  "filename": "project.zip",
  "stdout": "added 100 packages...\n✓ All tests passed",
  "stderr": "",
  "exitCode": 0,
  "errorMessage": null,
  "createdAt": 1705329400000,
  "startedAt": 1705329402000,
  "completedAt": 1705329425000
}
```

**Response (404 Not Found):**

```json
{
  "error": "Job not found"
}
```

**Status Values:**

- `pending` - Waiting for idle worker
- `running` - Assigned to worker, executing
- `completed` - Execution finished successfully
- `failed` - Execution failed or worker crashed

**Example:**

```bash
curl "http://localhost:3000/api/jobs/status?jobId=job-1705329400000-abc123"
```

**Notes:**

- Poll this endpoint to monitor job progress
- stdout/stderr are empty until job completes
- Timestamps in milliseconds since epoch

---

### 7. Submit Job Result

Submit completed job results (called by worker).

**Endpoint:** `POST /api/jobs/submit-result`

**Request Headers:**

```
Content-Type: application/json
```

**Request Body:**

```json
{
  "jobId": "job-1705329400000-abc123",
  "workerId": "worker-abc123",
  "stdout": "Command output here...",
  "stderr": "Any errors here...",
  "exitCode": 0
}
```

**Parameters:**

- `jobId` (string, required): Job ID
- `workerId` (string, required): Worker that executed the job
- `stdout` (string, optional): Standard output from commands
- `stderr` (string, optional): Standard error output
- `exitCode` (number, required): Process exit code

**Response (200 OK):**

```json
{
  "success": true,
  "jobId": "job-1705329400000-abc123",
  "message": "Job result submitted successfully"
}
```

**Response (403 Forbidden):**

```json
{
  "error": "Worker is not assigned to this job"
}
```

**Response (404 Not Found):**

```json
{
  "error": "Job not found"
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/jobs/submit-result \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "job-1705329400000-abc123",
    "workerId": "worker-abc123",
    "stdout": "Test results...",
    "stderr": "",
    "exitCode": 0
  }'
```

**Side Effects:**

- Job status updated to "completed"
- Worker status updated to "idle"
- Results stored for retrieval
- Timestamps recorded

---

### 8. Report Job Failure

Report a job failure (called by worker on error).

**Endpoint:** `PUT /api/jobs/submit-result`

**Request Headers:**

```
Content-Type: application/json
```

**Request Body:**

```json
{
  "jobId": "job-1705329400000-abc123",
  "workerId": "worker-abc123",
  "errorMessage": "File download failed"
}
```

**Parameters:**

- `jobId` (string, required): Job ID
- `workerId` (string, required): Worker that was executing the job
- `errorMessage` (string, optional): Error description

**Response (200 OK):**

```json
{
  "success": true,
  "jobId": "job-1705329400000-abc123",
  "message": "Job failure recorded successfully"
}
```

**Example:**

```bash
curl -X PUT http://localhost:3000/api/jobs/submit-result \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "job-1705329400000-abc123",
    "workerId": "worker-abc123",
    "errorMessage": "Network timeout"
  }'
```

**Side Effects:**

- Job status updated to "failed"
- Error message stored
- Worker status updated to "idle"
- Completion timestamp recorded

---

### 9. List All Jobs

Get list of all jobs and their status.

**Endpoint:** `GET /api/jobs/create`

**Response (200 OK):**

```json
{
  "jobs": [
    {
      "jobId": "job-1705329400000-abc123",
      "status": "completed",
      "workerId": "worker-abc123",
      "command": "npm install && npm test",
      "filename": "project.zip",
      "stdout": "...",
      "stderr": "",
      "exitCode": 0,
      "errorMessage": null,
      "createdAt": 1705329400000,
      "startedAt": 1705329402000,
      "completedAt": 1705329425000
    },
    {
      "jobId": "job-1705329450000-def456",
      "status": "running",
      "workerId": "worker-def456",
      "command": "npm install",
      "filename": "another-project.zip",
      "stdout": "",
      "stderr": "",
      "exitCode": null,
      "errorMessage": null,
      "createdAt": 1705329450000,
      "startedAt": 1705329452000,
      "completedAt": null
    }
  ],
  "count": 2
}
```

**Example:**

```bash
curl http://localhost:3000/api/jobs/create | jq
```

**Notes:**

- Returns all jobs in registry
- For large deployments, consider pagination in Phase 3

---

## Execute API (Phase 2 Enhanced)

### 10. Execute Commands

Create and execute commands. Supports both direct (Phase 1) and distributed (Phase 2) modes.

**Endpoint:** `POST /api/execute`

**Request Headers:**

```
Content-Type: multipart/form-data
```

**Request Body (Form Data):**

```
file: <binary zip file>
commands: <newline-separated commands>
mode: "distributed" or "direct"
```

**Parameters:**

- `file` (binary, required): ZIP file containing project
- `commands` (string, required): Commands to execute
- `mode` (string, optional): Execution mode
  - `"distributed"` - Execute on worker (Phase 2)
  - `"direct"` - Execute on server (Phase 1, default for backward compatibility)

**Response (200 OK) - Distributed Mode:**

```json
{
  "success": true,
  "jobId": "job-1705329400000-abc123",
  "mode": "distributed",
  "message": "Job created. Waiting for idle worker to pick it up.",
  "checkStatusUrl": "/api/jobs/status?jobId=job-1705329400000-abc123"
}
```

**Response (200 OK) - Direct Mode:**

```
(Streaming response with real-time command output)
```

**Response Headers (Direct Mode):**

```
Content-Type: text/event-stream
X-Exec-Id: <execution-id>
```

**Example (Distributed):**

```bash
curl -X POST http://localhost:3000/api/execute \
  -F "file=@project.zip" \
  -F "commands=npm install\nnpm test" \
  -F "mode=distributed"
```

**Example (Direct):**

```bash
curl -X POST http://localhost:3000/api/execute \
  -F "file=@project.zip" \
  -F "commands=npm install\nnpm test" \
  -F "mode=direct"
```

**Notes:**

- Files are stored in `/public/uploads/`
- For distributed mode, use `/api/jobs/status` to check progress
- For direct mode, response is streamed in real-time

---

## Error Codes

| Code | Meaning      | Resolution                            |
| ---- | ------------ | ------------------------------------- |
| 200  | OK           | Request successful                    |
| 202  | Accepted     | No jobs available (normal in polling) |
| 400  | Bad Request  | Check required parameters             |
| 403  | Forbidden    | Worker not authorized for job         |
| 404  | Not Found    | Job, worker, or resource not found    |
| 500  | Server Error | Unexpected error, check server logs   |

---

## Rate Limiting

Currently no rate limiting. Phase 3 will add:

- Per-IP request limits
- Per-worker job limits
- Job queue size limits

---

## WebSocket Support

Phase 3 will add WebSocket support for:

- Real-time job status updates
- Live command output streaming
- Worker status changes

---

## Examples

### Complete Workflow

**Step 1: Check available workers**

```bash
curl http://localhost:3000/api/workers/register
```

**Step 2: Create a job**

```bash
curl -X POST http://localhost:3000/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npm install && npm test",
    "fileUrl": "/uploads/project.zip",
    "filename": "project.zip"
  }'

# Response: {"success": true, "jobId": "job-..."}
```

**Step 3: Poll job status**

```bash
# Repeat every 500ms until complete
curl "http://localhost:3000/api/jobs/status?jobId=job-1705329400000-abc123"
```

**Step 4: Get results**

```bash
curl "http://localhost:3000/api/jobs/status?jobId=job-1705329400000-abc123" | jq '.stdout'
```

---

## Testing with cURL

### All Workers

```bash
curl http://localhost:3000/api/workers/register | jq
```

### All Jobs

```bash
curl http://localhost:3000/api/jobs/create | jq
```

### Specific Job

```bash
curl "http://localhost:3000/api/jobs/status?jobId=job-..." | jq
```

### Pretty Print

```bash
curl -s http://localhost:3000/api/workers/register | python -m json.tool
```

---

## Postman Collection

A Postman collection for these APIs can be created with:

1. Import > Raw Text (paste this):

```
{
  "info": {
    "name": "CMD Executor Phase 2",
    "version": "1.0.0"
  },
  "item": [
    {
      "name": "Register Worker",
      "request": {
        "method": "POST",
        "url": "{{server}}/api/workers/register",
        "body": {
          "workerId": "worker-test",
          "hostname": "test-pc"
        }
      }
    }
  ]
}
```

2. Set variable: `{{server}}` = `http://localhost:3000`

---

## Conclusion

These APIs provide all necessary operations for the distributed command executor system. The design is stateless, making it easy to scale and monitor.
