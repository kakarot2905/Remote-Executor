# Complete System Deployment Checklist

## 🎯 Phase Summary

This checklist covers deploying the complete **Command Executor** distributed job execution system with:

- ✅ Next.js backend with MongoDB/Redis
- ✅ JWT + worker-token authentication
- ✅ WebSocket bi-directional communication
- ✅ REST API with rate limiting
- ✅ Electron worker desktop application
- ✅ Multi-cloud deployment (AWS/GCP)

---

## 📋 Pre-Deployment Phase

### Infrastructure Planning

- [ ] Decide on cloud provider (AWS, GCP, or on-premises)
- [ ] Estimate worker count (1, 10, 100+?)
- [ ] Plan scaling strategy (horizontal vs vertical)
- [ ] Review budget constraints
- [ ] Plan monitoring/alerting solution

### Development Environment

- [ ] Node.js 18+ LTS installed
- [ ] Docker installed and running
- [ ] MongoDB accessible (local or cloud)
- [ ] Redis accessible (local or cloud)
- [ ] Git repository initialized
- [ ] .env file configured locally

**Verify**:

```bash
node --version      # v18.x.x
npm --version       # 9.x.x
docker --version    # 20.10+
docker ps           # verify Docker running
```

### Dependencies Installed

Backend:

- [ ] `npm install` in root directory completed
- [ ] `mongodb`, `ioredis`, `jsonwebtoken`, `ws` packages present in package.json
- [ ] TypeScript compilation works: `npm run build`

Electron Worker:

- [ ] `npm install` in `electron-worker/` completed
- [ ] `electron`, `electron-builder` installed
- [ ] `src/worker.js`, `src/renderer.js`, `src/index.html` all present

---

## 🗂️ Backend Setup

### 1. Database Configuration

**MongoDB**

- [ ] MongoDB instance running (local or cloud)
  - [ ] Local: `mongosh` connection test
  - [ ] Cloud: MongoDB Atlas cluster created
  - [ ] Connection string tested: `mongodb+srv://user:pass@cluster.mongodb.net/db`

- [ ] Create collections:

  ```bash
  # Via mongosh
  use cmd_executor
  db.createCollection("jobs")
  db.createCollection("workers")
  db.createCollection("jobLogs")
  db.createCollection("heartbeats")
  ```

- [ ] Create indexes for performance:
  ```javascript
  db.jobs.createIndex({ status: 1, workerId: 1 });
  db.jobs.createIndex({ createdAt: 1 });
  db.workers.createIndex({ workerId: 1 }, { unique: true });
  db.workers.createIndex({ lastHeartbeat: 1 });
  ```

**Redis**

- [ ] Redis instance running
  - [ ] Local: `redis-cli ping` returns PONG
  - [ ] Cloud: ElastiCache or Memorystore cluster created
  - [ ] Connection string tested: `redis://host:port`

- [ ] Verify persistence (optional):
  ```bash
  redis-cli CONFIG GET save
  ```

### 2. Environment Configuration

- [ ] Create `.env` file in root:

```env
# MongoDB
MONGODB_URI=mongodb://user:password@host:27017/cmd_executor
MONGODB_POOL_SIZE=10

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-jwt-secret-key-min-32-chars
WORKER_TOKEN_SECRET=your-worker-secret-key-min-32-chars

# OIDC (optional)
OIDC_PROVIDER_URL=https://your-oidc-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_JOBS=50
RATE_LIMIT_MAX_HEARTBEAT=600
RATE_LIMIT_MAX_REGISTER=10

# Server
PORT=3000
NODE_ENV=production

# CORS
CORS_ORIGINS=http://localhost:3000,https://your-domain.com
```

- [ ] Verify all required vars present: `node -e "require('dotenv').config(); console.log(Object.keys(process.env).filter(k => k.startsWith('MONGODB') || k.startsWith('REDIS') || k.startsWith('JWT') || k.startsWith('WORKER')))"`

### 3. API Routes Verification

- [ ] All 12 API routes protected with auth:

**Job Routes** (JWT):

- [ ] POST /api/jobs/create
- [ ] GET /api/jobs/status
- [ ] POST /api/jobs/cancel
- [ ] GET /api/workers/list

