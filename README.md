# CMD Executor - Distributed Command Execution System

A production-ready distributed computing platform that transforms idle workstations into a coordinated network of worker nodes. Designed for teams needing to distribute computational tasks across available hardware without complex infrastructure.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What is CMD Executor?

CMD Executor is a distributed command execution system consisting of:

- **Central Server** (Next.js) - Web UI, job orchestration, worker management
- **Worker Agents** (Node.js) - Execute tasks on remote machines
- **Web Interface** (React) - Submit commands, monitor progress, view results

### Key Features

✅ **Distributed Execution** - Commands run on remote workers, not the server  
✅ **Auto-Registration** - Workers register automatically with persistent IDs  
✅ **Health Monitoring** - Real-time heartbeat detection  
✅ **Job Queue** - FIFO job assignment with fair distribution  
✅ **File Transfer** - ZIP upload support for project dependencies  
✅ **Real-time Output** - Stream stdout/stderr as jobs execute  
✅ **Persistent Storage** - MongoDB for jobs and results  
✅ **Caching Layer** - Redis for performance  
✅ **Authentication** - JWT + HMAC token support  
✅ **Cross-Platform** - Windows, macOS, Linux support  

### Use Cases

- **Build Distribution** - Distribute compilation across multiple machines
- **Test Execution** - Run test suites in parallel
- **Batch Processing** - Process large datasets across available hardware
- **Resource Optimization** - Leverage idle workstations
- **CI/CD Integration** - Distributed job execution for pipelines

---

### Prerequisites

- **Node.js** 18.x or higher
- **npm** or **yarn**
- **MongoDB** (local or remote)
- **Redis** (optional, for caching)

### 5-Minute Setup

#### Step 1: Clone and Install

```bash
git clone <repo-url>
cd cmd-executor
npm install
```

#### Step 2: Configure Environment

Create `.env.local`:

```env
# Database
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=cmd_executor

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-random-secret-key-here
WORKER_TOKEN_SECRET=another-secret-key
JWT_EXPIRES_IN=24h

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

#### Step 3: Start Server (Terminal 1)

```bash
npm run dev
# Server runs on http://localhost:3000
```

#### Step 4: Start Worker (Terminal 2)

```bash
node worker-agent.js --server http://localhost:3000
# Worker registers and waits for jobs
```

#### Step 5: Use Web UI (Browser)

1. Open `http://localhost:3000`
2. Click **"Distributed"** mode
3. Upload a ZIP file with your project
4. Enter command: `npm test` or `npm run build`
5. Click **"Execute"**
6. View real-time results

---

## Architecture

### System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          WEB INTERFACE (React)                       │
│  ┌──────────────┬──────────────┬──────────────┬──────────────────┐  │
│  │ File Upload  │ Command Form │ Job Status   │ Real-time Output │  │
│  │ (ZIP files)  │ (Direct Mode)│ (Polling)    │ (WebSocket)      │  │
│  └──────────────┴──────────────┴──────────────┴──────────────────┘  │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                ┌────▼────────────────────────────────────────┐
                │    CENTRAL SERVER (Next.js + Express)       │
                ├───────────────────────────────────────────┤
                │ • Worker Registry & Management             │
                │ • Job Queue & Assignment                   │
                │ • File Storage (Uploaded ZIPs)             │
                │ • Result Aggregation                       │
                │ • Authentication & Rate Limiting           │
                │ • Real-time Output Streaming               │
                └────┬──────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼────┐  ┌───▼─────┐  ┌──▼───────┐
   │MongoDB  │  │  Redis  │  │ File     │
   │(Jobs)   │  │(Cache)  │  │ Storage  │
   │(Results)│  │         │  │(Uploads) │
   └─────────┘  └─────────┘  └──────────┘
        │
        │ HTTP (Pull Model)
        │
   ┌────┴───────────────────────────────────────┐
   │      WORKER AGENTS (Node.js)               │
   │  ┌──────────────────────────────────────┐  │
   │  │ Machine 1: Windows          [Idle]   │  │
   │  │ • Auto-register on startup           │  │
   │  │ • Poll for jobs every 5s             │  │
   │  │ • Execute commands                   │  │
   │  │ • Stream output back to server       │  │
   │  │ • Cleanup temp files                 │  │
   │  └──────────────────────────────────────┘  │
   │  ┌──────────────────────────────────────┐  │
   │  │ Machine 2: macOS            [Busy]   │  │
   │  │ • Processing job from queue          │  │
   │  └──────────────────────────────────────┘  │
   │  ┌──────────────────────────────────────┐  │
   │  │ Machine 3: Linux            [Idle]   │  │
   │  │ • Waiting for assignments            │  │
   │  └──────────────────────────────────────┘  │
   └────────────────────────────────────────────┘
