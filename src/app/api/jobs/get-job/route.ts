import { NextRequest, NextResponse } from "next/server";
import { jobRegistry, saveJobs } from "@/lib/registries";
import { scheduleJobs } from "@/lib/scheduler";
import {
  getCachedWorker,
  updateWorkerHeartbeat as updateWorkerHeartbeatCache,
} from "@/lib/redis-cache";
import { getRedis } from "@/lib/db/redis";
import { getWorker, updateWorkerStatus } from "@/lib/models/worker";

export async function GET(request: NextRequest) {
  try {
    const workerId = request.nextUrl.searchParams.get("workerId");

    if (!workerId) {
      return NextResponse.json(
        { success: false, error: "workerId is required" },
        { status: 400 },
      );
    }

    // Prefer Redis cache; fallback to MongoDB. Do not use in-memory worker registry.
    const cachedWorker = await getCachedWorker(workerId);
    const dbWorker = cachedWorker ? null : await getWorker(workerId);
    if (!cachedWorker && !dbWorker) {
      return NextResponse.json(
        { success: false, error: "Worker not found" },
        { status: 404 },
      );
    }

    // Run scheduler to ensure freshest assignments
    scheduleJobs("worker-poll");

    const assignedJob = Array.from(jobRegistry.values()).find(
      (job) => job.status === "ASSIGNED" && job.assignedAgentId === workerId,
    );

    if (!assignedJob) {
      return NextResponse.json(
        {
          success: false,
          message: "No assigned jobs for this worker",
          job: null,
        },
        { status: 202 },
      );
    }

    const now = Date.now();
    assignedJob.status = "RUNNING";
    assignedJob.startedAt = now;
    assignedJob.attempts = (assignedJob.attempts || 0) + 1;

    // Update worker state: Redis fast-path and Mongo persistence; no in-memory registry usage
    try {
      await updateWorkerHeartbeatCache(workerId, { status: "BUSY" });
    } catch {}
    try {
      if (dbWorker) {
        const newJobs = Array.from(
          new Set([...(dbWorker.currentJobIds || []), assignedJob.jobId]),
        );
        await updateWorkerStatus(workerId, "BUSY", {
          currentJobIds: newJobs,
          updatedAt: now,
        });
      } else {
        await updateWorkerStatus(workerId, "BUSY", { updatedAt: now });
      }
    } catch {}

    saveJobs();

    // Cache job in Redis for fast subsequent lookups
    try {
      const redis = getRedis();
      const jobData = {
        jobId: assignedJob.jobId,
        command: assignedJob.command,
        fileUrl: assignedJob.fileUrl,
        filename: assignedJob.filename,
        timeoutMs: assignedJob.timeoutMs,
        status: assignedJob.status,
      };
      await redis.setex(
        `job:${assignedJob.jobId}`,
        3600,
        JSON.stringify(jobData),
      );
      await redis.setex(
        `job:status:${assignedJob.jobId}`,
        300,
        JSON.stringify({
          ...jobData,
          stdout: assignedJob.stdout,
          stderr: assignedJob.stderr,
          startedAt: assignedJob.startedAt,
        }),
      );
    } catch (redisError) {
      console.warn(
        `Redis cache error for job:${assignedJob.jobId}:`,
        redisError,
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        jobId: assignedJob.jobId,
        command: assignedJob.command,
        fileUrl: assignedJob.fileUrl,
        filename: assignedJob.filename,
        timeoutMs: assignedJob.timeoutMs,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
