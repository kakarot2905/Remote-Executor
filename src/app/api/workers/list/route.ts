import { NextResponse } from "next/server";
import { getAllWorkers } from "@/lib/models/worker";

export async function GET() {
  try {
    const dbWorkers = await getAllWorkers();
    const workers = dbWorkers.map((worker) => ({
      workerId: worker.workerId,
      status: worker.status,
      hostname: worker.hostname,
      os: worker.os,
      cpuCount: worker.cpuCount,
      cpuUsage: worker.cpuUsage,
      ramTotalMb: worker.ramTotalMb,
      ramFreeMb: worker.ramFreeMb,
      lastHeartbeat: worker.lastHeartbeat,
      currentJobIds: worker.currentJobIds,
      reservedCpu: worker.reservedCpu,
      reservedRamMb: worker.reservedRamMb,
      cooldownUntil: worker.cooldownUntil,
      updatedAt: worker.updatedAt,
      dockerContainers: worker.dockerContainers,
      dockerCpuUsage: worker.dockerCpuUsage,
      dockerMemoryMb: worker.dockerMemoryMb,
    }));

    return NextResponse.json({
      success: true,
      workers,
      totalWorkers: workers.length,
      idleWorkers: workers.filter((w) => w.status === "IDLE").length,
      busyWorkers: workers.filter((w) => w.status === "BUSY").length,
      unhealthyWorkers: workers.filter((w) => w.status === "UNHEALTHY").length,
    });
  } catch (error) {
    console.error("List workers error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
