# CMD Executor - Deployment Guide

Complete guide for deploying CMD Executor to production environments.

## Table of Contents

- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Local Deployment](#local-deployment)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Scaling](#scaling)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

- [ ] Update `package.json` version
- [ ] Run tests: `npm run lint`
- [ ] Build: `npm run build`
- [ ] Set environment variables
- [ ] Backup database
- [ ] Set up monitoring
- [ ] Configure SSL/TLS
- [ ] Test worker registration
- [ ] Set up log aggregation

---

## Local Deployment

### Production Environment File

Create `.env.production.local`:

```env
# Server
PORT=3000
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/cmd_executor?retryWrites=true&w=majority
MONGODB_DB=cmd_executor

# Cache
REDIS_URL=redis://:password@redis-host:6379/0

# Security
JWT_SECRET=<generate-strong-secret>
WORKER_TOKEN_SECRET=<generate-strong-secret>
JWT_EXPIRES_IN=24h

# CORS
ALLOWED_ORIGINS=https://example.com,https://api.example.com
ENFORCE_TLS=true

# Logging
LOG_LEVEL=info
DEBUG=

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=<app-password>
```

### Generate Secrets

```bash
# Generate secure random secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Build and Start

```bash
# Build
npm run build

# Start server (will use .env.production.local)
npm start

# Or use PM2 for process management
npm install -g pm2
pm2 start npm --name "cmd-executor" -- start
pm2 save
pm2 startup
```

---

## Docker Deployment

### Dockerfile

Create `Dockerfile`:

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY next.config.ts ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY src ./src
COPY public ./public

# Build
RUN npm run build

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# Create upload directory
RUN mkdir -p public/uploads

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
USER nextjs

EXPOSE 3000

CMD ["npm", "start"]
```

### Build and Run

```bash
# Build image
docker build -t cmd-executor:1.0.0 .

# Run container
docker run -d \
  --name cmd-executor \
  -p 3000:3000 \
  -e MONGODB_URI=mongodb://mongo:27017 \
  -e REDIS_URL=redis://redis:6379 \
  -e JWT_SECRET=<secret> \
  -e WORKER_TOKEN_SECRET=<secret> \
  -v uploads:/app/public/uploads \
  cmd-executor:1.0.0

# View logs
docker logs -f cmd-executor
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # Server
  server:
    build: .
    container_name: cmd-executor-server
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://mongo:27017
      MONGODB_DB: cmd_executor
      REDIS_URL: redis://redis:6379/0
      JWT_SECRET: ${JWT_SECRET}
      WORKER_TOKEN_SECRET: ${WORKER_TOKEN_SECRET}
      ALLOWED_ORIGINS: http://localhost:3000,http://server:3000
      ENFORCE_TLS: "false"
    depends_on:
      - mongo
      - redis
    volumes:
      - uploads:/app/public/uploads
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 3s
      retries: 3

  # MongoDB
  mongo:
    image: mongo:7.0
    container_name: cmd-executor-mongo
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
      MONGO_INITDB_DATABASE: cmd_executor
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    container_name: cmd-executor-redis
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: cmd-executor-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - server
    restart: unless-stopped

volumes:
  mongo-data:
  redis-data:
  uploads:

networks:
  default:
    name: cmd-executor-net
```

**Start stack:**

```bash
# Copy .env.docker
cp .env.example .env.docker

# Edit with your values
nano .env.docker

# Start
docker-compose up -d

# View logs
docker-compose logs -f server
```

---

## Cloud Deployment

### AWS Deployment (EC2 + RDS)

```bash
# 1. Create EC2 instance (Ubuntu 22.04)
# - Security group: Allow 80, 443, 3000
# - Instance: t3.medium (2 CPU, 4GB RAM)

# 2. SSH into instance
ssh -i key.pem ubuntu@instance-ip

# 3. Install dependencies
sudo apt update
sudo apt install -y nodejs npm git

# 4. Clone repository
git clone <repo-url>
cd cmd-executor

# 5. Install app dependencies
npm ci --production

# 6. Set environment variables
nano .env.production.local
# Add MONGODB_URI pointing to RDS, etc.

# 7. Build
npm run build

# 8. Use PM2 for process management
npm install -g pm2
pm2 start npm --name "cmd-executor" -- start
pm2 save
pm2 startup
pm2 monit

# 9. Configure nginx reverse proxy
sudo apt install nginx
# See nginx.conf below

# 10. SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly -d example.com
```

### Google Cloud Deployment (Cloud Run)

```bash
# 1. Build and push image
gcloud builds submit --tag gcr.io/PROJECT/cmd-executor

# 2. Deploy to Cloud Run
gcloud run deploy cmd-executor \
  --image gcr.io/PROJECT/cmd-executor \
  --platform managed \
  --region us-central1 \
  --set-env-vars MONGODB_URI=<uri>,REDIS_URL=<url> \
  --memory 2Gi \
  --cpu 2
```

### Azure Deployment (App Service)

```bash
# 1. Create resource group
az group create --name cmd-executor --location eastus

# 2. Create App Service plan
az appservice plan create \
  --name cmd-executor-plan \
  --resource-group cmd-executor \
  --sku B2

# 3. Create web app
az webapp create \
  --resource-group cmd-executor \
  --plan cmd-executor-plan \
  --name cmd-executor-app

# 4. Deploy code
git clone <repo>
cd cmd-executor
az webapp up --name cmd-executor-app --resource-group cmd-executor
```

---

## Nginx Configuration

Create `nginx.conf`:

```nginx
upstream backend {
    server server:3000;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name example.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Compression
    gzip on;
    gzip_types text/plain application/json application/javascript;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;

    # Proxy to backend
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # API rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://backend;
        # ... other settings ...
    }

    # Static files (cache)
    location ~* ^/(images|javascript|stylesheets)/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Scaling

### Horizontal Scaling (Multiple Servers)

```
┌─────────────────────────────────────┐
│          Load Balancer              │
│     (nginx, HAProxy, or cloud)      │
└────────┬────────────┬───────────────┘
         │            │
    ┌────▼──┐    ┌────▼──┐
    │ Srv 1 │    │ Srv 2 │
    │:3000  │    │:3000  │
    └────┬──┘    └────┬──┘
         │            │
         └────┬───────┘
              │
         ┌────▼────┐
         │ MongoDB │
         │(shared) │
         └─────────┘
```

### Load Balancer Configuration (nginx)

```nginx
upstream backend {
    least_conn;  # Load balancing method
    server server1:3000 weight=5;
    server server2:3000 weight=5;
    server server3:3000 backup;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend;
    }
}
```

### Auto-Scaling (Kubernetes)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cmd-executor-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cmd-executor
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

---

## Monitoring

### Health Checks

```bash
# Manual health check
curl http://localhost:3000/api/health

