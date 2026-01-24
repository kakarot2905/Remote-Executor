import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJobStatus } from "@/lib/models/job";
import { getWorker, updateWorkerStatus } from "@/lib/models/worker";
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

    const job = await getJob(jobId);
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
    const now = Date.now();
    await updateJobStatus(jobId, "COMPLETED", {
      stdout: stdout || "",
      stderr: stderr || "",
      exitCode: exitCode !== undefined ? exitCode : null,
      completedAt: now,
      errorMessage: null,
    });

    // Release worker resources and mark idle if nothing else is queued
    await releaseJobResources(jobId);
    const worker = await getWorker(workerId);
    if (worker && (worker.currentJobIds?.length ?? 0) === 0) {
      await updateWorkerStatus(worker.workerId, "IDLE", {
        updatedAt: Date.now(),
      });
    }

    await scheduleJobs("job-finished");

    return NextResponse.json({
      success: true,
      jobId,
      message: "Job result submitted successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
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

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Penalize worker and requeue/mark failed depending on retries
    await recordWorkerFailure(
      workerId,
      errorMessage || "Worker reported failure",
    );

    // Reload job after recordWorkerFailure may have updated state
    const refreshedJob = await getJob(jobId);
    if (refreshedJob && refreshedJob.status !== "FAILED") {
      await updateJobStatus(jobId, refreshedJob.status, {
        errorMessage: errorMessage || refreshedJob.errorMessage || undefined,
      });
    }

    await releaseJobResources(jobId);

    await scheduleJobs("job-failed");

    return NextResponse.json({
      success: true,
      jobId,
      message: "Job failure recorded successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
