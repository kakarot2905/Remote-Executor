import { NextRequest, NextResponse } from "next/server";
import { getAllJobs } from "@/lib/models/job";
import { authenticateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  // Require authentication
  const auth = authenticateUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const jobs = (await getAllJobs()).map((job) => ({
      jobId: job.jobId,
      id: job.jobId, // Alias for compatibility
      command: job.command,
      fileUrl: job.fileUrl,
      filename: job.filename,
      status: job.status,
      assignedAgentId: job.assignedAgentId,
      requiredCpu: job.requiredCpu,
      requiredRamMb: job.requiredRamMb,
      timeoutMs: job.timeoutMs,
      containerImage: job.containerImage,
      workDir: job.workDir,
      createdAt: job.createdAt,
      queuedAt: job.queuedAt,
      assignedAt: job.assignedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    }));

    return NextResponse.json(jobs);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch jobs";
    console.error("Error fetching jobs:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
