# CMD Executor - Quick Start Guide

A quick reference for getting started with CMD Executor.

## 🚀 5-Minute Setup

### 1. Install & Configure

```bash
git clone <repo-url>
cd cmd-executor
npm install

# Create .env.local
cat > .env.local << EOF
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=cmd_executor
JWT_SECRET=dev-secret-key-here
WORKER_TOKEN_SECRET=worker-secret-key-here
ALLOWED_ORIGINS=http://localhost:3000
EOF
```

### 2. Start Server (Terminal 1)

```bash
npm run dev
# Runs at http://localhost:3000
```

### 3. Start Worker (Terminal 2)

```bash
node worker-agent.js
# Registers with server
```

### 4. Submit a Job (Browser)

1. Open http://localhost:3000
2. Upload a ZIP file with your project
3. Enter command: `npm test` or `npm run build`
4. Click "Execute"
5. Watch real-time results

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| [README.md](README.md) | **← Start here** - Complete overview |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, components, data models |
| [API.md](API.md) | Complete HTTP API reference |
| [DEVELOPER.md](DEVELOPER.md) | Code structure, development setup |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment guides |

---

## 🛠️ Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run lint            # Check code quality
npm run build           # Build for production
npm start               # Run production build

# Workers
node worker-agent.js                    # Start worker
WORKER_ID=w1 node worker-agent.js       # Custom ID
node quickstart.js                      # Demo script

# Testing
curl http://localhost:3000/api/workers/list
curl -X POST http://localhost:3000/api/auth/login \
  -d '{"email":"user@example.com","password":"pass"}'
```

---

## 🔑 Key Concepts

### Three-Tier System

```
┌──────────────────┐
│   Web Browser    │  ← Upload files, submit jobs
└────────┬─────────┘
         │
┌────────▼──────────────┐
│   Central Server      │  ← Orchestrate, manage
│   (Next.js)           │
└────────┬──────────────┘
         │
┌────────▼──────────────┐
│   Worker Agents       │  ← Execute commands
│   (Node.js)           │
└──────────────────────┘
```

### Job Execution Flow

1. **User** uploads ZIP file to server
2. **Server** stores file and queues job
3. **Worker** polls server for jobs every 5 seconds
4. **Server** assigns next queued job to idle worker
5. **Worker** downloads file, extracts, executes command
6. **Worker** streams output back to server in real-time
7. **Server** displays output in browser
8. **Worker** submits final result
9. **Server** archives completed job

---

## 📡 API Quick Reference

### Register Worker

```bash
curl -X POST http://localhost:3000/api/workers/register \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": "worker-001",
    "hostname": "desktop",
    "cpuCount": 8
  }'
```

### Submit Job

```bash
curl -X POST http://localhost:3000/api/jobs/submit \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npm test",
    "fileUrl": "/uploads/project.zip",
    "timeout": 600
  }'
```

### Check Status

```bash
curl "http://localhost:3000/api/jobs/status?jobId=job-12345"
```

### List Workers

```bash
curl http://localhost:3000/api/workers/list
```

See [API.md](API.md) for complete endpoint documentation.

---

## 🗂️ Project Structure

```
cmd-executor/
├── src/app/
│   ├── api/           # API endpoints
│   ├── components/    # React components
│   └── page.tsx       # Home page
├── src/lib/
│   ├── db/           # Database code
│   ├── auth.ts       # Authentication
│   └── types.ts      # TypeScript types
├── worker-agent.js    # Standalone worker
├── .env.local        # Your config (create this)
└── [Docs files below]
```

---

## 📖 Documentation Structure

```
README.md                  ← Start here - 30 min read
  ├─ Overview & features
  ├─ Quick start
  ├─ Architecture diagram
  ├─ Installation
  ├─ Usage examples
  └─ Troubleshooting
  
ARCHITECTURE.md            ← Understanding the system
  ├─ Component breakdown
  ├─ Data flow diagrams
  ├─ Database schemas
  ├─ Authentication
  └─ Scalability patterns
  
API.md                     ← Integration reference
  ├─ All HTTP endpoints
  ├─ Request/response examples
  ├─ Error handling
  ├─ Rate limiting
  └─ Code examples
  
DEVELOPER.md               ← Build on this codebase
  ├─ Development setup
  ├─ Code organization
  ├─ Adding features
  ├─ Testing approach
  └─ Debugging tips
  
DEPLOYMENT.md              ← Run in production
  ├─ Pre-flight checklist
  ├─ Docker setup
  ├─ Cloud deployment
  ├─ Scaling strategies
  ├─ Monitoring
  └─ Backup/recovery
  
QUICKSTART.md              ← You are here!
  └─ 5-minute setup
  └─ Common commands
  └─ Key concepts
  └─ Quick reference
```

---

## ❓ Frequently Asked Questions

### Q: How do I add authentication?

A: Edit `.env.local` with JWT_SECRET and implement login in your frontend.

### Q: Can I run multiple workers?

A: Yes! Start multiple instances:
```bash
WORKER_ID=w1 node worker-agent.js &
WORKER_ID=w2 node worker-agent.js &
```

### Q: How do I deploy to production?

A: See [DEPLOYMENT.md](DEPLOYMENT.md). Options include:
- Docker Compose (easiest)
- AWS EC2
- Google Cloud Run
- Azure App Service
- Kubernetes

### Q: How do I troubleshoot worker registration?

A: Check:
1. Server is running: `curl http://localhost:3000/api/health`
2. Worker can reach server: `ping server-hostname`
3. Worker logs: `node worker-agent.js --debug`

### Q: How do I backup my jobs?

A: See [DEPLOYMENT.md](DEPLOYMENT.md#backup-and-recovery)

---

## 🔗 Quick Links

- **Repository**: [GitHub](https://github.com/kakarot2905/Remote-Executor)
- **Issues & Discussions**: GitHub Issues
- **Full API Docs**: [API.md](API.md)
- **System Design**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Development Guide**: [DEVELOPER.md](DEVELOPER.md)
- **Production Deployment**: [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 📋 Next Steps

1. **Read** [README.md](README.md) for complete overview (20 min)
2. **Setup** development environment (5 min)
3. **Run** server + worker + test job (10 min)
4. **Review** [ARCHITECTURE.md](ARCHITECTURE.md) to understand design
5. **Explore** API endpoints with curl or Postman
6. **Deploy** using [DEPLOYMENT.md](DEPLOYMENT.md) guide

---

## 🆘 Need Help?

**Common Issues:**

| Problem | Solution |
|---------|----------|
| "Cannot connect to MongoDB" | Install MongoDB or update MONGODB_URI |
| "Worker won't register" | Check server is running: `curl http://localhost:3000` |
| "Jobs stay queued" | Start a worker: `node worker-agent.js` |
| "Port 3000 in use" | Change PORT or kill process: `lsof -i :3000` |
| "Authentication fails" | Ensure JWT_SECRET is set in .env.local |

See [README.md#troubleshooting](README.md#troubleshooting) for more.

---

**Version**: 0.2.0  
**Last Updated**: January 2026  
**Status**: Production Ready ✅
