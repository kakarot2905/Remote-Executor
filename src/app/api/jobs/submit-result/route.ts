import { NextRequest, NextResponse } from "next/server";
import {
  jobRegistry,
  saveJobs,
  workerRegistry,
  saveWorkers,
} from "@/lib/registries";
import {
  recordWorkerFailure,
  releaseJobResources,
  scheduleJobs,
} from "@/lib/scheduler";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, workerId, stdout, stderr, exitCode } = body;

    if (!jobId || !workerId) {
      return NextResponse.json(
        { error: "jobId and workerId are required" },
        { status: 400 },
      );
    }

    const job = jobRegistry.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify the worker is assigned to this job
    if (job.assignedAgentId !== workerId) {
      return NextResponse.json(
        { error: "Worker is not assigned to this job" },
        { status: 403 },
      );
    }

    // Update job with results
    job.status = "COMPLETED";
    job.stdout = stdout || "";
    job.stderr = stderr || "";
    job.exitCode = exitCode !== undefined ? exitCode : null;
    job.completedAt = Date.now();
    job.errorMessage = null;

    // Release worker resources and mark idle if nothing else is queued
    releaseJobResources(jobId);
    const worker = workerRegistry.get(workerId);
    if (worker && worker.currentJobIds.length === 0) {
      worker.status = "IDLE";
    }

    saveJobs();
    saveWorkers();

    scheduleJobs("job-finished");

    return NextResponse.json({
      success: true,
      jobId,
      message: "Job result submitted successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// Allow workers to mark job as failed
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, workerId, errorMessage } = body;

    if (!jobId || !workerId) {
      return NextResponse.json(
        { error: "jobId and workerId are required" },
        { status: 400 },
      );
    }

    const job = jobRegistry.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Penalize worker and requeue/mark failed depending on retries
    recordWorkerFailure(workerId, errorMessage || "Worker reported failure");

    // Reload job after recordWorkerFailure may have updated state
    const refreshedJob = jobRegistry.get(jobId);
    if (refreshedJob && refreshedJob.status !== "FAILED") {
      refreshedJob.errorMessage = errorMessage || refreshedJob.errorMessage;
    }

    releaseJobResources(jobId);

    saveJobs();
    saveWorkers();

    scheduleJobs("job-failed");

    return NextResponse.json({
      success: true,
      jobId,
      message: "Job failure recorded successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