# Automated (cron job)
*/5 * * * * curl -f http://localhost:3000/api/health || systemctl restart cmd-executor
```

### Metrics to Monitor

**Server Metrics:**
- CPU usage
- Memory usage
- Disk space
- Network I/O
- Request latency
- Error rates

**Application Metrics:**
- Active workers
- Queued jobs
- Completed jobs
- Average execution time
- Failed jobs

### Logging Setup

**Application Logs:**
```bash
# View logs
docker-compose logs -f server

# Export logs
docker-compose logs server > app.log
```

**System Logs:**
```bash
# View system logs
journalctl -u cmd-executor -f

# MongoDB logs
docker-compose logs -f mongo
```

### Log Aggregation (ELK Stack)

```yaml
# In docker-compose.yml
elasticsearch:
  image: elasticsearch:8.0.0
  environment:
    - discovery.type=single-node

kibana:
  image: kibana:8.0.0
  ports:
    - "5601:5601"
```

---

## Troubleshooting

### Server Won't Start

```bash
# Check logs
docker-compose logs server

# Common issues:
# - Port 3000 in use: lsof -i :3000
# - MongoDB connection: check MONGODB_URI
# - Redis connection: check REDIS_URL
```

### Workers Can't Connect

```bash
# Test server connectivity
curl http://server:3000/api/health

# Check worker logs
docker logs worker-agent

# Verify ALLOWED_ORIGINS includes worker
```

### Database Issues

```bash
# Connect to MongoDB
mongosh "mongodb://localhost:27017"

# Check collections
show collections

# Check indexes
db.workers.getIndexes()

# Reindex if needed
db.workers.reIndex()
```

### Disk Space Issues

```bash
# Check disk usage
df -h

# Clean old uploads
find public/uploads -type f -mtime +30 -delete

# Compress logs
gzip app.log
```

---

## Backup and Recovery

### Database Backup

```bash
# Manual backup
mongodump --uri "mongodb://localhost:27017" --out backup/

# Automated daily backup
0 2 * * * mongodump --uri "mongodb://localhost:27017" --out /backup/$(date +\%Y\%m\%d)/
```

### File Backup

```bash
# Backup uploads directory
tar -czf uploads-backup.tar.gz public/uploads/

# Restore
tar -xzf uploads-backup.tar.gz
```

### Disaster Recovery

```bash
# 1. Restore database
mongorestore /backup/date/

# 2. Restore files
tar -xzf uploads-backup.tar.gz -C public/

# 3. Restart services
docker-compose restart

# 4. Verify
curl http://localhost:3000/api/health
```

---

## Security Hardening

### SSL/TLS

```bash
# Generate self-signed cert (testing only)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365

# Use Let's Encrypt in production
certbot certonly --standalone -d example.com
```

### Firewall Rules

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw deny 3000/tcp   # Block direct access
```

### Secrets Management

```bash
# Use environment variables
export JWT_SECRET=$(openssl rand -hex 32)

# Or secrets manager
aws secretsmanager create-secret --name cmd-executor/jwt-secret
```

### Database Security

```bash
# Enable authentication
mongod --auth

# Create admin user
db.createUser({
  user: "admin",
  pwd: "strong-password",
  roles: ["root"]
})
```
