# CMD Executor - Complete API Reference

Complete HTTP API documentation for all endpoints.

## Base URL

```
http://localhost:3000/api
```

## Authentication

All endpoints except `/auth/login` require authentication:

```bash
# Method 1: Bearer token
Authorization: Bearer <jwt_token>

# Method 2: Cookie (automatic)
Cookie: auth_token=<jwt_token>

# Method 3: Worker token (for workers only)
x-worker-token: <worker_token>
```

---

## Authentication Endpoints

### POST /auth/login

Login with credentials to get JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "role": "admin"
  },
  "expiresIn": "24h"
}
```

**Response (401):**
```json
{
  "error": "Invalid credentials",
  "message": "Email or password incorrect"
}
```

### POST /auth/logout

Logout and invalidate token.

**Request:**
```bash
POST /auth/logout
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### POST /auth/refresh

Refresh expired JWT token.

**Request:**
```bash
POST /auth/refresh
Authorization: Bearer <expired_token>
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Worker Endpoints

### POST /workers/register

Register a new worker node.

**Request:**
```json
{
  "workerId": "worker-001",
  "hostname": "desktop-pc",
  "cpuCount": 8,
  "totalMemoryMb": 16384,
  "metadata": {
    "osType": "Windows",
    "nodeVersion": "18.17.0",
    "tags": ["test", "build"]
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "workerId": "worker-001",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "registeredAt": "2026-01-25T10:30:00Z"
}
```

**Response (400):**
```json
{
  "error": "Invalid request",
  "message": "workerId is required"
}
```

**Response (409):**
```json
{
  "error": "Conflict",
  "message": "Worker already registered"
}
```

### POST /workers/heartbeat

Send heartbeat to confirm worker is alive.

**Request:**
```json
{
  "workerId": "worker-001",
  "status": "idle",
  "currentJobId": null,
  "jobsCompleted": 42
}
```

**Response (200):**
```json
{
  "success": true,
  "serverTime": "2026-01-25T10:30:05Z",
  "nextCheckIn": 30000
}
```

### GET /workers/list

List all registered workers.

**Query Parameters:**
- `status` - Filter by status: `online`, `offline`, `error`
- `limit` - Max results (default: 100)
- `offset` - Skip results (default: 0)

**Request:**
```bash
GET /workers/list?status=online&limit=50
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "total": 3,
  "workers": [
    {
      "workerId": "worker-001",
      "hostname": "desktop-pc",
      "cpuCount": 8,
      "status": "online",
      "lastHeartbeat": "2026-01-25T10:30:05Z",
      "registeredAt": "2026-01-25T09:00:00Z",
      "currentJobId": "job-123",
      "jobsCompleted": 42
    }
  ]
}
```

### GET /workers/[workerId]

Get details of a specific worker.

**Request:**
```bash
GET /workers/worker-001
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "worker": {
    "workerId": "worker-001",
    "hostname": "desktop-pc",
    "cpuCount": 8,
    "totalMemoryMb": 16384,
    "status": "online",
    "lastHeartbeat": "2026-01-25T10:30:05Z",
    "registeredAt": "2026-01-25T09:00:00Z",
    "currentJobId": "job-123",
    "jobsCompleted": 42,
    "metadata": {
      "osType": "Windows",
      "nodeVersion": "18.17.0",
      "tags": ["test", "build"]
    }
  }
}
```

### DELETE /workers/[workerId]

Unregister a worker.

**Request:**
```bash
DELETE /workers/worker-001
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Worker unregistered"
}
```

---

## Job Endpoints

### POST /jobs/submit

Submit a new job for execution.

**Request:**
```json
{
  "command": "npm test",
  "fileUrl": "/uploads/project.zip",
  "workingDirectory": "project",
  "timeout": 600,
  "priority": "normal"
}
```

**Response (201):**
```json
{
  "success": true,
  "jobId": "job-12345",
  "status": "queued",
  "createdAt": "2026-01-25T10:30:00Z",
  "estimatedWaitTime": 45
}
```

**Response (400):**
```json
{
  "error": "Invalid request",
  "message": "command is required"
}
```

### GET /jobs/get-job

Get the next job for a worker (called by worker agent).

**Request:**
```bash
GET /jobs/get-job
x-worker-token: <worker_token>
```

**Response (200 - Job Available):**
```json
{
  "success": true,
  "job": {
    "jobId": "job-12345",
    "command": "npm test",
    "fileUrl": "https://server/uploads/project.zip",
    "workingDirectory": "project",
    "timeout": 600
  }
}
```

**Response (204 - No Jobs):**
```
No Content
```

### GET /jobs/status

Check the status of a job.

**Query Parameters:**
- `jobId` - Job ID (required)

**Request:**
```bash
GET /jobs/status?jobId=job-12345
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "job": {
    "jobId": "job-12345",
    "status": "running",
    "workerId": "worker-001",
    "createdAt": "2026-01-25T10:30:00Z",
    "startedAt": "2026-01-25T10:30:05Z",
    "stdout": "Running tests...\n",
    "stderr": "",
    "progress": 45,
    "exitCode": null
  }
}
```

### GET /jobs/list

List all jobs.

**Query Parameters:**
- `status` - Filter by status: `queued`, `running`, `completed`, `failed`
- `workerId` - Filter by worker
- `limit` - Max results (default: 100)
- `offset` - Skip results (default: 0)

**Request:**
```bash
GET /jobs/list?status=completed&limit=50
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "total": 150,
  "jobs": [
    {
      "jobId": "job-12345",
      "command": "npm test",
      "status": "completed",
      "workerId": "worker-001",
      "createdAt": "2026-01-25T10:30:00Z",
      "completedAt": "2026-01-25T10:35:00Z",
      "exitCode": 0
    }
  ]
}
```

### POST /jobs/submit-result

Submit job execution result (called by worker).

**Request:**
```json
{
  "jobId": "job-12345",
  "workerId": "worker-001",
  "stdout": "test output...",
  "stderr": "",
  "exitCode": 0
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Result saved",
  "jobId": "job-12345"
}
```

### POST /jobs/stream-output

Stream output data while job is running.

**Request:**
```json
{
  "jobId": "job-12345",
  "data": "test line 1\n",
  "type": "stdout"
}
```

**Parameters:**
- `type` - `stdout` or `stderr`
- `data` - Output text

**Response (200):**
```json
{
  "success": true,
  "received": true
}
```

---

## File Endpoints

### POST /files/upload

Upload a file (typically ZIP).

**Request:**
```bash
POST /files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- file: <binary file>
```

**Response (201):**
```json
{
  "success": true,
  "fileId": "file-abc123",
  "filename": "project.zip",
  "size": 10485760,
  "uploadedAt": "2026-01-25T10:30:00Z",
  "url": "/uploads/file-abc123/project.zip",
  "expiresAt": "2026-02-25T10:30:00Z"
}
```

**Response (400):**
```json
{
  "error": "Invalid file",
  "message": "File size exceeds 500MB limit"
}
```

### GET /files/download/[fileId]

Download an uploaded file.

**Request:**
```bash
GET /files/download/file-abc123
Authorization: Bearer <token>
```

**Response (200):**
```
Binary file content
Content-Type: application/zip
Content-Disposition: attachment; filename="project.zip"
```

**Response (404):**
```json
{
  "error": "Not found",
  "message": "File not found"
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "details": {
    "field": "specific details"
  },
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Success |
| 201 | Created | Job submitted |
| 204 | No Content | No jobs available |
| 400 | Bad Request | Missing required field |
| 401 | Unauthorized | Invalid token |
| 403 | Forbidden | Permission denied |
| 404 | Not Found | Worker not found |
| 409 | Conflict | Worker already exists |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal error |
| 503 | Service Unavailable | Database offline |

---

## Rate Limiting

All endpoints are rate-limited.

**Headers in Response:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705329900
```

**When limit exceeded (429):**
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "retryAfter": 30
}
```

---

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `limit` - Results per page (default: 100, max: 1000)
- `offset` - Skip N results (default: 0)

**Response Format:**
```json
{
  "success": true,
  "total": 250,
  "limit": 100,
  "offset": 0,
  "hasMore": true,
  "data": [...]
}
```

---

## Filtering

Filter results with query parameters:

```bash
# Filter by status
GET /jobs/list?status=completed

# Multiple filters
GET /workers/list?status=online&tags=test
```

---

## Sorting

Sort results with `sort` parameter:

```bash
# Sort ascending
GET /jobs/list?sort=createdAt

# Sort descending
GET /jobs/list?sort=-createdAt
```

---

## Examples

### Complete Job Submission Flow

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Response contains token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 2. Upload file
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@project.zip"

# Response contains fileId
FILE_ID="file-abc123"

# 3. Submit job
curl -X POST http://localhost:3000/api/jobs/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npm test",
    "fileUrl": "/uploads/'$FILE_ID'/project.zip",
    "timeout": 600
  }'

