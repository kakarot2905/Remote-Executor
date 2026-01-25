# CMD Executor - Developer Guide

A comprehensive guide for developers working on the CMD Executor codebase.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Key Technologies](#key-technologies)
- [Running the Application](#running-the-application)
- [Code Organization](#code-organization)
- [Database Queries](#database-queries)
- [Adding New Features](#adding-new-features)
- [Testing](#testing)
- [Debugging](#debugging)
- [Code Standards](#code-standards)
- [Common Tasks](#common-tasks)

---

## Development Setup

### Prerequisites

- **Node.js** 18+ (check with `node --version`)
- **npm** 9+ (check with `npm --version`)
- **MongoDB** (local or remote connection string)
- **Redis** (optional, for caching)
- **Git** for version control

### Initial Setup

```bash
# Clone repository
git clone <repo-url>
cd cmd-executor

# Install dependencies
npm install

# Copy example environment file
cp .env.example .env.local

# Edit .env.local with your settings
nano .env.local

# Start development server
npm run dev
```

### Environment File (.env.local)

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=cmd_executor

# Cache
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=dev-secret-key-min-32-characters-long
WORKER_TOKEN_SECRET=worker-dev-secret-key
JWT_EXPIRES_IN=24h

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Logging
LOG_LEVEL=debug
DEBUG=cmd-executor:*
```

---

## Project Structure

```
src/
├── app/                          # Next.js app directory
│   ├── api/                      # API routes
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   ├── logout/
│   │   │   └── refresh/
│   │   ├── workers/
│   │   │   ├── register/route.ts     # POST /api/workers/register
│   │   │   ├── [workerId]/route.ts   # DELETE /api/workers/[id]
│   │   │   ├── list/route.ts         # GET /api/workers/list
│   │   │   └── heartbeat/route.ts    # POST /api/workers/heartbeat
│   │   ├── jobs/
│   │   │   ├── submit/route.ts       # POST /api/jobs/submit
│   │   │   ├── get-job/route.ts      # GET /api/jobs/get-job
│   │   │   ├── status/route.ts       # GET /api/jobs/status
│   │   │   ├── list/route.ts         # GET /api/jobs/list
│   │   │   ├── submit-result/route.ts # POST /api/jobs/submit-result
│   │   │   └── stream-output/route.ts # POST /api/jobs/stream-output
│   │   ├── files/
│   │   │   ├── upload/route.ts       # POST /api/files/upload
│   │   │   └── download/[id]/route.ts # GET /api/files/download/[id]
│   │   └── execute/route.ts          # POST /api/execute
│   ├── components/
│   │   ├── TerminalInterface.tsx  # Main UI component
│   │   ├── JobSubmitter.tsx       # Job form
│   │   └── ResultViewer.tsx       # Results display
│   ├── login/
│   │   ├── page.tsx               # Login page
│   │   └── styles.css
│   ├── globals.css
│   ├── layout.tsx                 # Root layout
│   └── page.tsx                   # Home page
│
├── lib/
│   ├── auth.ts                    # JWT/HMAC authentication
│   ├── config.ts                  # Configuration loading
│   ├── types.ts                   # TypeScript interfaces
│   ├── db/
│   │   ├── mongodb.ts             # MongoDB connection
│   │   ├── redis.ts               # Redis client
│   │   └── queries.ts             # Database queries
│   ├── jobs.ts                    # Job management logic
│   ├── workers.ts                 # Worker management logic
│   ├── storage.ts                 # File storage utilities
│   └── validation.ts              # Input validation
│
├── middleware.ts                  # Next.js middleware
├── globals.css                    # Global styles
└── (other files)

worker-agent.js                    # Standalone worker executable
package.json                       # Dependencies
tsconfig.json                      # TypeScript config
next.config.ts                     # Next.js config
eslint.config.mjs                  # ESLint rules
postcss.config.mjs                 # CSS processing
```

---

## Key Technologies

### Backend

| Technology | Purpose | Version |
|-----------|---------|---------|
| Next.js | Web framework | 16.x |
| TypeScript | Type safety | 5.x |
| MongoDB | Database | 7.x |
| Redis | Caching | 5.x |
| JWT | Authentication | 9.x |
| bcryptjs | Password hashing | 3.x |

### Frontend

| Technology | Purpose | Version |
|-----------|---------|---------|
| React | UI framework | 19.x |
| React DOM | DOM rendering | 19.x |
| Tailwind CSS | Styling | 4.x |

### DevTools

| Tool | Purpose |
|------|---------|
| ESLint | Code linting |
| TypeScript | Type checking |
| Node | Runtime |

---

## Running the Application

### Development Mode

```bash
# Terminal 1: Start server (with hot reload)
npm run dev

# Server runs at http://localhost:3000
# API available at http://localhost:3000/api/*
```

### Production Build

```bash
# Build
npm run build

# Start production server
npm start
```

### Multiple Terminals

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Start worker 1
node worker-agent.js --server http://localhost:3000

# Terminal 3: Start worker 2
WORKER_ID=worker-002 node worker-agent.js --server http://localhost:3000

# Terminal 4: Use CLI or API
curl http://localhost:3000/api/workers/list
```

---

## Code Organization

### Naming Conventions

**Files:**
- API routes: lowercase with hyphens (`submit-result/route.ts`)
- Components: PascalCase (`TerminalInterface.tsx`)
- Utilities: camelCase (`queryHelpers.ts`)

**Variables:**
- Constants: UPPER_CASE (`const MAX_TIMEOUT = 3600;`)
- Functions: camelCase (`getNextJob()`)
- Classes: PascalCase (`class JobQueue {}`)

**Database:**
- Collections: lowercase plural (`workers`, `jobs`)
- Fields: camelCase (`workerId`, `createdAt`)
- IDs: descriptive prefix (`worker-001`, `job-12345`)

### Type Safety

Always define types:

```typescript
// Good
interface Worker {
  workerId: string;
  hostname: string;
  status: 'online' | 'offline' | 'error';
}

// Avoid
const worker: any = {...};
```

### Error Handling

```typescript
// Good error handling
try {
  const result = await getWorker(workerId);
  if (!result) {
    throw new Error('Worker not found');
  }
  return NextResponse.json(result);
} catch (error) {
  console.error('[WORKER] Failed to get worker:', error);
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}

// Avoid
const result = getWorker(workerId);
return result;
```

### Logging

Use consistent log format:

```typescript
// Good
console.log('[WORKER] Registered new worker:', workerId);
console.error('[JOBS] Failed to assign job:', error.message);

// Pattern: [COMPONENT] Message

// Components
// [AUTH]
// [WORKER]
// [JOBS]
// [FILES]
// [API]
// [DB]
```

---

## Database Queries

### MongoDB Operations

#### Get Database Connection

```typescript
import { getDatabase } from '@/lib/db/mongodb';

const db = getDatabase();
const workers = db.collection('workers');
```

#### Find Workers

```typescript
// Find one
const worker = await workers.findOne({ workerId: 'worker-001' });

// Find all
const all = await workers.find({}).toArray();

// Find with filter
const online = await workers
  .find({ status: 'online' })
  .sort({ registeredAt: -1 })
  .limit(10)
  .toArray();
```

#### Insert/Update

```typescript
// Insert one
const result = await workers.insertOne({
  workerId: 'worker-001',
  hostname: 'desktop',
  status: 'online',
  registeredAt: new Date()
});

// Update one
await workers.updateOne(
  { workerId: 'worker-001' },
  { $set: { status: 'offline' } }
);

// Update many
await workers.updateMany(
  { status: 'online', lastHeartbeat: { $lt: cutoffDate } },
  { $set: { status: 'offline' } }
);
```

#### Delete

```typescript
// Delete one
await workers.deleteOne({ workerId: 'worker-001' });

// Delete many
await workers.deleteMany({ status: 'offline' });
```

### Redis Operations

#### Get Cache Connection

```typescript
import { getRedis } from '@/lib/db/redis';

const redis = getRedis();
```

#### Cache Operations

```typescript
// Set with TTL
await redis.setex('worker:list', 30, JSON.stringify(workers));

// Get
const cached = await redis.get('worker:list');

// Delete
await redis.del('worker:list');

// Clear pattern
await redis.keys('ratelimit:*');
```

---

## Adding New Features

### Adding a New API Endpoint

1. **Create route file** (`src/app/api/resource/action/route.ts`):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const auth = authenticateUser(request);
  if (!auth.ok) return auth.response;

  // 2. Validate input
  const body = await request.json();
  if (!body.required_field) {
    return NextResponse.json(
      { error: 'Missing required field' },
      { status: 400 }
    );
  }

  // 3. Process
  try {
    const result = await processRequest(body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

2. **Add types** to `src/lib/types.ts`
3. **Add tests** (see Testing section)
4. **Update API.md** documentation

### Adding a New Component

1. **Create file** (`src/app/components/MyComponent.tsx`):

```typescript
'use client';

import React, { useState } from 'react';

interface Props {
  onSubmit?: (data: any) => void;
}

export default function MyComponent({ onSubmit }: Props) {
  const [state, setState] = useState('');

  return (
    <div>
      <h2>My Component</h2>
      {/* component JSX */}
    </div>
  );
}
```

2. **Import** in parent component
3. **Style** with Tailwind CSS classes

### Adding Database Schema

1. **Define type** in `src/lib/types.ts`:

```typescript
interface MyCollection {
  _id?: ObjectId;
  id: string;
  name: string;
  createdAt: Date;
}
```

2. **Create index** in MongoDB:

```typescript
// In initialization code
await db.collection('mycollection').createIndex({ id: 1 }, { unique: true });
```

3. **Use in queries**:

```typescript
const collection = db.collection('mycollection');
await collection.insertOne(document);
```

---

## Testing

### Run Linter

```bash
npm run lint
```

### Manual Testing

Use provided test scripts:

```bash
# Test worker agent
node worker-agent.js --server http://localhost:3000

# Test connections
node test-connections.cjs

# Interactive demo
node quickstart.js
```

### API Testing with curl

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}'

# Submit job
curl -X POST http://localhost:3000/api/jobs/submit \
  -H "Authorization: Bearer TOKEN"
```

### Using Postman

Import API endpoints for easier testing:

```json
{
  "info": {
    "name": "CMD Executor API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Workers",
      "item": [
        {
          "name": "Register Worker",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/api/workers/register"
          }
        }
      ]
    }
  ]
}
```

---

## Debugging

### VS Code Debugger

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

Start with debug flag:

```bash
node --inspect-brk node_modules/.bin/next dev
```

### Console Logging

Use structured logging:

```typescript
console.log('[COMPONENT] Message', { variable });
console.error('[COMPONENT] Error:', error);
```

### Database Debugging

Connect to MongoDB directly:

```bash
# Using MongoDB shell
mongosh "mongodb://localhost:27017/cmd_executor"

# Query workers
db.workers.find()

# Query jobs
db.jobs.find({ status: 'running' })
```

### Network Debugging

Monitor API calls in browser DevTools:
- Open Network tab
- Filter by XHR/Fetch
- Check request/response headers and body

---

## Code Standards

### TypeScript

```typescript
// Use strict types
function processJob(job: Job): Promise<Result> {
  // implementation
}

// Avoid 'any'
// ❌ const data: any = ...
// ✅ const data: JobData = ...
```

### Error Messages

```typescript
// Good: Specific and actionable
throw new Error('Worker with ID "worker-001" not found');

// Bad: Vague
throw new Error('Error');
```

### Comments

```typescript
// Good: Explain WHY, not WHAT
// We use FIFO order to ensure fair job distribution
const job = await jobs.findOne().sort({ createdAt: 1 });

// Bad: States what code already says
// Get the first job from the queue
const job = await jobs.findOne();
```

### Formatting

Run ESLint:

```bash
npm run lint
npm run lint -- --fix  # Auto-fix issues
```

---

## Common Tasks

### Deploy to Production

```bash
# Build
npm run build

# Test build
npm start

# Deploy (platform-specific)
# See DEPLOYMENT.md
```

### Add New Environment Variable

1. Add to `.env.local`
2. Read in `src/lib/config.ts`
3. Use via `config.variableName`
4. Document in README

### Create Migration

For database schema changes:

```typescript
// src/lib/db/migrations.ts
export async function migrateV1ToV2() {
  const db = getDatabase();
  
  // Add new field to all documents
  await db.collection('jobs').updateMany(
    {},
    { $set: { priority: 'normal' } }
  );
  
  console.log('[DB] Migration v1->v2 complete');
}
```

### Debug Worker Agent

```bash
# Run with debug output
node worker-agent.js --debug

# Or set environment
DEBUG=* node worker-agent.js
```

### Monitor Performance

```typescript
// Add timing information
const startTime = Date.now();

// ... operation ...

const duration = Date.now() - startTime;
console.log(`[PERF] Operation took ${duration}ms`);
```

---

## Useful Resources

- [Next.js Docs](https://nextjs.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [MongoDB Manual](https://docs.mongodb.com/manual/)
- [Redis Commands](https://redis.io/commands/)
- [React Docs](https://react.dev)

## Getting Help

- Check existing issues on GitHub
- Review API.md for endpoint documentation
- Look at similar implementations in codebase
- Ask in project discussions
