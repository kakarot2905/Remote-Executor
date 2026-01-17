import { NextRequest, NextResponse } from "next/server";
import { jobRegistry } from "@/lib/registries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const job = jobRegistry.get(jobId);
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