**Worker Routes** (worker-token):

- [ ] GET /api/jobs/get-job
- [ ] POST /api/jobs/submit-result
- [ ] POST /api/jobs/stream-output
- [ ] GET /api/jobs/check-cancel
- [ ] POST /api/workers/register
- [ ] POST /api/workers/heartbeat

**Test each route**:

```bash
# User endpoint (needs JWT)
curl -H "Authorization: Bearer <jwt>" http://localhost:3000/api/jobs/create

# Worker endpoint (needs x-worker-token)
curl -H "x-worker-token: <token>" http://localhost:3000/api/workers/register
```

### 4. WebSocket Server

- [ ] WebSocket server configured on port 8080 (or custom)
- [ ] Test WebSocket connection:
  ```bash
  npm install -g wscat
  wscat -c ws://localhost:8080
  ```

### 5. Backend Testing

- [ ] Start backend: `npm run dev` or `npm start`
- [ ] Test health endpoint: `curl http://localhost:3000/api/health`
- [ ] Check logs for errors: no "Cannot connect to MongoDB" or "Redis connection failed"
- [ ] Verify WebSocket: `wscat` successfully connects
- [ ] Check rate limiting: rapid requests get 429 response

---

## 🖥️ Electron Worker Setup

### 1. Development Build

- [ ] Navigate to `electron-worker/` directory
- [ ] Install dependencies: `npm install`
- [ ] Test in dev mode: `npm run dev`
  - [ ] Window opens with dashboard
  - [ ] Configuration panel visible
  - [ ] System stats display (CPU, RAM)
  - [ ] Activity log appears

### 2. Configuration

- [ ] Create `electron-worker/.env`:

```env
SERVER_URL=http://localhost:3000
WORKER_TOKEN_SECRET=your-worker-secret-key-min-32-chars
CPU_LIMIT=2
RAM_LIMIT=512
AUTO_START=false
NODE_ENV=production
```

- [ ] Verify .env loaded: Activity log shows no config errors

### 3. Worker Class Testing

- [ ] Verify Worker class loads: no import errors
- [ ] Test token generation: JWT signed with WORKER_TOKEN_SECRET
- [ ] Test registration: `POST /api/workers/register` succeeds
- [ ] Test heartbeat: sent every 10 seconds
- [ ] Test WebSocket connection: connects to backend WS

**Manual test**:

```bash
cd electron-worker
node -e "
const Worker = require('./src/worker');
const config = {
  serverUrl: 'http://localhost:3000',
  workerTokenSecret: 'dev-worker-token-secret',
  cpuLimit: 2,
  ramLimit: 512
};
const w = new Worker(config, null);
console.log('Token:', w.generateWorkerToken());
"
```

### 4. Production Build

**Windows**:

- [ ] Run: `npm run build:win`
- [ ] Output: `dist/Command Executor Worker Setup 1.0.0.exe`
- [ ] Size: ~150 MB
- [ ] Test installer: Click .exe, follow wizard
- [ ] Verify app launches after install
- [ ] Check config file created: `%APPDATA%\Command Executor Worker\`

**macOS**:

- [ ] Run: `npm run build:mac`
- [ ] Output: `dist/Command Executor Worker-1.0.0.dmg`
- [ ] Size: ~180 MB
- [ ] Test installer: Mount .dmg, drag to Applications
- [ ] Verify app launches: `open /Applications/Command\ Executor\ Worker.app`

**Linux**:

- [ ] Run: `npm run build:linux`
- [ ] Output: `dist/Command Executor Worker-1.0.0.AppImage`
- [ ] Size: ~160 MB
- [ ] Test: `chmod +x dist/*.AppImage && ./dist/*.AppImage`
- [ ] Verify window opens with dashboard

---

## 🔄 Integration Testing

### 1. End-to-End Job Flow

```bash
# Terminal 1: Start backend
npm start

# Terminal 2: Start Electron worker
cd electron-worker
npm start

# Terminal 3: Submit a job
curl -X POST http://localhost:3000/api/jobs/create \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "echo Hello from worker",
    "containerImage": "alpine:latest"
  }'

# Monitor in Electron app:
# - Should see job in "Active Jobs"
# - Activity log shows execution
# - Job completes with output
```

### 2. Authentication Flow

- [ ] JWT token validation:

  ```bash
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "user@example.com", "password": "pass"}' \
    # Response: { token: "eyJ..." }
  ```

- [ ] Worker token validation:
  ```bash
  curl http://localhost:3000/api/workers/register \
    -H "x-worker-token: <invalid>" \
    # Response: 401 Unauthorized
  ```

### 3. Rate Limiting

- [ ] Exceed rate limit:
  ```bash
  for i in {1..100}; do
    curl http://localhost:3000/api/workers/heartbeat \
      -H "x-worker-token: <token>" &
  done
  # Some requests should return 429 Too Many Requests
  ```

### 4. WebSocket Communication

- [ ] Test real-time job delivery:
  - [ ] Submit job while worker connected
  - [ ] Job appears in Electron app within 1 second
  - [ ] No polling delay

### 5. Error Recovery

- [ ] WebSocket disconnect:
  - [ ] Worker stops responding
  - [ ] Electron app shows "Disconnected"
  - [ ] Heartbeat interval extends
  - [ ] Reconnect succeeds after ~5s

- [ ] Backend crash:
  - [ ] Kill backend server
  - [ ] Worker shows error in Activity log
  - [ ] Worker retries connection
  - [ ] Worker connects when backend restarts

---

## ☁️ Cloud Deployment (AWS)

### 1. Amazon DocumentDB (MongoDB replacement)

- [ ] Create DocumentDB cluster:

  ```bash
  aws docdb create-db-cluster --db-cluster-identifier cmd-executor \
    --master-username admin --master-user-password <password>
  ```

- [ ] Get connection string:

  ```bash
  aws docdb describe-db-clusters --db-cluster-identifier cmd-executor \
    --query 'DBClusters[0].Endpoint'
  ```

- [ ] Update .env: `MONGODB_URI=mongodb+srv://admin:password@cmd-executor.mongodb.net/cmd_executor`

### 2. Amazon ElastiCache (Redis)

- [ ] Create Redis cluster:

  ```bash
  aws elasticache create-cache-cluster --cache-cluster-id cmd-executor-redis \
    --cache-node-type cache.t3.micro --engine redis --num-cache-nodes 1
  ```

- [ ] Get endpoint:

  ```bash
  aws elasticache describe-cache-clusters --cache-cluster-id cmd-executor-redis \
    --query 'CacheClusters[0].CacheNodes[0].Endpoint'
  ```

- [ ] Update .env: `REDIS_URL=redis://endpoint:6379`

### 3. ECS/Fargate (Backend)

- [ ] Create ECR repository:

  ```bash
  aws ecr create-repository --repository-name cmd-executor-backend
  ```

- [ ] Build and push image:

  ```bash
  docker build -t cmd-executor-backend .
  docker tag cmd-executor-backend:latest <account>.dkr.ecr.<region>.amazonaws.com/cmd-executor-backend:latest
  docker push <account>.dkr.ecr.<region>.amazonaws.com/cmd-executor-backend:latest
  ```

- [ ] Create Fargate task definition (or use CloudFormation)

### 4. Secrets Manager

- [ ] Store secrets:
  ```bash
  aws secretsmanager create-secret --name cmd-executor/jwt-secret \
    --secret-string <secret>
  ```

### 5. Load Balancer

- [ ] Create Application Load Balancer
- [ ] Forward HTTP/HTTPS to Fargate tasks
- [ ] Configure health check: `/api/health`

### 6. Route 53

- [ ] Create DNS record: `cmd-executor.example.com` → ALB

---

## ☁️ Cloud Deployment (GCP)

### 1. MongoDB Atlas

- [ ] Create cluster: https://www.mongodb.com/cloud/atlas
- [ ] Whitelist IP ranges (or use PrivateLink)
- [ ] Get connection string: `mongodb+srv://...`
- [ ] Update .env: `MONGODB_URI=<atlas-connection-string>`

### 2. Google Cloud Memorystore (Redis)

- [ ] Create Redis instance:

  ```bash
  gcloud redis instances create cmd-executor \
    --size=1 --region=us-central1
  ```

- [ ] Get IP/port:

  ```bash
  gcloud redis instances describe cmd-executor
  ```

- [ ] Update .env: `REDIS_URL=redis://ip:port`

### 3. Cloud Run (Backend)

- [ ] Build image:

  ```bash
  gcloud builds submit --tag gcr.io/<project>/cmd-executor-backend
  ```

- [ ] Deploy:

  ```bash
  gcloud run deploy cmd-executor-backend \
    --image gcr.io/<project>/cmd-executor-backend \
    --platform managed --region us-central1 \
    --set-env-vars MONGODB_URI=<uri>,REDIS_URL=<url>
  ```

- [ ] Get URL:
  ```bash
  gcloud run services describe cmd-executor-backend --platform managed
  ```

### 4. Cloud Load Balancing

- [ ] Create HTTP(S) load balancer
- [ ] Backend service → Cloud Run
- [ ] SSL certificate from Google Managed Certificates

### 5. Cloud DNS

- [ ] Create DNS record: `cmd-executor.example.com` → load balancer IP

---

## 🔒 Security Hardening

### 1. API Security

- [ ] Rate limiting enabled and tested
- [ ] JWT expiration: 24 hours (or shorter)
- [ ] Worker tokens: 24 hour expiry
- [ ] CORS properly configured (not `*`)
- [ ] HTTPS enabled (no HTTP in production)
- [ ] WebSocket over WSS (TLS)

### 2. Database Security

- [ ] MongoDB authentication enabled
- [ ] MongoDB IP whitelist (not `0.0.0.0/0`)
- [ ] Redis AUTH password set
- [ ] Redis TLS enabled
- [ ] Regular backups automated

### 3. Secrets Management

- [ ] JWT_SECRET: 32+ random characters
- [ ] WORKER_TOKEN_SECRET: 32+ random characters
- [ ] No secrets in code or git history
- [ ] Use cloud secrets manager (AWS Secrets Manager, GCP Secret Manager)
- [ ] Rotate secrets quarterly

### 4. Network Security

- [ ] VPC/VPC Network configured
- [ ] Security groups restrict inbound to 80/443/8080
- [ ] Private subnets for databases
- [ ] NAT Gateway for outbound traffic

### 5. Application Security

- [ ] Dependency vulnerabilities checked: `npm audit`
- [ ] No root/admin access needed for app
- [ ] Input validation on all endpoints
- [ ] SQL injection N/A (using MongoDB)
- [ ] XSS protection in Electron app (contextIsolation: true)

---

## 📊 Monitoring & Observability

### 1. Logging

- [ ] Backend logs to stdout/file:

  ```bash
  pm2 start 'npm start' --name backend --output logs/backend.log --error logs/backend-error.log
  ```

- [ ] Centralized logging (optional):
  - [ ] CloudWatch (AWS)
  - [ ] Cloud Logging (GCP)
  - [ ] ELK Stack (self-hosted)

- [ ] Log level set to INFO in production

### 2. Metrics

- [ ] Monitor key metrics:
  - [ ] Worker count (active vs total)
  - [ ] Job throughput (jobs/minute)
  - [ ] Success rate (% completed vs failed)
  - [ ] Avg job duration
  - [ ] API response time
  - [ ] DB query time

- [ ] Tools:
  - [ ] Prometheus (metrics collection)
  - [ ] Grafana (dashboards)
  - [ ] CloudWatch (AWS)
  - [ ] Cloud Monitoring (GCP)

### 3. Alerting

- [ ] Alerts for:
  - [ ] Backend down (no heartbeat > 60s)
  - [ ] Error rate > 5%
  - [ ] Job queue > 1000 items
  - [ ] Database connection failures
  - [ ] Redis connection failures
  - [ ] Worker count < 1

- [ ] Notification channels:
  - [ ] Email
  - [ ] Slack
  - [ ] PagerDuty (on-call)

### 4. Health Checks

- [ ] Backend health endpoint:

  ```bash
  curl http://localhost:3000/api/health
  # Response: { status: "healthy", uptime: 3600 }
  ```

- [ ] Worker health: Activity log shows recent heartbeat
- [ ] Database: Can connect and query
- [ ] Redis: Can connect and ping
- [ ] WebSocket: Can connect and receive messages

---

## 🧪 Load Testing

### 1. Baseline Performance

- [ ] Single worker, single job: measure duration
- [ ] Single worker, 10 parallel jobs: measure throughput
- [ ] 10 workers, 100 jobs: measure queue time

### 2. Stress Testing

- [ ] 100 jobs submitted rapidly
- [ ] Measure: API latency, DB load, memory usage
- [ ] Verify: No data corruption, no crashes

### 3. Load Testing Tools

```bash
# Apache Bench
ab -n 1000 -c 10 http://localhost:3000/api/health

# wrk
wrk -t12 -c400 -d30s http://localhost:3000/api/health

# k6
k6 run load-test.js
```

---

## 📦 Production Deployment

### 1. Pre-Deployment Checklist

- [ ] All tests passing: `npm test`
- [ ] No console errors: `npm run build` clean
- [ ] Environment variables set correctly
- [ ] Database migrations run (if applicable)
- [ ] Backups taken
- [ ] Rollback plan documented

### 2. Deployment Steps

**Backend:**

```bash
# Build
npm run build

# Test
npm test

# Deploy (via Docker, k8s, or direct)
# Verify health endpoint
curl https://cmd-executor.example.com/api/health

# Tail logs
tail -f logs/backend.log
```

**Electron Worker:**

```bash
# Build installers
npm run build

# Test on staging
./dist/*.exe  # Windows
./dist/*.dmg  # macOS
./dist/*.AppImage  # Linux

# Distribute to users
# Windows: Upload .exe to S3 / app store
# macOS: Upload .dmg to S3 / App Store
# Linux: Upload .AppImage to S3 / repository
```

### 3. Post-Deployment

- [ ] Verify all 12 API routes return 200/401 appropriately
- [ ] Workers can register and connect
- [ ] Jobs submit successfully
- [ ] Jobs execute and complete
- [ ] Results appear in frontend
- [ ] No error logs in backend
- [ ] Monitoring dashboards show healthy metrics

### 4. Rollback Plan

- [ ] Keep previous Docker images: tagged with version
- [ ] Database: enable point-in-time recovery
- [ ] Secrets: keep previous values, rotate only on deploy
- [ ] Rollback command: `docker pull image:previous-version && docker run ...`

---

## ✅ Final Verification

### System Operational Checklist

- [ ] Backend service running and responding
- [ ] MongoDB and Redis connected and healthy
- [ ] At least 1 worker connected and idle
- [ ] Can submit job from web UI
- [ ] Job appears in worker Activity log
- [ ] Job executes successfully
- [ ] Results appear in web UI
- [ ] No errors in any logs
- [ ] Monitoring/alerting configured
- [ ] Backup strategy in place
- [ ] Disaster recovery plan documented

### Go-Live Readiness

- [ ] Product owner sign-off
- [ ] Documentation complete
- [ ] On-call support assigned
- [ ] Incident response plan ready
- [ ] Customer communication sent
- [ ] Training completed (if applicable)

---

## 🎉 Deployment Complete!

After all checkboxes are complete:

1. **Notify stakeholders**: Deployment successful, system operational
2. **Monitor closely**: First 24-48 hours, watch error logs and metrics
3. **Gather feedback**: User experiences, performance, issues
4. **Iterate**: Fix bugs, optimize, plan Phase 2 features
5. **Scale**: Add more workers, increase database capacity as needed

---

## 📞 Support & Troubleshooting

See individual component guides:

- [Backend Setup](./PHASE_4_DEPLOYMENT_SUMMARY.md)
- [Electron Worker Guide](./electron-worker/SETUP_GUIDE.md)
- [Integration Guide](./ELECTRON_INTEGRATION_GUIDE.md)
- [API Reference](./API_REFERENCE.md)

---

**System Status**: 🟢 Ready for Deployment
**Last Updated**: 2024
**Version**: 4.0 (Complete)
