import { NextRequest, NextResponse } from "next/server";
import { jobRegistry, saveJobs } from "@/lib/registries";
import { scheduleJobs } from "@/lib/scheduler";

export async function POST(request: NextRequest) {
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

    jobRegistry.set(jobId, job);
    saveJobs();
    scheduleJobs("job-created");

    return NextResponse.json({
      success: true,
      jobId,
      message: "Job created successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  // Return list of all jobs (admin endpoint)
  const jobs = Array.from(jobRegistry.values());
  return NextResponse.json({ jobs, count: jobs.length });
}
