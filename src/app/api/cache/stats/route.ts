import { NextRequest, NextResponse } from "next/server";
import { getCacheStats } from "@/lib/redis-cache";

/**
 * Get Redis cache statistics
 * Returns counts of cached workers, jobs, and cancellation flags
 */
export async function GET(request: NextRequest) {
  try {
    const stats = await getCacheStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error("Cache stats error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
