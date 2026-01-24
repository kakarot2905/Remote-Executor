import { NextRequest, NextResponse } from "next/server";
import { saveJob } from "@/lib/models/job";
import { scheduleJobs } from "@/lib/scheduler";
import { authenticateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  // Require authentication
  const auth = authenticateUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const {
      command,
      fileUrl,
      filename,
      requiredCpu,
      requiredRamMb,
      timeoutMs,
      maxRetries,
    } = body;

    if (!command || !fileUrl || !filename) {
      return NextResponse.json(
        {
          error: "command, fileUrl, and filename are required",
        },
        { status: 400 },
      );
    }

    const jobId = `job-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const now = Date.now();

    const job = {
      jobId,
      command,
      fileUrl,
      filename,
      requiredCpu: Number(requiredCpu) || 1,
      requiredRamMb: Number(requiredRamMb) || 256,
      timeoutMs: Number(timeoutMs) || 5 * 60 * 1000,
      status: "QUEUED" as const,
      assignedAgentId: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      createdAt: now,
      queuedAt: now,
      assignedAt: null,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      cancelRequested: false,
      attempts: 0,
      maxRetries: maxRetries !== undefined ? Number(maxRetries) : 3,
    };

    await saveJob(job);
    await scheduleJobs("job-created");

    return NextResponse.json({
      success: true,
      jobId,
      message: "Job created successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Require authentication
  const auth = authenticateUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { getAllJobs } = await import("@/lib/models/job");
    const jobs = await getAllJobs();
    return NextResponse.json({ jobs, count: jobs.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
