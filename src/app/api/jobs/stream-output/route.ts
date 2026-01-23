import { NextRequest, NextResponse } from "next/server";
import { jobRegistry, saveJobs } from "@/lib/registries";
import { getRedis } from "@/lib/db/redis";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, data, type } = body;

    if (!jobId || !data || !type) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    const job = jobRegistry.get(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
    }

    // Append streamed data to job output in real-time
    if (type === "stdout") {
      job.stdout = (job.stdout || "") + data;
    } else if (type === "stderr") {
      job.stderr = (job.stderr || "") + data;
    }

    // Update last modified timestamp
    job.lastStreamedAt = Date.now();

    // Save to persist the streamed output
    await saveJobs();

    // Update Redis cache with streamed output for fast status queries
    try {
      const redis = getRedis();
      const cachedStatus = await redis.get(`job:status:${jobId}`);
      if (cachedStatus) {
        const statusData = JSON.parse(cachedStatus);
        statusData.stdout = job.stdout;
        statusData.stderr = job.stderr;
        statusData.lastStreamedAt = job.lastStreamedAt;
        // Use shorter TTL for actively streaming jobs (5 min)
        await redis.setex(
          `job:status:${jobId}`,
          300,
          JSON.stringify(statusData),
        );
      }
    } catch (redisError) {
      console.warn(`Redis cache update error for job:${jobId}:`, redisError);
      // Continue without cache
    }

    return NextResponse.json({
      success: true,
      message: "Output streamed successfully",
    });
  } catch (error) {
    console.error("Stream output error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
