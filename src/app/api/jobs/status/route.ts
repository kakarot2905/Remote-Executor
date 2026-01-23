import { NextRequest, NextResponse } from "next/server";
import { jobRegistry } from "@/lib/registries";
import { getRedis } from "@/lib/db/redis";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    // Try Redis cache first (fast path for frequent status checks)
    try {
      const redis = getRedis();
      const cachedStatus = await redis.get(`job:status:${jobId}`);
      if (cachedStatus) {
        return NextResponse.json(JSON.parse(cachedStatus));
      }
    } catch (redisError) {
      console.warn(`Redis read error for job:status:${jobId}:`, redisError);
      // Fall through to registry check
    }

    const job = jobRegistry.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const jobData = {
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
    };

    // Cache status in Redis (5-minute TTL for non-finished jobs, 1 hour for completed)
    const ttl = ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)
      ? 3600
      : 300;
    try {
      const redis = getRedis();
      await redis.setex(`job:status:${jobId}`, ttl, JSON.stringify(jobData));
    } catch (redisError) {
      console.warn(`Redis cache error for job:status:${jobId}:`, redisError);
      // Continue without cache
    }

    return NextResponse.json(jobData);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
