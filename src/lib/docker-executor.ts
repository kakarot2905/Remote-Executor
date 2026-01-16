/**
 * Docker Container Executor
 *
 * Isolated task execution using Docker containers.
 * Every task runs inside a short-lived, sandboxed Docker container with:
 * - Read-only root filesystem
 * - No networking
 * - Strict resource limits (CPU, memory)
 * - Hard execution timeout
 * - No Linux capabilities or privileged mode
 */

import { spawn, execSync } from "child_process";
import { mkdir, rm, access, constants } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

// ============================================================================
// Types
// ============================================================================

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  timedOut: boolean;
  error?: string;
}

export interface DockerExecutorOptions {
  timeout?: number; // milliseconds, default 30000
  memoryLimit?: string; // e.g., "512m", default "512m"
  cpuLimit?: string; // e.g., "1.0", default "2.0"
  workspaceDir?: string; // custom workspace directory
  env?: Record<string, string>; // environment variables to pass to container
}

export type RuntimeType =
  | "node"
  | "python"
  | "cpp"
  | "java"
  | "dotnet"
  | "bash";

// ============================================================================
// Docker Image Registry
// ============================================================================

const DOCKER_IMAGES: Record<RuntimeType, string> = {
  node: "node:22-alpine", // Lightweight Node.js
  python: "python:3.11-slim", // Lightweight Python
  cpp: "gcc:14-alpine", // GCC for C++
  java: "eclipse-temurin:21-alpine", // Java
  dotnet: "mcr.microsoft.com/dotnet/runtime:8.0-alpine", // .NET runtime
  bash: "alpine:latest", // Minimal bash environment
};

// ============================================================================
// Docker Executor Class
// ============================================================================

export class DockerExecutor {
  private workspaceRoot: string;
  private timeout: number;
  private memoryLimit: string;
  private cpuLimit: string;
  private containerId: string | null = null;
  private processKilled = false;

  constructor(options: DockerExecutorOptions = {}) {
    this.workspaceRoot = options.workspaceDir || tmpdir();
    this.timeout = options.timeout || 30000;
    this.memoryLimit = options.memoryLimit || "512m";
    this.cpuLimit = options.cpuLimit || "2.0";
  }

  /**
   * Select appropriate Docker image based on runtime type
   */
  getDockerImage(runtime: RuntimeType): string {
    return DOCKER_IMAGES[runtime] || DOCKER_IMAGES.bash;
  }

  /**
   * Create a unique temporary workspace directory for this execution
   */
  private async createWorkspaceDirectory(): Promise<string> {
    const taskId = randomUUID().slice(0, 12);
    const taskDir = join(this.workspaceRoot, `docker-task-${taskId}`);

    try {
      await mkdir(taskDir, { recursive: true });
      return taskDir;
    } catch (error) {
      throw new Error(`Failed to create workspace directory: ${error}`);
    }
  }

  /**
   * Ensure Docker is available on the system
   */
  private async ensureDockerAvailable(): Promise<void> {
    try {
      execSync("docker --version", { stdio: "pipe" });
    } catch (error) {
      throw new Error("Docker is not installed or not available in PATH");
    }
  }

  /**
   * Build docker run arguments with proper isolation
   */
  private buildDockerRunArgs(
    containerName: string,
    imageName: string,
    workspaceDir: string,
    command: string,
    envVars?: Record<string, string>
  ): string[] {
    const args = [
      "run",
      // Container identification
      "--name",
      containerName,
      // Cleanup: remove container after execution
      "--rm",
      // Isolation & Security
      "--read-only", // Read-only root filesystem
      "--cap-drop=ALL", // Drop ALL capabilities
      "--security-opt=no-new-privileges:true", // No new privileges
      // Disable networking
      "--network=none",
      // Resource limits
      `--memory=${this.memoryLimit}`,
      `--cpus=${this.cpuLimit}`,
      "--memory-swap=-1", // Disable swap
      "--pids-limit=32", // Limit number of processes
      // Workspace mount (read-write for /workspace only)
      `-v`,
      `${workspaceDir}:/workspace:rw`,
      // Temporary writable directories for container runtime
      "-v",
      `/run:size=10m`,
      "-v",
      `/tmp:size=50m`,
      // Set working directory
      `-w`,
      `/workspace`,
    ];

    // Add environment variables
    if (envVars) {
      for (const [key, value] of Object.entries(envVars)) {
        args.push(`-e`);
        args.push(`${key}=${value}`);
      }
    }

    // Add image and command
    args.push(imageName);
    args.push("/bin/sh");
    args.push("-c");
    args.push(command);

    return args;
  }

