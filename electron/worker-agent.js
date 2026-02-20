#!/usr/bin/env node

/**
 * Worker Agent for Distributed Command Executor - Phase 2
 * 
 * This is a standalone Node.js application that:
 * 1. Registers itself with the central server
 * 2. Sends periodic heartbeat updates
 * 3. Polls for available jobs
 * 4. Downloads and executes jobs inside isolated Docker containers
 * 5. Reports results back to the server
 * 
 * ISOLATION: Every task executes in a short-lived Docker container with:
 * - Read-only root filesystem
 * - No networking
 * - Strict resource limits (CPU, memory)
 * - Hard execution timeout
 * - No privileged mode or Linux capabilities
 * 
 * Run with: node worker-agent.js [--server http://localhost:3000]
 */

import { spawn, execSync } from "child_process";
import { createWriteStream } from "fs";
import { mkdir, readFile, writeFile, rm, access, constants as fsConstants } from "fs/promises";
import { homedir, cpus, freemem, totalmem, type as osType } from "os";
import { join, resolve } from "path";
import { randomUUID, createHmac } from "crypto";
import https from "https";
import http from "http";
import { readFileSync, existsSync } from "fs";
import AdmZip from "adm-zip";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

// Load .env file at startup
dotenv.config();

// Verify environment was loaded
console.log("[STARTUP] Environment configuration:");
console.log(`[STARTUP] WORKER_TOKEN_SECRET: ${process.env.WORKER_TOKEN_SECRET ? "✓ SET" : "✗ NOT SET (using default)"}`);
console.log(`[STARTUP] SERVER_URL (env): ${process.env.SERVER_URL || "not set"}`);
console.log(`[STARTUP] WORKER_ID (env): ${process.env.WORKER_ID || "not set"}`);
console.log(`[STARTUP] VERCEL_BYPASS_TOKEN: ${process.env.VERCEL_BYPASS_TOKEN ? "✓ SET" : "not set"}`);

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const serverIndex = args.indexOf("--server");
const SERVER_URL =
    process.env.SERVER_URL ||  // Environment variable (highest priority for deployment)
    (serverIndex !== -1 && args[serverIndex + 1]
        ? args[serverIndex + 1]
        : "http://localhost:3000");  // Default fallback

const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;
const WORKER_VERSION = "2.0.0-docker"; // Docker-enabled worker
const HOSTNAME = process.env.HOSTNAME || "unknown-host";
const WORKER_TOKEN_SECRET = process.env.WORKER_TOKEN_SECRET || "dev-worker-token-secret";
const VERCEL_BYPASS_TOKEN = process.env.VERCEL_BYPASS_TOKEN || ""; // Optional bypass token for Vercel deployments
const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const JOB_POLL_INTERVAL = 5000; // 5 seconds
const WORK_DIR = join(homedir(), ".cmd-executor-worker");

// Docker execution settings
const DOCKER_TIMEOUT = parseInt(process.env.DOCKER_TIMEOUT || "300000", 10); // 5 minutes (for long-running tasks)
const DOCKER_MEMORY_LIMIT = process.env.DOCKER_MEMORY_LIMIT || "512m"; // 512 MB
const DOCKER_CPU_LIMIT = process.env.DOCKER_CPU_LIMIT || "2.0"; // 2 CPU cores
const ENABLE_DOCKER = (process.env.ENABLE_DOCKER || "true") !== "false";
const DOCKER_NETWORK_MODE = process.env.DOCKER_NETWORK_MODE || "none";
const DOCKER_TMPFS_MB = parseInt(process.env.DOCKER_TMPFS_MB || "1024", 10);
const MAX_PARALLEL_JOBS = parseInt(process.env.MAX_PARALLEL_JOBS || "0", 10); // 0 = auto based on CPU

// Debug: Log the DOCKER_TIMEOUT value
console.log('[WORKER] DOCKER_TIMEOUT env var:', process.env.DOCKER_TIMEOUT);
console.log('[WORKER] Parsed DOCKER_TIMEOUT value:', DOCKER_TIMEOUT, 'ms');

// ============================================================================
// Docker Executor (Sandboxed Task Execution)
// ============================================================================

/**
 * Execute commands inside isolated Docker containers with full sandboxing
 */
class DockerExecutor {
    constructor(
        timeout = DOCKER_TIMEOUT,
        memoryLimit = DOCKER_MEMORY_LIMIT,
        cpuLimit = DOCKER_CPU_LIMIT,
        networkMode = DOCKER_NETWORK_MODE
    ) {
        this.timeout = timeout;
        this.memoryLimit = memoryLimit;
        this.cpuLimit = cpuLimit;
        this.networkMode = networkMode;
    }