# Response contains jobId
JOB_ID="job-12345"

# 4. Poll status
curl http://localhost:3000/api/jobs/status?jobId=$JOB_ID \
  -H "Authorization: Bearer $TOKEN"
```

### Worker Execution Flow

```bash
# 1. Register worker
curl -X POST http://localhost:3000/api/workers/register \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": "worker-001",
    "hostname": "desktop-pc",
    "cpuCount": 8
  }'

# Response contains token
WORKER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 2. Poll for jobs (loop every 5 seconds)
curl http://localhost:3000/api/jobs/get-job \
  -H "x-worker-token: $WORKER_TOKEN"

# 3. Stream output while executing
curl -X POST http://localhost:3000/api/jobs/stream-output \
  -H "x-worker-token: $WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "job-12345",
    "data": "test line\n",
    "type": "stdout"
  }'

# 4. Submit result
curl -X POST http://localhost:3000/api/jobs/submit-result \
  -H "x-worker-token: $WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "job-12345",
    "workerId": "worker-001",
    "stdout": "tests passed",
    "stderr": "",
    "exitCode": 0
  }'
```

---

## WebSocket Events (Future)

Real-time job updates via WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:3000/api/jobs/stream');

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  
  // Job started
  if (message.type === 'job.started') {
    console.log('Job started:', message.jobId);
  }
  
  // Output received
  if (message.type === 'job.output') {
    console.log(message.data);
  }
  
  // Job completed
  if (message.type === 'job.completed') {
    console.log('Job finished with exit code:', message.exitCode);
  }
});
```
