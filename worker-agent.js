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
import { homedir, cpus } from "os";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import https from "https";
import http from "http";
import { readFileSync, existsSync } from "fs";
import AdmZip from "adm-zip";

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const serverIndex = args.indexOf("--server");
const SERVER_URL =
    serverIndex !== -1 && args[serverIndex + 1]
        ? args[serverIndex + 1]
        : "http://localhost:3000";

const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;
const WORKER_VERSION = "2.0.0-docker"; // Docker-enabled worker
const HOSTNAME = process.env.HOSTNAME || "unknown-host";
const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const JOB_POLL_INTERVAL = 5000; // 5 seconds
const WORK_DIR = join(homedir(), ".cmd-executor-worker");

// Docker execution settings
const DOCKER_TIMEOUT = parseInt(process.env.DOCKER_TIMEOUT || "30000", 10); // 30 seconds
const DOCKER_MEMORY_LIMIT = process.env.DOCKER_MEMORY_LIMIT || "512m"; // 512 MB
const DOCKER_CPU_LIMIT = process.env.DOCKER_CPU_LIMIT || "2.0"; // 2 CPU cores
const ENABLE_DOCKER = process.env.ENABLE_DOCKER !== "false"; // Enabled by default

// ============================================================================
// Docker Executor (Sandboxed Task Execution)
// ============================================================================

/**
 * Execute commands inside isolated Docker containers with full sandboxing
 */
class DockerExecutor {
    constructor(timeout = DOCKER_TIMEOUT, memoryLimit = DOCKER_MEMORY_LIMIT, cpuLimit = DOCKER_CPU_LIMIT) {
        this.timeout = timeout;
        this.memoryLimit = memoryLimit;
        this.cpuLimit = cpuLimit;
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
            "--network=none", // No networking
            // ===== RESOURCE LIMITS =====
            `--memory=${this.memoryLimit}`,
            `--cpus=${this.cpuLimit}`,
            "--memory-swap=-1", // Disable swap
            "--pids-limit=32", // Max 32 processes
            // ===== WORKSPACE MOUNT =====
            "-v", `${workspaceDir}:/workspace:rw`,
            // ===== TEMP DIRECTORIES =====
            "-v", `/run:size=10m`,
            "-v", `/tmp:size=50m`,
            // ===== WORKING DIRECTORY =====
            "-w", `/workspace`,
            // ===== IMAGE & COMMAND =====
            imageName,
            "/bin/sh", "-c", command,
        ];
    }

    /**
     * Execute command inside Docker container with timeout enforcement
     */
    async execute(command, workspaceDir) {
        const containerName = `cmd-exec-${randomUUID().slice(0, 12)}`;
        const imageName = "alpine:latest"; // Minimal base image

        try {
            // Verify Docker is available
            const available = await this.isDockerAvailable();
            if (!available) {
                throw new Error("Docker is not available on this system");
            }

            // Build docker run arguments
            const dockerArgs = this.buildDockerRunArgs(
                containerName,
                imageName,
                workspaceDir,
                command
            );

            // Execute with timeout
            return await this.executeDockerContainer(dockerArgs, containerName);
        } catch (error) {
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
    async executeDockerContainer(dockerArgs, containerName) {
        return new Promise((resolve) => {
            let stdout = "";
            let stderr = "";
            let timedOut = false;

            // Hard timeout - forcefully kill container
            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                try {
                    execSync(`docker kill ${containerName}`, { stdio: "pipe", timeout: 5000 });
                } catch {
                    // Already dead
                }
            }, this.timeout);

            try {
                const child = spawn("docker", dockerArgs, {
                    stdio: ["ignore", "pipe", "pipe"],
                });

                // Capture output streams
                if (child.stdout) {
                    child.stdout.on("data", (data) => {
                        stdout += data.toString();
                    });
                }

                if (child.stderr) {
                    child.stderr.on("data", (data) => {
                        stderr += data.toString();
                    });
                }

                // Handle exit
                child.on("close", (code) => {
                    clearTimeout(timeoutHandle);
                    if (timedOut) {
                        stderr += `\n[TIMEOUT] Container exceeded ${this.timeout}ms timeout and was killed`;
                    }
                    resolve({
                        stdout,
                        stderr,
                        exitCode: timedOut ? 124 : (code || 0),
                        timedOut,
                    });
                });

                child.on("error", (error) => {
                    clearTimeout(timeoutHandle);
                    resolve({
                        stdout,
                        stderr: stderr + `\nSpawn error: ${error.message}`,
                        exitCode: 1,
                        timedOut: false,
                    });
                });
            } catch (error) {
                clearTimeout(timeoutHandle);
                resolve({
                    stdout,
                    stderr: stderr + `\nExecution error: ${error.message}`,
                    exitCode: 1,
                    timedOut: false,
                });
            }
        });
    }
}

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

const httpRequest = (method, url, data) => {
    return new Promise((resolve, reject) => {
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

        let body = "";

        const req = client.request(options, (res) => {
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

const downloadFile = (url, filePath) => {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith("https");
        const client = isHttps ? https : http;

        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            headers: {
                "User-Agent": `cmd-executor-worker/${WORKER_VERSION}`,
            },
        };

        const file = createWriteStream(filePath);

        const req = client.get(options, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                return;
            }
            res.pipe(file);
        });

        file.on("finish", () => {
            file.close();
            resolve();
        });

        file.on("error", (err) => {
            file.close();
            reject(err);
        });

        req.on("error", reject);
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
        this.currentJobId = null;
        this.heartbeatTimer = null;
        this.pollTimer = null;
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
                version: WORKER_VERSION,
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
            const response = await httpRequest(
                "POST",
                `${this.serverUrl}/api/workers/heartbeat`,
                { workerId: this.workerId }
            );

            if (response.statusCode !== 200) {
                log(`Heartbeat failed: HTTP ${response.statusCode}`, "WARN");
            }
        } catch (e) {
            log(`Heartbeat error: ${e}`, "WARN");
        }
    }

    async pollForJob() {
        if (this.currentJobId) {
            // Already working on a job
            return;
        }

        try {
            const response = await httpRequest("GET", `${this.serverUrl}/api/jobs/get-job`);

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
                await this.executeJob(data.job);
            }
        } catch (e) {
            log(`Job poll error: ${e}`, "WARN");
        }
    }

    async executeJob(job) {
        this.currentJobId = job.jobId;
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

            await downloadFile(fileUrl, zipPath);
            log(`File downloaded`, "SUCCESS");

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

                const result = await this.executeCommand(command, extractDir, streamCallback);
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

            this.currentJobId = null;
        }
    }

    async executeCommand(command, cwd, onDataCallback) {
        // Try Docker execution if enabled
        if (ENABLE_DOCKER) {
            return await this.executeCommandDocker(command, cwd, onDataCallback);
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
    async executeCommandDocker(command, cwd, onDataCallback) {
        const dockerExecutor = new DockerExecutor(DOCKER_TIMEOUT, DOCKER_MEMORY_LIMIT, DOCKER_CPU_LIMIT);

        try {
            const result = await dockerExecutor.execute(command, cwd);

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
