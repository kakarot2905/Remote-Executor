import { NextRequest, NextResponse } from "next/server";
import { workerRegistry, saveWorkers, AgentStatus } from "@/lib/registries";
import { scheduleJobs } from "@/lib/scheduler";

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

    const worker = workerRegistry.get(workerId);
    if (!worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const now = Date.now();
    const normalizedStatus: AgentStatus =
      status === "BUSY" || status === "UNHEALTHY" || status === "OFFLINE"
        ? status
        : "IDLE";

    worker.cpuUsage = Number(cpuUsage) || 0;
    worker.ramFreeMb =
      ramFreeMb !== undefined
        ? Math.max(0, Math.round(Number(ramFreeMb)))
        : worker.ramFreeMb;
    worker.ramTotalMb =
      ramTotalMb !== undefined
        ? Math.max(0, Math.round(Number(ramTotalMb)))
        : worker.ramTotalMb;
    worker.status = normalizedStatus;
    worker.lastHeartbeat = now;
    worker.updatedAt = now;

    // Update Docker container stats
    worker.dockerContainers =
      dockerContainers !== undefined ? Number(dockerContainers) : 0;
    worker.dockerCpuUsage =
      dockerCpuUsage !== undefined ? Number(dockerCpuUsage) : 0;
    worker.dockerMemoryMb =
      dockerMemoryMb !== undefined ? Number(dockerMemoryMb) : 0;

    saveWorkers();
    scheduleJobs("heartbeat");

    return NextResponse.json({
      success: true,
      workerId,
      timestamp: worker.lastHeartbeat,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
