# CMD Executor - Deployment Guide

## Overview

Your CMD Executor system is now ready for deployment with the following features:

✅ **User Authentication** - Username/password login with JWT tokens  
✅ **MongoDB Storage** - Files stored in GridFS, not file system  
✅ **Protected APIs** - All job and worker endpoints require authentication  
✅ **Electron App** - Desktop app with login interface and MongoDB integration

---

## Quick Start for New Users

### 1. Register a New User

**API Endpoint:**

```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "username": "admin",
  "password": "your-secure-password",
  "email": "admin@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "User created successfully",
  "user": {
    "id": "...",
    "username": "admin",
    "email": "admin@example.com",
    "role": "user"
  }
}
```

### 2. Login

**API Endpoint:**

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-secure-password"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "username": "admin",
    "role": "user"
  }
}
```

### 3. Use the Token

Include the token in all subsequent requests:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Or the cookie `auth_token` will be set automatically for browser requests.

---

## Deployment Steps

### 1. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Production Settings:**

```env
# Database
MONGODB_URI=mongodb://your-mongo-host:27017/cmd-executor
MONGODB_DB=cmd-executor
REDIS_URL=redis://your-redis-host:6379

# Authentication (CHANGE THESE!)
JWT_SECRET=your-super-secret-jwt-key-change-me
JWT_EXPIRES_IN=12h
WORKER_TOKEN_SECRET=your-super-secret-worker-token-change-me

# Security
NODE_ENV=production
ENFORCE_TLS=true
ALLOWED_ORIGINS=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Application

```bash
npm run build
```

### 4. Start MongoDB and Redis

**Using Docker:**

```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
docker run -d -p 6379:6379 --name redis redis:latest
```

**Or install locally:**

- MongoDB: https://www.mongodb.com/try/download/community
- Redis: https://redis.io/download

### 5. Start the Server

```bash
npm start
```

The server will run on `http://localhost:3000`

---

## Using the Electron App

### 1. Start Electron

```bash
cd electron
npm install
npm start
```

### 2. Login

1. Enter your server URL (e.g., `http://localhost:3000`)
2. Enter your username and password
3. Click **Login**

### 3. Register (First Time)

If you don't have an account:

1. Click **Register** link
2. Fill in username, password, and optional email
3. Click **Register**
4. Login with your new credentials

---

## API Endpoints

### Authentication

| Endpoint             | Method | Description           |
| -------------------- | ------ | --------------------- |
| `/api/auth/register` | POST   | Register new user     |
| `/api/auth/login`    | POST   | Login and get token   |
| `/api/auth/logout`   | POST   | Logout (clear cookie) |
| `/api/auth/me`       | GET    | Get current user info |

### Files (Protected)

| Endpoint                       | Method | Description               |
| ------------------------------ | ------ | ------------------------- |
| `/api/files/upload`            | POST   | Upload file to GridFS     |
| `/api/files/download/[fileId]` | GET    | Download file from GridFS |
| `/api/files/list`              | GET    | List all files            |

### Jobs (Protected)

| Endpoint           | Method | Description                        |
| ------------------ | ------ | ---------------------------------- |
| `/api/jobs/create` | POST   | Create new job                     |
| `/api/jobs/list`   | GET    | List all jobs                      |
| `/api/jobs/status` | GET    | Get job status                     |
| `/api/execute`     | POST   | Execute command (distributed mode) |

### Workers

| Endpoint                 | Method | Description      |
| ------------------------ | ------ | ---------------- |
| `/api/workers/register`  | POST   | Register worker  |
| `/api/workers/heartbeat` | POST   | Worker heartbeat |
| `/api/workers/list`      | GET    | List all workers |

---

## File Storage with GridFS

Files are now stored in MongoDB GridFS instead of the file system:

### Upload a File

```bash
POST /api/files/upload
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data

file: <your-file>
```

**Response:**

```json
{
  "success": true,
  "file": {
    "fileId": "507f1f77bcf86cd799439011",
    "filename": "project.zip",
    "contentType": "application/zip",
    "size": 12345,
    "uploadDate": "2026-01-20T..."
  }
}
```

### Download a File

```bash
GET /api/files/download/507f1f77bcf86cd799439011
Authorization: Bearer YOUR_TOKEN
```

The file will be downloaded with proper Content-Type and Content-Disposition headers.

---

## Security Notes

### Production Checklist

- [ ] Change `JWT_SECRET` and `WORKER_TOKEN_SECRET` to strong random values
- [ ] Set `ENFORCE_TLS=true` and use HTTPS
- [ ] Configure `ALLOWED_ORIGINS` to your domain
- [ ] Use strong passwords (minimum 6 characters enforced)
- [ ] Keep MongoDB and Redis secured with authentication
- [ ] Set up firewall rules for your deployment
- [ ] Enable MongoDB authentication in production
- [ ] Use environment-specific configs (staging/production)

### Password Security

- Passwords are hashed using bcrypt with 10 salt rounds
- JWT tokens expire after 12 hours (configurable)
- httpOnly cookies prevent XSS attacks
- Rate limiting prevents brute force attacks

---

## Testing the Setup

### 1. Register a Test User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123","email":"test@example.com"}'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}'
```

Copy the token from the response.

### 3. Upload a File

```bash
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test.zip"
```

### 4. List Jobs

```bash
curl -X GET http://localhost:3000/api/jobs/list \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Troubleshooting

### "Cannot connect to MongoDB"

- Ensure MongoDB is running: `docker ps` or check service status
- Verify MONGODB_URI in .env file
- Check network connectivity

### "Redis connection failed"

- Ensure Redis is running: `docker ps` or check service status
- Verify REDIS_URL in .env file

### "Invalid credentials"

- Check username/password
- Ensure user is registered
- Verify MongoDB has users collection

### "Unauthorized" errors

- Include Authorization header with valid JWT token
- Token may have expired (12h default)
- Re-login to get new token

---

## Production Deployment Options

### Option 1: Docker Compose

Create `docker-compose.yml`:

```yaml
version: "3.8"
services:
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:latest
    ports:
      - "6379:6379"

  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - mongodb
      - redis
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/cmd-executor
      - REDIS_URL=redis://redis:6379

volumes:
  mongo-data:
```

### Option 2: Cloud Platforms

- **Vercel**: Deploy Next.js app
- **MongoDB Atlas**: Cloud MongoDB
- **Redis Cloud**: Cloud Redis
- **DigitalOcean**: VPS hosting
- **AWS/Azure/GCP**: Full cloud infrastructure

---

## Support

For issues or questions:

1. Check the logs: `npm run dev` for detailed errors
2. Verify MongoDB and Redis connections
3. Review .env configuration
4. Check API responses for error messages

---

**Your system is now ready for deployment! 🚀**
