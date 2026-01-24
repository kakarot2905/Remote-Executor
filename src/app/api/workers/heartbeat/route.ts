import { NextRequest, NextResponse } from "next/server";
import { scheduleJobs } from "@/lib/scheduler";
import { AgentStatus, WorkerRecord } from "@/lib/types";
import {
  getWorker,
  updateWorkerHeartbeat,
  updateWorkerStatus,
} from "@/lib/models/worker";

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

    const worker = await getWorker(workerId);
    if (!worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const now = Date.now();
    const normalizedStatus: AgentStatus =
      status === "BUSY" || status === "UNHEALTHY" || status === "OFFLINE"
        ? status
        : "IDLE";

    const updates: Partial<WorkerRecord> = {
      cpuUsage: Number(cpuUsage) || 0,
      ramFreeMb:
        ramFreeMb !== undefined
          ? Math.max(0, Math.round(Number(ramFreeMb)))
          : worker.ramFreeMb,
      ramTotalMb:
        ramTotalMb !== undefined
          ? Math.max(0, Math.round(Number(ramTotalMb)))
          : worker.ramTotalMb,
      lastHeartbeat: now,
      updatedAt: now,
      dockerContainers:
        dockerContainers !== undefined
          ? Number(dockerContainers)
          : (worker.dockerContainers ?? 0),
      dockerCpuUsage:
        dockerCpuUsage !== undefined
          ? Number(dockerCpuUsage)
          : (worker.dockerCpuUsage ?? 0),
      dockerMemoryMb:
        dockerMemoryMb !== undefined
          ? Number(dockerMemoryMb)
          : (worker.dockerMemoryMb ?? 0),
    };

    await updateWorkerHeartbeat(workerId, updates);
    if (worker.status !== normalizedStatus) {
      await updateWorkerStatus(workerId, normalizedStatus);
    }
    scheduleJobs("heartbeat");

    return NextResponse.json({
      success: true,
      workerId,
      timestamp: worker.lastHeartbeat,
    });
  } catch (error) {
    console.error("[Heartbeat] Error processing heartbeat:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
