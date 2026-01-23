import { NextRequest, NextResponse } from "next/server";
import { getAllWorkers } from "@/lib/models/worker";
import { getCachedWorkerList, cacheWorkerList } from "@/lib/redis-cache";

export async function GET(request: NextRequest) {
  try {
    // Try Redis-cached worker list first
    const cached = await getCachedWorkerList();
    if (cached) {
      const { workers } = cached;
      return NextResponse.json({
        success: true,
        workers,
        totalWorkers: workers.length,
        idleWorkers: workers.filter((w) => w.status === "IDLE").length,
        busyWorkers: workers.filter((w) => w.status === "BUSY").length,
        unhealthyWorkers: workers.filter((w) => w.status === "UNHEALTHY")
          .length,
        cached: true,
      });
    }

    // Fallback: load from MongoDB and cache for short TTL
    const workers = await getAllWorkers();
    await cacheWorkerList(workers);

    return NextResponse.json({
      success: true,
      workers,
      totalWorkers: workers.length,
      idleWorkers: workers.filter((w) => w.status === "IDLE").length,
      busyWorkers: workers.filter((w) => w.status === "BUSY").length,
      unhealthyWorkers: workers.filter((w) => w.status === "UNHEALTHY").length,
      cached: false,
    });
  } catch (error) {
    console.error("List workers error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
