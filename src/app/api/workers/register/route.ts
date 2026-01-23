import { NextRequest, NextResponse } from "next/server";
import { WorkerRecord, AgentStatus } from "@/lib/registries";
import { scheduleJobs } from "@/lib/scheduler";
import { saveWorker } from "@/lib/models/worker";
import { cacheWorker } from "@/lib/redis-cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workerId,
      hostname,
      os: osInfo,
      cpuCount,
      cpuUsage,
      ramTotalMb,
      ramFreeMb,
      version,
      status,
    } = body;

    if (!workerId || !hostname) {
      return NextResponse.json(
        { error: "workerId and hostname are required" },
        { status: 400 },
      );
    }

    const now = Date.now();
    const normalizedStatus: AgentStatus =
      status === "BUSY" || status === "UNHEALTHY" || status === "OFFLINE"
        ? status
        : "IDLE";

    const workerInfo: WorkerRecord = {
      workerId,
      hostname,
      os: osInfo || process.platform,
      cpuCount: Number(cpuCount) || 1,
      cpuUsage: Number(cpuUsage) || 0,
      ramTotalMb: Math.max(0, Math.round(Number(ramTotalMb) || 0)),
      ramFreeMb: Math.max(0, Math.round(Number(ramFreeMb) || 0)),
      version: version || "unknown",
      status: normalizedStatus,
      lastHeartbeat: now,
      createdAt: now,
      updatedAt: now,
      currentJobIds: [],
      reservedCpu: 0,
      reservedRamMb: 0,
      cooldownUntil: null,
    };

    await saveWorker(workerInfo);
    // Warm Redis cache for fast subsequent lookups
    await cacheWorker(workerInfo);

    // Kick scheduler in case queued jobs are waiting
    scheduleJobs("worker-register");

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
