import { NextRequest, NextResponse } from "next/server";
import { jobRegistry } from "@/lib/registries";
import { getRedis } from "@/lib/db/redis";

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Missing jobId" },
        { status: 400 },
      );
    }

    // Try Redis cache first (fast path for frequent checks)
    try {
      const redis = getRedis();
      const cachedStatus = await redis.get(`job:cancel:${jobId}`);
      if (cachedStatus !== null) {
        return NextResponse.json({
          success: true,
          cancelRequested: cachedStatus === "true",
        });
      }
    } catch (redisError) {
      console.warn(`Redis read error for job:cancel:${jobId}:`, redisError);
      // Fall through to registry check
    }

    // Fallback to in-memory registry
    const job = jobRegistry.get(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
    }

    const cancelRequested = job.cancelRequested || false;

    // Cache the result in Redis for subsequent checks (2-minute TTL)
    try {
      const redis = getRedis();
      await redis.setex(
        `job:cancel:${jobId}`,
        120,
        cancelRequested ? "true" : "false",
      );
    } catch (redisError) {
      console.warn(`Redis cache error for job:cancel:${jobId}:`, redisError);
      // Continue without cache
    }

    return NextResponse.json({
      success: true,
      cancelRequested,
    });
  } catch (error) {
    console.error("Check cancel error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