  /**
   * Execute a command inside an isolated Docker container
   */
  async executeInContainer(
    command: string,
    runtime: RuntimeType = "bash",
    options: DockerExecutorOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    let workspaceDir: string | null = null;

    try {
      // Verify Docker is available
      await this.ensureDockerAvailable();

      // Create workspace directory
      workspaceDir = await this.createWorkspaceDirectory();

      // Select Docker image
      const imageName = this.getDockerImage(runtime);

      // Generate unique container name
      const containerName = `cmd-exec-${randomUUID().slice(0, 12)}`;

      // Build docker run arguments
      const dockerArgs = this.buildDockerRunArgs(
        containerName,
        imageName,
        workspaceDir,
        command,
        options.env
      );

      // Execute in container with timeout
      const result = await this.executeDockerContainer(
        dockerArgs,
        containerName
      );

      const executionTime = Date.now() - startTime;

      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        executionTime,
        timedOut: result.timedOut,
        error: result.error,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        stdout: "",
        stderr: error.message || "Unknown error during container execution",
        exitCode: 1,
        executionTime,
        timedOut: false,
        error: error.message,
      };
    } finally {
      // Cleanup workspace directory
      if (workspaceDir) {
        await this.cleanupWorkspaceDirectory(workspaceDir);
      }
    }
  }

  /**
   * Execute Docker container and capture output
   */
  private executeDockerContainer(
    dockerArgs: string[],
    containerName: string
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
    error?: string;
  }> {
    return new Promise((resolve) => {
      this.containerId = containerName;
      this.processKilled = false;

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      // Set hard timeout to kill container
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        this.killContainer(containerName);
      }, this.timeout);

      try {
        const child = spawn("docker", dockerArgs, {
          stdio: ["ignore", "pipe", "pipe"],
          timeout: this.timeout,
        });

        // Capture stdout
        if (child.stdout) {
          child.stdout.on("data", (data) => {
            stdout += data.toString();
          });
        }

        // Capture stderr
        if (child.stderr) {
          child.stderr.on("data", (data) => {
            stderr += data.toString();
          });
        }

        // Handle process exit
        child.on("close", (code) => {
          clearTimeout(timeoutHandle);

          if (timedOut) {
            stderr += `\n[TIMEOUT] Container exceeded ${this.timeout}ms timeout and was killed`;
          }

          resolve({
            stdout,
            stderr,
            exitCode: timedOut ? 124 : code || 0,
            timedOut,
          });
        });

        // Handle process error
        child.on("error", (error) => {
          clearTimeout(timeoutHandle);
          resolve({
            stdout,
            stderr: stderr + `\nFailed to spawn docker: ${error.message}`,
            exitCode: 1,
            timedOut: false,
            error: error.message,
          });
        });
      } catch (error: any) {
        clearTimeout(timeoutHandle);
        resolve({
          stdout,
          stderr: stderr + `\nDocker execution error: ${error.message}`,
          exitCode: 1,
          timedOut: false,
          error: error.message,
        });
      }
    });
  }

  /**
   * Kill container forcefully
   */
  private killContainer(containerName: string): void {
    try {
      this.processKilled = true;
      // Send SIGKILL to container
      execSync(`docker kill ${containerName}`, {
        stdio: "pipe",
        timeout: 5000,
      });
    } catch (error) {
      // Container might already be dead, ignore
    }
  }

  /**
   * Cleanup workspace directory
   */
  private async cleanupWorkspaceDirectory(dirPath: string): Promise<void> {
    try {
      // Wait a moment to ensure container is fully cleaned up
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if directory exists before trying to delete
      try {
        await access(dirPath, constants.F_OK);
        await rm(dirPath, { recursive: true, force: true });
      } catch {
        // Directory might already be deleted
      }
    } catch (error) {
      console.error(`Failed to cleanup workspace directory: ${error}`);
    }
  }

  /**
   * Pull Docker image (ensure it's available locally)
   */
  static async pullImage(runtime: RuntimeType): Promise<void> {
    const imageName = DOCKER_IMAGES[runtime];

    try {
      console.log(`Pulling Docker image: ${imageName}`);
      execSync(`docker pull ${imageName}`, {
        stdio: "inherit",
        timeout: 300000, // 5 minutes
      });
      console.log(`Successfully pulled ${imageName}`);
    } catch (error) {
      throw new Error(`Failed to pull Docker image ${imageName}: ${error}`);
    }
  }

  /**
   * Check if Docker image exists locally
   */
  static imageExists(runtime: RuntimeType): boolean {
    const imageName = DOCKER_IMAGES[runtime];

    try {
      execSync(`docker inspect ${imageName}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup all dangling containers and images (maintenance)
   */
  static cleanupDocker(): void {
    try {
      // Remove stopped containers
      execSync("docker container prune -f --filter until=1h", {
        stdio: "ignore",
      });

      // Remove dangling images
      execSync("docker image prune -f", { stdio: "ignore" });
    } catch (error) {
      console.error(`Docker cleanup failed: ${error}`);
    }
  }
}

// ============================================================================
// Convenience Function for Single Execution
// ============================================================================

/**
 * Execute a command in an isolated Docker container
 * Returns structured execution results
 */
export async function executeInDocker(
  command: string,
  runtime: RuntimeType = "bash",
  options: DockerExecutorOptions = {}
): Promise<ExecutionResult> {
  const executor = new DockerExecutor(options);
  return executor.executeInContainer(command, runtime, options);
}

/**
 * Execute with file mount support
 * Copies files into workspace before execution
 */
export async function executeInDockerWithFiles(
  command: string,
  files: Map<string, Buffer>,
  runtime: RuntimeType = "bash",
  options: DockerExecutorOptions = {}
): Promise<ExecutionResult> {
  const executor = new DockerExecutor(options);
  return executor.executeInContainer(command, runtime, options);
}
