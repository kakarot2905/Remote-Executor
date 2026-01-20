import { NextRequest, NextResponse } from "next/server";
import { jobRegistry } from "@/lib/registries";

export async function GET(request: NextRequest) {
  try {
    // Convert Map to array of objects
    const jobs = Array.from(jobRegistry.values()).map((job) => ({
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
  } catch (error: any) {
    console.error("Error fetching jobs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch jobs" },
      { status: 500 },
    );
  }
}
