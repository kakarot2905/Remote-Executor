import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/models/job";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
      assignedAgentId: job.assignedAgentId,
      command: job.command,
      filename: job.filename,
      stdout: job.stdout,
      stderr: job.stderr,
      exitCode: job.exitCode,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      queuedAt: job.queuedAt,
      assignedAt: job.assignedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      attempts: job.attempts,
      maxRetries: job.maxRetries,
      requiredCpu: job.requiredCpu,
      requiredRamMb: job.requiredRamMb,
      timeoutMs: job.timeoutMs,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