```

### Component Breakdown

#### Central Server (`/src`)

```
src/
├── app/
│   ├── api/
│   │   ├── auth/          # JWT validation, token generation
│   │   ├── workers/       # Worker registration, heartbeat, list
│   │   ├── jobs/          # Job submission, status, results
│   │   ├── files/         # File upload, download
│   │   └── execute/       # Direct execution (legacy)
│   ├── components/        # React components
│   ├── login/             # Authentication UI
│   └── page.tsx           # Main dashboard
├── lib/
│   ├── auth.ts            # JWT/HMAC authentication
│   ├── config.ts          # Environment configuration
│   ├── types.ts           # TypeScript interfaces
│   ├── db/
│   │   ├── mongodb.ts     # MongoDB connection & queries
│   │   └── redis.ts       # Redis client & caching
│   └── jobs.ts            # Job management logic
├── middleware.ts          # Request preprocessing
└── (additional files)
```

#### Worker Agent (`worker-agent.js`)

```
worker-agent.js
├── Initialization
│   ├── Generate unique workerId
│   ├── Detect system info (CPU, RAM, OS)
│   └── Register with server
├── Job Loop (runs every 5 seconds)
│   ├── Poll server for new job
│   ├── Download file if needed
│   ├── Extract ZIP
│   ├── Execute command
│   ├── Stream output in real-time
│   ├── Upload results
│   └── Cleanup temp files
└── Heartbeat (every 30 seconds)
    ├── Report worker status
    └── Confirm availability
```

---

## Installation

### Development Setup

```bash
# Install dependencies
npm install

# Create database (MongoDB local)
mongod --dbpath ./data

# Start development server
npm run dev

# In another terminal, start worker
node worker-agent.js --server http://localhost:3000
```

### Production Setup

See deployment section below for Docker, Kubernetes, and cloud deployment guides.

---

## Usage

### Web Interface

1. **Dashboard** - View all registered workers and job queue
2. **Submit Job** - Upload files and enter execution command
3. **Monitor Progress** - Real-time stdout/stderr streaming
4. **View Results** - Download execution results and logs

### Command Line (Worker)

```bash
# Start worker
node worker-agent.js \
  --server http://localhost:3000 \
  --token <worker-token> \
  --max-parallel 2

# Options:
# --server       Server URL (required)
# --token        Worker token for authentication (optional)
# --max-parallel Number of parallel jobs (default: 1)
# --timeout      Job timeout in seconds (default: 3600)
```

### API Examples

#### Register Worker

```bash
curl -X POST http://localhost:3000/api/workers/register \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": "worker-001",
    "hostname": "desktop-pc",
    "cpuCount": 8
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGc..."
}
```

#### Submit Job

```bash
curl -X POST http://localhost:3000/api/jobs/submit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npm test",
    "fileUrl": "https://server/uploads/project.zip",
    "workingDirectory": "project",
    "timeout": 600
  }'
```

**Response:**
```json
{
  "jobId": "job-12345",
  "status": "queued",
  "createdAt": "2026-01-25T10:30:00Z"
}
```

#### Check Job Status

```bash
curl http://localhost:3000/api/jobs/status?jobId=job-12345
```

**Response:**
```json
{
  "jobId": "job-12345",
  "status": "running",
  "workerId": "worker-001",
  "stdout": "Running tests...\n",
  "stderr": "",
  "progress": 45
}
```

#### Get Next Job (Worker)

```bash
curl -X GET http://localhost:3000/api/jobs/get-job \
  -H "x-worker-token: <token>"