    /**
     * Check if Docker is available on the system
     */
    async isDockerAvailable() {
        try {
            execSync("docker --version", { stdio: "pipe" });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Build docker run arguments with strict isolation
     */
    buildDockerRunArgs(containerName, imageName, workspaceDir, command) {
        return [
            "run",
            "--name", containerName,
            "--rm", // Auto-remove on exit
            // ===== ISOLATION & SECURITY =====
            "--read-only", // Read-only root filesystem
            "--cap-drop=ALL", // Drop ALL Linux capabilities
            "--security-opt=no-new-privileges:true", // No privilege escalation
            // ===== NETWORK ISOLATION =====
            `--network=${this.networkMode}`,
            // ===== RESOURCE LIMITS =====
            `--memory=${this.memoryLimit}`,
            `--cpus=${this.cpuLimit}`,
            "--memory-swap=-1", // Disable swap
            "--pids-limit=32", // Max 32 processes
            // ===== WORKSPACE MOUNT =====
            "-v", `${workspaceDir}:/workspace:rw`,
            // ===== WRITABLE PATHS FOR TOOLING =====
            "-e", "HOME=/workspace",
            "-e", "TMPDIR=/workspace/.tmp",
            "-e", "PIP_CACHE_DIR=/workspace/.pip-cache",
            "-e", "PIP_TARGET=/workspace/.pip-packages",
            // ===== TEMP DIRECTORIES (tmpfs) =====
            "--tmpfs=/run:size=10m",
            `--tmpfs=/tmp:size=${Math.max(DOCKER_TMPFS_MB, 64)}m`,
            // ===== WORKING DIRECTORY =====
            "-w", `/workspace`,
            // ===== IMAGE & COMMAND =====
            imageName,
            "/bin/sh", "-c", command,
        ];
    }

    /**
     * Detect runtime from command and return appropriate Docker image
     */
    getDockerImage(command) {
        const cmd = (command || "").toLowerCase();
        if (cmd.includes("python") || cmd.includes("py ")) return "python:3.11-slim";
        if (cmd.includes("node") || cmd.includes("npm")) return "node:22-alpine";
        if (cmd.includes("g++") || cmd.includes("gcc")) return "gcc:14-alpine";
        if (cmd.includes("java") || cmd.includes("javac")) return "eclipse-temurin:21-alpine";
        if (cmd.includes("dotnet")) return "mcr.microsoft.com/dotnet/runtime:8.0-alpine";
        return "alpine:latest"; // Default fallback
    }

    /**
     * Check if Docker image exists locally
     */
    async imageExists(imageName) {
        try {
            execSync(`docker image inspect ${imageName}`, { stdio: "pipe" });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Pull Docker image if not present
     */
    async pullImage(imageName) {
        return new Promise((resolve, reject) => {
            log(`Pulling Docker image: ${imageName}... (this may take a few minutes)`, "INFO");

            const child = spawn("docker", ["pull", imageName], {
                stdio: "inherit",
            });

            // Timeout for image pull (10 minutes)
            const timeout = setTimeout(() => {
                child.kill();
                reject(new Error(`Image pull timed out after 10 minutes`));
            }, 600000);

            child.on("close", (code) => {
                clearTimeout(timeout);
                if (code === 0) {
                    log(`Image ${imageName} pulled successfully`, "SUCCESS");
                    resolve();
                } else {
                    reject(new Error(`docker pull exited with code ${code}`));
                }
            });

            child.on("error", (error) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to spawn docker pull: ${error.message}`));
            });
        });
    }

    /**
     * Execute command inside Docker container with timeout enforcement
     */
    async execute(command, workspaceDir, onDataCallback, jobId, serverUrl) {
        const containerName = `cmd-exec-${randomUUID().slice(0, 12)}`;
        const imageName = this.getDockerImage(command); // Detect image from command

        log(`[Docker] Container name: ${containerName}`, "INFO");
        log(`[Docker] Using image: ${imageName}`, "INFO");
        log(`[Docker] Workspace: ${workspaceDir}`, "INFO");
        log(`[Docker] Timeout: ${this.timeout}ms (${Math.floor(this.timeout / 1000)}s)`, "INFO");
        log(`[Docker] Memory limit: ${this.memoryLimit}`, "INFO");
        log(`[Docker] CPU limit: ${this.cpuLimit}`, "INFO");

        try {
            // Verify Docker is available
            const available = await this.isDockerAvailable();
            if (!available) {
                throw new Error("Docker is not available on this system");
            }
            log(`[Docker] Docker daemon is available`, "SUCCESS");

            // Ensure image is available (pull if needed)
            log(`[Docker] Checking if image ${imageName} exists locally...`, "INFO");
            const exists = await this.imageExists(imageName);
            if (!exists) {
                log(`[Docker] Image not found locally, pulling...`, "WARN");
                await this.pullImage(imageName);
            } else {
                log(`[Docker] Image ${imageName} found locally`, "SUCCESS");
            }

            // Build docker run arguments
            const dockerArgs = this.buildDockerRunArgs(
                containerName,
                imageName,
                workspaceDir,
                command
            );

            log(`[Docker] Starting container with command: docker ${dockerArgs.join(' ')}`, "INFO");
            log(`[Docker] ========== CONTAINER OUTPUT START ==========`, "INFO");

            // Execute with timeout
            return await this.executeDockerContainer(dockerArgs, containerName, onDataCallback, jobId, serverUrl);
        } catch (error) {
            log(`[Docker] Execution failed: ${error.message}`, "ERROR");
            return {
                stdout: "",
                stderr: `Docker execution error: ${error.message}`,
                exitCode: 1,
                timedOut: false,
            };
        }
    }

    /**
     * Execute docker container and capture output
     */
    async executeDockerContainer(dockerArgs, containerName, onDataCallback, jobId, serverUrl) {
        return new Promise((resolve) => {
            let stdout = "";
            let stderr = "";
            let timedOut = false;
            let cancelledByUser = false;

            // Hard timeout - forcefully kill container
            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                try {
                    execSync(`docker kill ${containerName}`, { stdio: "pipe", timeout: 5000 });
                } catch {
                    // Already dead
                }
            }, this.timeout);

            // Periodic cancellation check (every 2 seconds)
            const cancelCheckInterval = setInterval(async () => {
                if (jobId && serverUrl) {
                    try {
                        const checkUrl = `${serverUrl}/api/jobs/check-cancel?jobId=${jobId}`;
                        const response = await httpRequest(
                            "GET",
                            checkUrl
                        );
                        if (response.statusCode === 200) {
                            const data = JSON.parse(response.body);
                            if (data.success && data.cancelRequested) {
                                log(`[Docker] Cancellation requested by user. Killing container ${containerName}...`, "WARN");
                                cancelledByUser = true;
                                clearInterval(cancelCheckInterval);
                                clearTimeout(timeoutHandle);
                                try {
                                    execSync(`docker kill ${containerName}`, { stdio: "pipe", timeout: 5000 });
                                } catch {
                                    // Already dead
                                }
                            }
                        }
                    } catch (error) {
                        // Log errors for debugging
                        log(`[Docker] Cancel check error: ${error.message}`, "WARN");
                    }
                }
            }, 2000); // Check every 2 seconds

            try {
                const child = spawn("docker", dockerArgs, {
                    stdio: ["ignore", "pipe", "pipe"],
                });

                // Capture output streams and log them in real-time
                if (child.stdout) {
                    child.stdout.on("data", (data) => {
                        const text = data.toString();
                        stdout += text;
                        process.stdout.write(text);
                        if (onDataCallback) {
                            onDataCallback({ type: 'stdout', text });
                        }
                    });
                }

                if (child.stderr) {
                    child.stderr.on("data", (data) => {
                        const text = data.toString();
                        stderr += text;
                        process.stderr.write(text);
                        if (onDataCallback) {
                            onDataCallback({ type: 'stderr', text });
                        }
                    });
                }

                // Handle exit
                child.on("close", (code) => {
                    clearTimeout(timeoutHandle);
                    clearInterval(cancelCheckInterval);
                    log(`[Docker] ========== CONTAINER OUTPUT END ==========`, "INFO");
                    log(`[Docker] Container exited with code: ${code}`, code === 0 ? "SUCCESS" : "WARN");

                    if (cancelledByUser) {
                        log(`[Docker] Container was killed due to user cancellation`, "WARN");
                        stderr += `\n[CANCELLED] Job was cancelled by user`;
                    } else if (timedOut) {
                        log(`[Docker] Container was killed due to timeout`, "ERROR");
                        stderr += `\n[TIMEOUT] Container exceeded ${this.timeout}ms timeout and was killed`;
                    }
                    resolve({
                        stdout,
                        stderr,
                        exitCode: cancelledByUser ? 130 : (timedOut ? 124 : (code || 0)),
                        timedOut,
                        cancelled: cancelledByUser,
                    });
                });

                child.on("error", (error) => {
                    clearTimeout(timeoutHandle);
                    clearInterval(cancelCheckInterval);
                    log(`[Docker] Container spawn error: ${error.message}`, "ERROR");
                    resolve({
                        stdout,
                        stderr: stderr + `\nSpawn error: ${error.message}`,
                        exitCode: 1,
                        timedOut: false,
                        cancelled: false,
                    });
                });
            } catch (error) {
                clearTimeout(timeoutHandle);
                clearInterval(cancelCheckInterval);
                log(`[Docker] Container execution error: ${error.message}`, "ERROR");
                resolve({
                    stdout,
                    stderr: stderr + `\nExecution error: ${error.message}`,
                    exitCode: 1,
                    timedOut: false,
                    cancelled: false,
                });
            }
        });
    }
}

// ============================================================================
// Resource Sampling
// ============================================================================

let lastCpuSnapshot = cpus();

const getCpuUsagePercent = () => {
    const current = cpus();

    let idleDiff = 0;
    let totalDiff = 0;

    current.forEach((cpu, index) => {
        const prev = lastCpuSnapshot[index];
        if (!prev) return;

        const prevTimes = prev.times;
        const currTimes = cpu.times;

        const prevTotal = Object.values(prevTimes).reduce((a, b) => a + b, 0);
        const currTotal = Object.values(currTimes).reduce((a, b) => a + b, 0);

        idleDiff += currTimes.idle - prevTimes.idle;
        totalDiff += currTotal - prevTotal;
    });

    lastCpuSnapshot = current;

    if (totalDiff === 0) return 0;
    const usage = 100 - (idleDiff / totalDiff) * 100;
    return Number(usage.toFixed(1));
};

const collectSystemStats = () => {
    return {
        cpuCount: cpus().length,
        cpuUsage: getCpuUsagePercent(),
        ramTotalMb: Math.round(totalmem() / 1024 / 1024),
        ramFreeMb: Math.round(freemem() / 1024 / 1024),
        osType: osType(),
    };
};

/**
 * Get Docker container stats for active job containers
 * Returns aggregated CPU and memory usage for all running cmd-exec containers
 */
const getDockerContainerStats = () => {
    try {
        // Get stats for ALL containers in one command - much more efficient!
        const statsCmd = 'docker stats --no-stream';

        const statsOutput = execSync(statsCmd, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000
        }).trim();

        if (!statsOutput || statsOutput.length === 0) {
            log(`[Docker] Empty output from docker stats`, "WARN");
            return {
                containerCount: 0,
                cpuUsage: 0,
                memoryMb: 0,
                containers: []
            };
        }

        const outputLines = statsOutput.split('\n');

        // Filter for only cmd-exec containers
        let totalCpuUsage = 0;
        let totalMemoryMb = 0;
        const containers = [];
        let cmdExecCount = 0;

        for (let i = 1; i < outputLines.length; i++) {
            const line = outputLines[i].trim();
            if (!line || !line.includes('cmd-exec')) continue; // Skip non-cmd-exec containers

            cmdExecCount++;

            // Split by whitespace: CONTAINER_ID NAME CPU% MEM_USAGE/LIMIT MEM% NET_IO BLOCK_IO PIDS
            const parts = line.split(/\s+/);

            if (parts.length >= 4) {
                // CPU % is at index 2 (e.g., "0.02%")
                const cpuStr = parts[2].replace('%', '');
                const cpu = parseFloat(cpuStr);

                if (!isNaN(cpu)) {
                    totalCpuUsage += cpu;
                    // log(`[Docker] ✓ CPU: ${cpu}% (container: ${parts[0].slice(0, 12)})`, "INFO");
                } else {
                    log(`[Docker] ✗ Invalid CPU: ${parts[2]}`, "WARN");
                }

                // MEM USAGE is at index 3 (e.g., "3.996MiB" from "3.996MiB / 512MiB")
                const memUsageStr = parts[3];
                const memMatch = memUsageStr.match(/^([\d.]+)(B|KiB|MiB|GiB)/i);

                if (memMatch) {
                    let mem = parseFloat(memMatch[1]);
                    const unit = memMatch[2].toUpperCase();

                    // Convert to MB
                    if (unit === 'KIB') mem /= 1024;
                    else if (unit === 'GIB') mem *= 1024;
                    else if (unit === 'B') mem /= (1024 * 1024);
                    // MIB stays as-is

                    const memMb = Math.round(mem);
                    totalMemoryMb += memMb;
                    // log(`[Docker] ✓ Memory: ${memMb}MB (container: ${parts[0].slice(0, 12)})`, "INFO");

                    containers.push({
                        id: parts[0].slice(0, 12),
                        name: parts[1],
                        cpu,
                        memory: memUsageStr
                    });
                } else {
                    log(`[Docker] ✗ Invalid MEM: ${memUsageStr}`, "WARN");
                }
            }
        }

        log(`[Docker] ✔ Containers: ${cmdExecCount} | CPU: ${totalCpuUsage.toFixed(2)}% | RAM: ${totalMemoryMb} MB`, "SUCCESS");


        return {
            containerCount: cmdExecCount,
            cpuUsage: Number(totalCpuUsage.toFixed(2)),
            memoryMb: totalMemoryMb,
            containers
        };
    } catch (error) {
        log(`[Docker] Error getting stats: ${error.message}`, "ERROR");
        return {
            containerCount: 0,
            cpuUsage: 0,
            memoryMb: 0,
            containers: []
        };
    }
};

// ============================================================================
// Logging
// ============================================================================

const log = (msg, level = "INFO") => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;
    const colors = {
        INFO: "\x1b[36m",
        ERROR: "\x1b[31m",
        WARN: "\x1b[33m",
        SUCCESS: "\x1b[32m",
    };
    const reset = "\x1b[0m";
    console.log(`${colors[level]}${prefix}${reset} ${msg}`);
};

// ============================================================================
// HTTP Utilities
// ============================================================================

const httpRequest = (method, url, data, redirectCount = 0) => {
    return new Promise((resolve, reject) => {
        const MAX_REDIRECTS = 5;

        const isHttps = url.startsWith("https");
        const client = isHttps ? https : http;
        const urlObj = new URL(url);

        const options = {
            method,
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": `cmd-executor-worker/${WORKER_VERSION}`,
            },
        };

        // Add Vercel bypass token if available
        if (VERCEL_BYPASS_TOKEN) {
            options.headers['x-vercel-protection-bypass'] = VERCEL_BYPASS_TOKEN;
        }

        let body = "";

        const req = client.request(options, (res) => {
            // Handle redirects (301, 302, 307, 308)
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                if (redirectCount >= MAX_REDIRECTS) {
                    reject(new Error(`Too many redirects (${MAX_REDIRECTS})`));
                    return;
                }

                const redirectUrl = new URL(res.headers.location, url);
                log(`Following redirect to: ${redirectUrl.href}`, "INFO");

                // Follow redirect
                httpRequest(method, redirectUrl.href, data, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            res.on("data", (chunk) => {
                body += chunk;
            });

            res.on("end", () => {
                resolve({ statusCode: res.statusCode || 500, body });
            });
        });

        req.on("error", reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
};

/**
 * Generate JWT token for worker authentication
 */
const generateWorkerToken = (workerId, hostname) => {
    return jwt.sign(
        {
            workerId,
            hostname,
            type: "worker"
        },
        WORKER_TOKEN_SECRET,
        { expiresIn: "24h" }
    );
};

const downloadFile = (url, filePath, workerToken, redirectCount = 0) => {
    return new Promise((resolve, reject) => {
        const MAX_REDIRECTS = 5;

        const isHttps = url.startsWith("https");
        const client = isHttps ? https : http;

        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: {
                "User-Agent": `cmd-executor-worker/${WORKER_VERSION}`,
                "Authorization": `Bearer ${workerToken}`,
                "X-Worker-Token": workerToken,
            },
        };

        // Only set port if it's not empty (URLs without explicit ports have empty string port)
        if (urlObj.port) {
            options.port = urlObj.port;
        }

        // Add Vercel bypass token if available
        if (VERCEL_BYPASS_TOKEN) {
            options.headers['x-vercel-protection-bypass'] = VERCEL_BYPASS_TOKEN;
        }

        log(`[Download] Requesting: ${url}`, "INFO");
        log(`[Download] Headers: Authorization=Bearer ***, X-Worker-Token=***`, "INFO");

        const file = createWriteStream(filePath);
        let bytesReceived = 0;

        const req = client.get(options, (res) => {
            log(`[Download] Response status: ${res.statusCode}`, "INFO");
            log(`[Download] Content-Type: ${res.headers['content-type'] || 'not set'}`, "INFO");
            log(`[Download] Content-Length: ${res.headers['content-length'] || 'not set'}`, "INFO");

            // Handle redirects (301, 302, 307, 308)
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                if (redirectCount >= MAX_REDIRECTS) {
                    file.destroy();
                    res.resume(); // Consume response to free socket
                    reject(new Error(`Too many redirects (${MAX_REDIRECTS})`));
                    return;
                }

                const redirectUrl = new URL(res.headers.location, url);
                log(`[Download] Following redirect to: ${redirectUrl.href}`, "INFO");

                // Destroy the file stream and consume the response
                file.destroy();
                res.resume(); // Consume response to free socket

                // Follow redirect
                downloadFile(redirectUrl.href, filePath, workerToken, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                file.destroy();
                // Capture response body for error details
                let errorBody = "";
                res.on("data", (chunk) => {
                    errorBody += chunk.toString().substring(0, 500); // First 500 chars
                });
                res.on("end", () => {
                    log(`[Download] Error response: ${errorBody}`, "ERROR");
                    reject(new Error(`Download failed: HTTP ${res.statusCode} - ${errorBody}`));
                });
                return;
            }

            // Track bytes received
            res.on("data", (chunk) => {
                bytesReceived += chunk.length;
            });

            res.pipe(file);
        });

        file.on("finish", () => {
            log(`[Download] Complete: ${bytesReceived} bytes received`, "SUCCESS");
            resolve();
        });

        file.on("error", (err) => {
            file.destroy();
            log(`[Download] File write error: ${err.message}`, "ERROR");
            reject(err);
        });

        req.on("error", (err) => {
            file.destroy();
            log(`[Download] Request error: ${err.message}`, "ERROR");
            reject(err);
        });
    });
};

// ============================================================================
// Worker Class
// ============================================================================

class WorkerAgent {
    constructor(workerId, serverUrl) {
        this.workerId = workerId;
        this.serverUrl = serverUrl;
        this.isRunning = false;
        this.activeJobs = new Map();
        this.maxParallel =
            MAX_PARALLEL_JOBS > 0
                ? MAX_PARALLEL_JOBS
                : Math.max(1, Math.floor(cpus().length / 2));
        this.heartbeatTimer = null;
        this.pollTimer = null;
        // Generate worker authentication token
        this.workerToken = generateWorkerToken(workerId, HOSTNAME);
        log(`Generated worker token for ${workerId}`, "INFO");
    }

    async start() {
        if (this.isRunning) {
            log("Worker already running", "WARN");
            return;
        }

        this.isRunning = true;
        log(`Starting worker ${this.workerId}`, "INFO");
        log(`Server: ${this.serverUrl}`, "INFO");
        log(`Work directory: ${WORK_DIR}`, "INFO");
        log(`Max parallel jobs: ${this.maxParallel}`, "INFO");

        // Create work directory
        try {
            await mkdir(WORK_DIR, { recursive: true });
        } catch (e) {
            log(`Failed to create work directory: ${e}`, "ERROR");
        }

        // Register with server
        try {
            await this.register();
            log("Worker registered successfully", "SUCCESS");
        } catch (e) {
            log(`Failed to register: ${e}`, "ERROR");
            this.isRunning = false;
            return;
        }

        // Start heartbeat
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL);

        // Start job polling
        this.pollTimer = setInterval(() => this.pollForJob(), JOB_POLL_INTERVAL);

        log("Worker ready. Waiting for jobs...", "SUCCESS");
    }

    async stop() {
        if (!this.isRunning) return;

        log("Stopping worker...", "INFO");
        this.isRunning = false;

        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        if (this.pollTimer) clearInterval(this.pollTimer);

        log("Worker stopped", "SUCCESS");
    }

    async register() {
        const response = await httpRequest(
            "POST",
            `${this.serverUrl}/api/workers/register`,
            {
                workerId: this.workerId,
                hostname: HOSTNAME,
                os: process.platform,
                cpuCount: cpus().length,
                ...collectSystemStats(),
                version: WORKER_VERSION,
                status: "IDLE",
            }
        );

        if (response.statusCode !== 200) {
            throw new Error(
                `Registration failed: HTTP ${response.statusCode} - ${response.body}`
            );
        }

        const data = JSON.parse(response.body);
        log(`Registered as ${data.workerId}`, "SUCCESS");
    }

    async sendHeartbeat() {
        try {
            const stats = collectSystemStats();
            // log("Collecting docker stats...", "INFO");
            const dockerStats = getDockerContainerStats();
            const agentStatus = this.activeJobs.size > 0 ? "BUSY" : "IDLE";
            const response = await httpRequest(
                "POST",
                `${this.serverUrl}/api/workers/heartbeat`,
                {
                    workerId: this.workerId,
                    cpuUsage: stats.cpuUsage,
                    ramFreeMb: stats.ramFreeMb,
                    ramTotalMb: stats.ramTotalMb,
                    status: agentStatus,
                    // Include Docker container stats
                    dockerContainers: dockerStats.containerCount,
                    dockerCpuUsage: dockerStats.cpuUsage,
                    dockerMemoryMb: dockerStats.memoryMb,
                }
            );

            if (response.statusCode !== 200) {
                log(`Heartbeat failed: HTTP ${response.statusCode}`, "WARN");
            }

            // Log Docker container stats for Electron UI to capture
            // log(`[WORKER-STATS] dockerContainers=${dockerStats.containerCount} dockerCpuUsage=${dockerStats.cpuUsage} dockerMemoryMb=${dockerStats.memoryMb}`, "INFO");
        } catch (e) {
            log(`Heartbeat error: ${e}`, "WARN");
        }
    }

    async pollForJob() {
        if (this.activeJobs.size >= this.maxParallel) {
            return; // At capacity
        }

        try {
            const response = await httpRequest(
                "GET",
                `${this.serverUrl}/api/jobs/get-job?workerId=${this.workerId}`
            );

            if (response.statusCode === 202) {
                // No jobs available
                return;
            }

            if (response.statusCode !== 200) {
                log(`Job poll failed: HTTP ${response.statusCode}`, "WARN");
                return;
            }

            const data = JSON.parse(response.body);
            if (data.success && data.job) {
                this.startJob(data.job);
            }
        } catch (e) {
            log(`Job poll error: ${e}`, "WARN");
        }
    }

    startJob(job) {
        const jobPromise = this.executeJob(job)
            .catch((err) => {
                log(`Job ${job.jobId} execution error: ${err.message}`, "ERROR");
            })
            .finally(() => {
                this.activeJobs.delete(job.jobId);
            });

        this.activeJobs.set(job.jobId, jobPromise);
    }

    async executeJob(job) {
        const jobDir = join(WORK_DIR, job.jobId);
        const zipPath = join(jobDir, job.filename);

        log(`Executing job ${job.jobId}`, "INFO");
        log(`Command: ${job.command}`, "INFO");
        log(`Docker isolation: ${ENABLE_DOCKER ? "ENABLED (Secure)" : "DISABLED (Legacy)"}`, "INFO");

        try {
            // Create job directory
            await mkdir(jobDir, { recursive: true });

            // Download file
            log(`Downloading file from ${job.fileUrl}...`, "INFO");
            const fileUrl = job.fileUrl.startsWith("http")
                ? job.fileUrl
                : `${this.serverUrl}${job.fileUrl}`;

            await downloadFile(fileUrl, zipPath, this.workerToken);
            log(`File downloaded`, "SUCCESS");

            // Validate downloaded file
            const fs = await import('fs/promises');
            const stats = await fs.stat(zipPath);
            log(`Downloaded file size: ${stats.size} bytes`, "INFO");

            if (stats.size === 0) {
                throw new Error("Downloaded file is empty (0 bytes)");
            }

            // Check if it's a valid zip by reading magic bytes
            const buffer = Buffer.alloc(4);
            const fileHandle = await fs.open(zipPath, 'r');
            await fileHandle.read(buffer, 0, 4, 0);
            await fileHandle.close();

            const magicBytes = buffer.toString('hex');
            log(`File magic bytes: ${magicBytes}`, "INFO");

            // ZIP files start with "504b0304" (PK\x03\x04) or "504b0506" (PK\x05\x06)
            if (!magicBytes.startsWith('504b03') && !magicBytes.startsWith('504b05')) {
                // Read first 200 bytes to see what we got
                const previewBuffer = Buffer.alloc(Math.min(200, stats.size));
                const fh = await fs.open(zipPath, 'r');
                await fh.read(previewBuffer, 0, previewBuffer.length, 0);
                await fh.close();

                const preview = previewBuffer.toString('utf8').substring(0, 200);
                log(`File content preview: ${preview}`, "ERROR");
                throw new Error(`Downloaded file is not a valid ZIP (magic bytes: ${magicBytes}). Content: ${preview}`);
            }

            log(`Valid ZIP file confirmed`, "SUCCESS");

            // Extract zip
            log(`Extracting zip file...`, "INFO");
            const zip = new AdmZip(zipPath);
            const extractDir = join(jobDir, "extracted");
            await mkdir(extractDir, { recursive: true });
            zip.extractAllTo(extractDir, true);
            log(`Extraction complete`, "SUCCESS");

            // Execute commands
            const commands = job.command
                .split("\n")
                .map((cmd) => cmd.trim())
                .filter((cmd) => cmd.length > 0);

            let stdout = "";
            let stderr = "";
            let exitCode = 0;

            for (const command of commands) {
                log(`Running: ${command}`, "INFO");
                if (ENABLE_DOCKER) {
                    log(`Execution context: Docker container (isolated, read-only FS, no networking)`, "INFO");
                } else {
                    log(`Execution context: Host process (LEGACY MODE - not isolated!)`, "WARN");
                }

                // Stream output callback - sends data immediately as it arrives
                const streamCallback = async (data) => {
                    try {
                        await httpRequest(
                            "POST",
                            `${this.serverUrl}/api/jobs/stream-output`,
                            {
                                jobId: job.jobId,
                                data: data.text,
                                type: data.type, // 'stdout' or 'stderr'
                            }
                        );
                    } catch (e) {
                        log(`Failed to stream output: ${e.message}`, "WARN");
                    }
                };

                const result = await this.executeCommand(
                    command,
                    extractDir,
                    streamCallback,
                    job.jobId,
                    job.timeoutMs
                );
                stdout += result.stdout;
                stderr += result.stderr;
                exitCode = result.exitCode;

                if (result.stdout) {
                    log(`Output: ${result.stdout.substring(0, 100)}...`, "INFO");
                }
                if (result.stderr) {
                    log(`Errors: ${result.stderr.substring(0, 100)}...`, "WARN");
                }

                if (exitCode !== 0) {
                    log(
                        `Command failed with exit code ${exitCode}. Continuing...`,
                        "WARN"
                    );
                }
            }

            let resultZipBase64 = null;
            let resultZipName = null;
            try {
                resultZipName = `${job.jobId}-results.zip`;
                const resultZipPath = join(jobDir, resultZipName);
                const resultZip = new AdmZip();
                resultZip.addLocalFolder(extractDir);

                const logsContent = `STDOUT\n${stdout}\n\nSTDERR\n${stderr}\n`;
                resultZip.addFile("logs.txt", Buffer.from(logsContent, "utf8"));
                resultZip.writeZip(resultZipPath);

                const resultBuffer = await fs.readFile(resultZipPath);
                resultZipBase64 = resultBuffer.toString("base64");
            } catch (e) {
                log(`Failed to build result zip: ${e.message}`, "WARN");
            }

            // Submit results
            log(`Submitting results to server...`, "INFO");
            const submitResponse = await httpRequest(
                "POST",
                `${this.serverUrl}/api/jobs/submit-result`,
                {
                    jobId: job.jobId,
                    workerId: this.workerId,
                    stdout,
                    stderr,
                    exitCode,
                    resultZipBase64,
                    resultZipName,
                }
            );

            if (submitResponse.statusCode === 200) {
                log(`Job ${job.jobId} completed successfully`, "SUCCESS");
            } else {
                throw new Error(
                    `Failed to submit results: HTTP ${submitResponse.statusCode}`
                );
            }
        } catch (error) {
            log(`Job execution error: ${error.message}`, "ERROR");

            // Report failure
            try {
                await httpRequest(
                    "PUT",
                    `${this.serverUrl}/api/jobs/submit-result`,
                    {
                        jobId: job.jobId,
                        workerId: this.workerId,
                        errorMessage: error.message,
                    }
                );
            } catch (e) {
                log(`Failed to report job failure: ${e}`, "ERROR");
            }
        } finally {
            // Cleanup
            try {
                await rm(jobDir, { recursive: true, force: true });
                log(`Job directory cleaned up`, "INFO");
            } catch (e) {
                log(`Failed to cleanup job directory: ${e}`, "WARN");
            }
        }
    }

    async executeCommand(command, cwd, onDataCallback, jobId, timeoutMs) {
        // Try Docker execution if enabled
        if (ENABLE_DOCKER) {
            return await this.executeCommandDocker(command, cwd, onDataCallback, jobId, timeoutMs);
        } else {
            // Fallback to direct execution
            return await this.executeCommandDirect(command, cwd, onDataCallback);
        }
    }

    /**
     * Execute command inside isolated Docker container (RECOMMENDED)
     * Every command runs in a sandbox with:
     * - Read-only root filesystem
     * - No networking
     * - Resource limits (CPU, memory)
     * - Hard timeout enforcement
     */
    async executeCommandDocker(command, cwd, onDataCallback, jobId, timeoutMs) {
        const dockerExecutor = new DockerExecutor(
            timeoutMs || DOCKER_TIMEOUT,
            DOCKER_MEMORY_LIMIT,
            DOCKER_CPU_LIMIT,
            DOCKER_NETWORK_MODE
        );

        try {
            const result = await dockerExecutor.execute(command, cwd, onDataCallback, jobId, this.serverUrl);

            // Stream output in chunks if callback provided
            if (onDataCallback && result.stdout) {
                onDataCallback({ type: 'stdout', text: result.stdout });
            }
            if (onDataCallback && result.stderr) {
                onDataCallback({ type: 'stderr', text: result.stderr });
            }

            return {
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
            };
        } catch (error) {
            return {
                stdout: "",
                stderr: `Docker execution error: ${error.message}`,
                exitCode: 1,
            };
        }
    }

    /**
     * LEGACY: Execute command directly on host (not recommended - no isolation)
     * Kept for backwards compatibility. Use Docker execution when possible.
     */
    executeCommandDirect(command, cwd, onDataCallback) {
        return new Promise((resolve) => {
            const isWindows = process.platform === "win32";

            let child;
            let finalCommand;
            let args;

            if (isWindows) {
                // On Windows, use cmd.exe with /c flag
                finalCommand = "cmd.exe";
                args = ["/c", command];
            } else {
                // On Unix, use bash
                finalCommand = "/bin/bash";
                args = ["-c", command];
            }

            try {
                child = spawn(finalCommand, args, {
                    cwd,
                    shell: isWindows,  // Use shell on Windows
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: {
                        ...process.env,
                        PYTHONUNBUFFERED: "1",
                        PYTHONIOENCODING: "utf-8",
                    },
                    windowsHide: true,
                });
            } catch (err) {
                resolve({
                    stdout: "",
                    stderr: `Failed to spawn process: ${err.message}`,
                    exitCode: 1,
                });
                return;
            }

            let stdout = "";
            let stderr = "";
            let timedOut = false;

            // Add timeout to prevent hanging
            const timeout = setTimeout(() => {
                timedOut = true;
                child.kill('SIGKILL');
            }, 30000); // 30 second timeout

            if (child.stdout) {
                child.stdout.on("data", (data) => {
                    const text = data.toString();
                    stdout += text;
                    // Stream output immediately if callback provided
                    if (onDataCallback) {
                        onDataCallback({ type: 'stdout', text });
                    }
                });
            }

            if (child.stderr) {
                child.stderr.on("data", (data) => {
                    const text = data.toString();
                    stderr += text;
                    // Stream output immediately if callback provided
                    if (onDataCallback) {
                        onDataCallback({ type: 'stderr', text });
                    }
                });
            }

            child.on("close", (code) => {
                clearTimeout(timeout);
                if (timedOut) {
                    resolve({
                        stdout,
                        stderr: stderr + "\n[TIMEOUT] Process exceeded 30 second limit",
                        exitCode: 124,
                    });
                } else {
                    resolve({
                        stdout,
                        stderr,
                        exitCode: code || 0,
                    });
                }
            });

            child.on("error", (err) => {
                clearTimeout(timeout);
                resolve({
                    stdout,
                    stderr: stderr + `\nExecution error: ${err.message}`,
                    exitCode: 1,
                });
            });
        });
    }
}

// ============================================================================
// Main
// ============================================================================

const main = async () => {
    const agent = new WorkerAgent(WORKER_ID, SERVER_URL);

    // Handle graceful shutdown
    const shutdown = async () => {
        log("Received shutdown signal", "INFO");
        await agent.stop();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    await agent.start();

    // Keep the process alive
    setInterval(() => { }, 1000);
};

main().catch((err) => {
    log(`Fatal error: ${err.message}`, "ERROR");
    process.exit(1);
});
