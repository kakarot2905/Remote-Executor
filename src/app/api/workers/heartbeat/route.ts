import { NextRequest, NextResponse } from "next/server";
import { AgentStatus } from "@/lib/registries";
import { scheduleJobs } from "@/lib/scheduler";
import {
  getWorker,
  updateWorkerHeartbeat as updateWorkerHeartbeatDb,
} from "@/lib/models/worker";
import {
  getCachedWorker,
  updateWorkerHeartbeat as updateWorkerHeartbeatCache,
  shouldWriteWorkerToMongo,
} from "@/lib/redis-cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workerId,
      cpuUsage,
      ramFreeMb,
      ramTotalMb,
      status,
      dockerContainers,
      dockerCpuUsage,
      dockerMemoryMb,
    } = body;

    if (!workerId) {
      return NextResponse.json(
        { error: "workerId is required" },
        { status: 400 },
      );
    }

    // Prefer Redis (fast), fallback to MongoDB
    const cached = await getCachedWorker(workerId);
    let exists = !!cached;
    if (!exists) {
      const dbWorker = await getWorker(workerId);
      exists = !!dbWorker;
    }
    if (!exists) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const now = Date.now();
    const normalizedStatus: AgentStatus =
      status === "BUSY" || status === "UNHEALTHY" || status === "OFFLINE"
        ? status
        : "IDLE";

    // Update Redis cache (fast path)
    await updateWorkerHeartbeatCache(workerId, {
      cpuUsage: Number(cpuUsage) || 0,
      ramFreeMb:
        ramFreeMb !== undefined
          ? Math.max(0, Math.round(Number(ramFreeMb)))
          : undefined,
      ramTotalMb:
        ramTotalMb !== undefined
          ? Math.max(0, Math.round(Number(ramTotalMb)))
          : undefined,
      status: normalizedStatus,
      dockerContainers:
        dockerContainers !== undefined ? Number(dockerContainers) : undefined,
      dockerCpuUsage:
        dockerCpuUsage !== undefined ? Number(dockerCpuUsage) : undefined,
      dockerMemoryMb:
        dockerMemoryMb !== undefined ? Number(dockerMemoryMb) : undefined,
    });

    // Persist to MongoDB (authoritative store) on a throttled schedule
    if (await shouldWriteWorkerToMongo(workerId, 30)) {
      await updateWorkerHeartbeatDb(workerId, {
        cpuUsage: Number(cpuUsage) || 0,
        ramFreeMb:
          ramFreeMb !== undefined
            ? Math.max(0, Math.round(Number(ramFreeMb)))
            : undefined,
        ramTotalMb:
          ramTotalMb !== undefined
            ? Math.max(0, Math.round(Number(ramTotalMb)))
            : undefined,
        status: normalizedStatus,
        dockerContainers:
          dockerContainers !== undefined ? Number(dockerContainers) : undefined,
        dockerCpuUsage:
          dockerCpuUsage !== undefined ? Number(dockerCpuUsage) : undefined,
        dockerMemoryMb:
          dockerMemoryMb !== undefined ? Number(dockerMemoryMb) : undefined,
      });
    }
    scheduleJobs("heartbeat");

    return NextResponse.json({ success: true, workerId, timestamp: now });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