```

**Response:**
```json
{
  "jobId": "job-12345",
  "command": "npm test",
  "fileUrl": "https://server/uploads/project.zip",
  "timeout": 600
}
```

---

## API Reference

### Worker Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/workers/register` | Register a new worker |
| GET | `/api/workers/list` | List all workers |
| GET | `/api/workers/[workerId]` | Get worker details |
| DELETE | `/api/workers/[workerId]` | Unregister worker |
| POST | `/api/workers/heartbeat` | Send heartbeat |

### Job Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs/submit` | Submit new job |
| GET | `/api/jobs/status` | Get job status |
| GET | `/api/jobs/list` | List jobs |
| GET | `/api/jobs/get-job` | Get next job (worker) |
| POST | `/api/jobs/submit-result` | Submit job result |
| POST | `/api/jobs/stream-output` | Stream output |

### File Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload ZIP file |
| GET | `/api/files/download/[fileId]` | Download file |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/refresh` | Refresh token |

---

## Configuration

### Environment Variables

```env
# Database
MONGODB_URI=mongodb://user:pass@host:27017
MONGODB_DB=cmd_executor

# Redis (optional)
REDIS_URL=redis://:password@localhost:6379/0

# Security
JWT_SECRET=secret-key-min-32-chars-long
WORKER_TOKEN_SECRET=worker-secret-key
JWT_EXPIRES_IN=24h

# CORS & Origin
ALLOWED_ORIGINS=http://localhost:3000,https://example.com
ENFORCE_TLS=false

# OIDC/OAuth (optional)
OIDC_ISSUER=https://issuer.example.com
OIDC_CLIENT_ID=client-id
OIDC_CLIENT_SECRET=client-secret

# Logging
LOG_LEVEL=info
DEBUG=cmd-executor:*
```

### Database Schema

#### Workers Collection

```javascript
{
  _id: ObjectId,
  workerId: "worker-001",
  hostname: "desktop-pc",
  cpuCount: 8,
  totalMemoryMb: 16384,
  status: "online", // online, offline, error
  lastHeartbeat: ISODate("2026-01-25T10:30:00Z"),
  registeredAt: ISODate("2026-01-25T09:00:00Z"),
  metadata: {
    osType: "Windows",
    nodeVersion: "18.17.0",
    tags: ["test", "build"]
  }
}
```

#### Jobs Collection

```javascript
{
  _id: ObjectId,
  jobId: "job-12345",
  command: "npm test",
  fileUrl: "https://server/uploads/project.zip",
  status: "completed", // queued, running, completed, failed
  workerId: "worker-001",
  createdAt: ISODate("2026-01-25T10:30:00Z"),
  startedAt: ISODate("2026-01-25T10:30:05Z"),
  completedAt: ISODate("2026-01-25T10:35:00Z"),
  stdout: "test output...",
  stderr: "",
  exitCode: 0,
  timeout: 600,
  result: {
    success: true,
    duration: 295,
    lines: 1250
  }
}
```

---

## Deployment

### Docker

```bash
# Build image
docker build -t cmd-executor:latest .

# Run server
docker run -p 3000:3000 \
  -e MONGODB_URI=mongodb://mongo:27017 \
  -e REDIS_URL=redis://redis:6379 \
  cmd-executor:latest

# Run worker
docker run \
  -e SERVER_URL=http://server:3000 \
  cmd-executor:latest node worker-agent.js
```

### Docker Compose

```yaml
version: '3.8'

services:
  server:
    build: .
    ports:
      - "3000:3000"
    environment:
      MONGODB_URI: mongodb://mongo:27017
      REDIS_URL: redis://redis:6379
    depends_on:
      - mongo
      - redis

  mongo:
    image: mongo:latest
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:latest

  worker-1:
    build: .
    command: node worker-agent.js --server http://server:3000
    environment:
      SERVER_URL: http://server:3000
    depends_on:
      - server

volumes:
  mongo-data:
```

---

## Troubleshooting

### Worker Won't Register

**Problem:** Worker keeps getting "Unauthorized" error

**Solution:**
1. Check server is running: `curl http://localhost:3000/api/health`
2. Verify network connectivity: `ping server-hostname`
3. Check logs: `node worker-agent.js --debug`

### Jobs Not Executing

**Problem:** Jobs stay in "queued" status

**Solution:**
1. Verify workers are registered: `curl http://localhost:3000/api/workers/list`
2. Check worker logs for errors
3. Ensure ZIP files are accessible
4. Verify job timeout isn't too short

### High Memory Usage

**Problem:** Worker process consuming too much RAM

**Solution:**
1. Reduce `--max-parallel` flag
2. Increase job timeout to allow cleanup
3. Monitor with `node --max-old-space-size=4096 worker-agent.js`

### Output Not Streaming

**Problem:** Can't see real-time output

**Solution:**
1. Check WebSocket connectivity
2. Verify ALLOWED_ORIGINS includes client URL
3. Check browser console for errors
4. Ensure job is actually running (check status endpoint)

### Database Connection Failed

**Problem:** "Failed to connect to MongoDB"

**Solution:**
1. Verify MongoDB is running: `mongo --version`
2. Check connection string: `mongodb://localhost:27017`
3. Verify authentication credentials
4. Check firewall rules

---

## File Structure

```
cmd-executor/
├── src/                      # Next.js application
│   ├── app/                  # App router
│   │   ├── api/             # API routes
│   │   ├── components/      # React components
│   │   └── page.tsx         # Main page
│   ├── lib/                 # Utilities
│   │   ├── db/             # Database setup
│   │   ├── auth.ts         # Authentication
│   │   └── types.ts        # TypeScript definitions
│   └── middleware.ts        # Next.js middleware
├── electron/               # Electron app (optional GUI)
├── public/                 # Static files
├── worker-agent.js         # Worker executable
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── next.config.ts          # Next.js config
├── eslint.config.mjs       # Linting rules
├── postcss.config.mjs      # CSS processing
└── .env.local              # Environment variables
```

---

## Security Considerations

- **Authentication**: All API endpoints require JWT or HMAC tokens
- **Rate Limiting**: Redis-based rate limiting on all endpoints
- **CORS**: Configured for allowed origins only
- **TLS/HTTPS**: Enforced in production (see `ENFORCE_TLS`)
- **Token Rotation**: Implement regular token refresh
- **File Uploads**: Validate ZIP files before processing
- **Command Sanitization**: No shell injection prevention (run in isolated environment)

---

## Performance Optimization

- **Connection Pooling**: MongoDB connection reuse
- **Redis Caching**: Job results cached for 1 hour
- **Lazy Loading**: Components load on demand
- **Compression**: gzip enabled for responses
- **CDN**: Serve static files from CDN in production

---

## Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/name`
5. Submit pull request

---

## License

MIT - See LICENSE file for details

---

## Support

- **Documentation**: See `/docs` folder
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@example.com

---

## Changelog

### Version 0.2.0 (Current)
- Distributed worker support
- Real-time output streaming
- Job queue management
- Worker health monitoring

### Version 0.1.0
- Initial release
- Direct command execution
- Basic web UI

This is a custom distributed system. For improvements:

1. Test changes locally with multiple workers
2. Update documentation
3. Add test cases to `CHECKLIST.md`
4. Document Phase 3 implications

## License

Custom implementation - no external license restrictions apply.

## Support

- **API questions**: See [API_REFERENCE.md](API_REFERENCE.md)
- **Architecture questions**: See [PHASE_2_README.md](PHASE_2_README.md)
- **Code structure**: See [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)
- **Quick commands**: See [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
- **Completeness**: See [CHECKLIST.md](CHECKLIST.md)

## Next Steps

1. **Read**: [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for quick commands
2. **Run**: `npm run dev && node worker-agent.js` in separate terminals
3. **Test**: Use web UI at http://localhost:3000
4. **Monitor**: Check logs and use `/api/workers/register` endpoint
5. **Plan**: Phase 3 improvements based on your needs

---

**Phase 2 is complete and ready for production!** 🎉

For support, refer to the documentation files or the source code comments.
