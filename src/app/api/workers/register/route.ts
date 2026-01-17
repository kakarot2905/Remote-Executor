import { NextRequest, NextResponse } from "next/server";
import { workerRegistry, saveWorkers } from "@/lib/registries";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workerId, hostname, os: osInfo, cpuCount, version } = body;

    if (!workerId || !hostname) {
      return NextResponse.json(
        { error: "workerId and hostname are required" },
        { status: 400 },
      );
    }

    const workerInfo = {
      workerId,
      hostname,
      os: osInfo || process.platform,
      cpuCount: cpuCount || 1,
      status: "idle" as const,
      lastHeartbeat: Date.now(),
      version: version || "unknown",
      createdAt: Date.now(),
      currentJobId: null,
    };

    workerRegistry.set(workerId, workerInfo);
    saveWorkers();

    return NextResponse.json({
      success: true,
      workerId,
      message: `Worker ${workerId} registered successfully`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  // Return list of all workers (admin endpoint)
  const workers = Array.from(workerRegistry.values());
  return NextResponse.json({ workers, count: workers.length });
}
