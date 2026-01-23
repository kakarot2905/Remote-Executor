import { NextRequest, NextResponse } from "next/server";
import { jobRegistry, saveJobs } from "@/lib/registries";
import {
  recordWorkerFailure,
  releaseJobResources,
  scheduleJobs,
} from "@/lib/scheduler";
import { updateWorkerHeartbeat as updateWorkerHeartbeatCache } from "@/lib/redis-cache";
import { getRedis } from "@/lib/db/redis";
import { getWorker, updateWorkerStatus } from "@/lib/models/worker";

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

    // Release worker resources and update worker state via Redis + MongoDB
    releaseJobResources(jobId);

    const now = Date.now();
    try {
      const dbWorker = await getWorker(workerId);
      const newJobs = (dbWorker?.currentJobIds || []).filter(
        (id) => id !== jobId,
      );
      const newStatus = newJobs.length === 0 ? "IDLE" : "BUSY";
      await updateWorkerStatus(workerId, newStatus, {
        currentJobIds: newJobs,
        updatedAt: now,
      });
      await updateWorkerHeartbeatCache(workerId, { status: newStatus });
    } catch {}

    saveJobs();

    // Invalidate short-lived cache, keep long-lived cache for completed jobs
    try {
      const redis = getRedis();
      await redis.del(`job:status:${jobId}`);
      // Update with final status (1-hour TTL for completed jobs)
      const finalStatus = {
        jobId,
        status: "COMPLETED",
        stdout,
        stderr,
        exitCode,
        completedAt: job.completedAt,
      };
      await redis.setex(
        `job:status:${jobId}`,
        3600,
        JSON.stringify(finalStatus),
      );
    } catch (redisError) {
      console.warn(`Redis cache update error for job:${jobId}:`, redisError);
    }

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

    const now = Date.now();
    try {
      const dbWorker = await getWorker(workerId);
      const newJobs = (dbWorker?.currentJobIds || []).filter(
        (id) => id !== jobId,
      );
      const newStatus =
        newJobs.length === 0 ? "IDLE" : dbWorker?.status || "IDLE";
      await updateWorkerStatus(workerId, newStatus, {
        currentJobIds: newJobs,
        updatedAt: now,
      });
      await updateWorkerHeartbeatCache(workerId, { status: newStatus });
    } catch {}

    saveJobs();

    // Invalidate cache on failure
    try {
      const redis = getRedis();
      await redis.del(`job:status:${jobId}`);
      await redis.del(`job:cancel:${jobId}`);
      const finalStatus = {
        jobId,
        status: refreshedJob?.status || "FAILED",
        errorMessage: refreshedJob?.errorMessage || errorMessage,
      };
      await redis.setex(
        `job:status:${jobId}`,
        3600,
        JSON.stringify(finalStatus),
      );
    } catch (redisError) {
      console.warn(`Redis cache error for job:${jobId}:`, redisError);
    }

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
