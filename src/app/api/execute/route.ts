import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import os from "os";
import { scheduleJobs } from "@/lib/scheduler";
import { authenticateUser } from "@/lib/auth";
import { uploadFile } from "@/lib/gridfs";

// Track active processes by execution id so we can stop them on demand
const activeProcesses = new Map<string, ReturnType<typeof spawn>>();

// For Phase 2, we support both modes:
// - Mode 1: Direct execution on server (Phase 1 compatibility)
// - Mode 2: Distributed execution via workers (Phase 2)

export async function POST(request: NextRequest) {
  // Require authentication
  const auth = authenticateUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const zipFile = formData.get("file") as File;
    const commands = formData.get("commands") as string;
    const mode = (formData.get("mode") as string) || "direct"; // "direct" or "distributed"

    if (!zipFile || !commands) {
      return NextResponse.json(
        { error: "File and commands are required" },
        { status: 400 },
      );
    }

    // For distributed mode, create a job instead of executing locally
    if (mode === "distributed") {
      return handleDistributedExecution(
        zipFile,
        commands,
        auth.user.username || "anonymous",
      );
    }

    // Phase 1: Direct execution on server (fallback)

    // Create a temporary directory
    const tempDir = path.join(os.tmpdir(), `cmd-executor-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Save the uploaded file
    const buffer = await zipFile.arrayBuffer();
    const zipPath = path.join(tempDir, zipFile.name);
    fs.writeFileSync(zipPath, Buffer.from(buffer));

    // Extract zip file
    const extractDir = path.join(tempDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });

    // Use Node's built-in capabilities to extract
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);

    // Phase 1: Direct execution on server
    // Parse commands (split by newlines)
    const commandList = commands
      .split("\n")
      .map((cmd) => cmd.trim())
      .filter((cmd) => cmd.length > 0);

    const execId = randomUUID();

    // Create a ReadableStream for streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const safeEnqueue = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(chunk);
          } catch (err) {
            closed = true;
          }
        };

        // Heartbeat to keep the connection alive for long/infinite jobs
        const heartbeat = setInterval(() => {
          safeEnqueue("\n");
        }, 5000);

        try {
          // Execute commands in the extracted directory
          for (const command of commandList) {
            safeEnqueue(`\n> ${command}\n${"-".repeat(80)}\n`);

            // Execute command with streaming
            await executeCommandStreaming(
              execId,
              command,
              extractDir,
              controller,
            );
          }

          safeEnqueue(`\n${"=".repeat(80)}\nExecution completed!\n`);
          closed = true;
          controller.close();
        } catch (error: any) {
          safeEnqueue(`\nError: ${error.message}\n`);
          closed = true;
          controller.close();
        } finally {
          clearInterval(heartbeat);
          activeProcesses.delete(execId);
          // Cleanup temp directory
          setTimeout(() => {
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (e) {
              console.error("Cleanup error:", e);
            }
          }, 1000);
        }
      },
      cancel() {
        stopProcess(execId);
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Exec-Id": execId,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

function executeCommandStreaming(
  execId: string,
  command: string,
  workingDir: string,
  controller: ReadableStreamDefaultController<string>,
): Promise<void> {
  return new Promise((resolve) => {
    // Determine the shell based on OS
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd.exe" : "/bin/bash";
    const args = isWindows ? ["/c", command] : ["-c", command];

    // Set environment to unbuffer Python output and enable real-time streaming
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: "1", // Unbuffer Python output
      PYTHONIOENCODING: "utf-8", // Ensure UTF-8 encoding
    };

    let closed = false;
    const safeEnqueue = (chunk: string) => {
      if (closed) return;
      try {
        controller.enqueue(chunk);
      } catch (err) {
        closed = true;
      }
    };

    const child = spawn(shell, args, {
      cwd: workingDir,
      stdio: "pipe",
      shell: true,
      env: env,
    });

    activeProcesses.set(execId, child);

    let hasOutput = false;

    child.stdout?.on("data", (data) => {
      hasOutput = true;
      safeEnqueue(data.toString());
    });

    child.stderr?.on("data", (data) => {
      hasOutput = true;
      safeEnqueue(data.toString());
    });

    child.on("exit", () => {
      activeProcesses.delete(execId);
    });

    child.on("error", (err) => {
      safeEnqueue(`\nExecution error: ${err.message}\n`);
    });

    child.on("close", (code) => {
      if (!hasOutput && code !== 0) {
        safeEnqueue(`Command failed with exit code ${code}\n`);
      } else if (!hasOutput) {
        safeEnqueue("Command executed successfully with no output\n");
      }
      closed = true;
      activeProcesses.delete(execId);
      resolve();
    });
  });
}

function stopProcess(execId: string) {
  const child = activeProcesses.get(execId);
  if (!child) return;

  activeProcesses.delete(execId);

  try {
    if (process.platform === "win32") {
      // taskkill helps terminate the process tree on Windows
      spawn("taskkill", ["/pid", `${child.pid}`, "/t", "/f"]);
    } else {
      child.kill("SIGINT");
      setTimeout(() => child.kill("SIGTERM"), 1000);
    }
  } catch (err) {
    console.error("Failed to stop process", err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const execId = body?.execId as string | undefined;
    if (!execId) {
      return NextResponse.json(
        { error: "execId is required" },
        { status: 400 },
      );
    }

    stopProcess(execId);
    return NextResponse.json({ stopped: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PHASE 2: Distributed Execution Handler
// ============================================================================

async function handleDistributedExecution(
  zipFile: File,
  commands: string,
  username: string,
): Promise<NextResponse> {
  try {
    // Upload file to GridFS instead of file system
    const buffer = Buffer.from(await zipFile.arrayBuffer());

    if (buffer.length === 0) {
      return NextResponse.json(
        { error: "Uploaded zip is empty" },
        { status: 400 },
      );
    }

    const uploadResult = await uploadFile(buffer, zipFile.name, zipFile.type, {
      uploadedBy: username,
      uploadedAt: new Date(),
    });

    // Use GridFS fileId as reference
    const fileUrl = `/api/files/download/${uploadResult.fileId}`;
    const jobId = `job-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Persist job to MongoDB (no in-memory registry)
    const { saveJob } = await import("@/lib/models/job");
    const now = Date.now();
    const job = {
      jobId,
      command: commands,
      fileUrl,
      filename: zipFile.name,
      requiredCpu: 1,
      requiredRamMb: 256,
      timeoutMs: 5 * 60 * 1000,
      status: "QUEUED" as const,
      assignedAgentId: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      resultFileId: null,
      resultFilename: null,
      createdAt: now,
      queuedAt: now,
      assignedAt: null,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      cancelRequested: false,
      attempts: 0,
      maxRetries: 3,
    };

    await saveJob(job as import("@/lib/types").JobRecord);
    scheduleJobs("distributed-upload");

    // Return job ID to client for polling
    return NextResponse.json(
      {
        success: true,
        jobId,
        mode: "distributed",
        message: "Job created. Waiting for idle worker to pick it up.",
        checkStatusUrl: `/api/jobs/status?jobId=${jobId}`,
      },
      { headers: { "X-Job-Id": jobId } },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create distributed job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
