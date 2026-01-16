import { NextRequest, NextResponse } from "next/server";
import { workerRegistry } from "@/lib/registries";

export async function GET(request: NextRequest) {
  try {
    const workers = Array.from(workerRegistry.values()).map((worker) => ({
      workerId: worker.workerId,
      status: worker.status,
      hostname: worker.hostname,
      os: worker.os,
      cpuCount: worker.cpuCount,
      lastHeartbeat: worker.lastHeartbeat,
      currentJobId: worker.currentJobId,
      registeredAt: worker.registeredAt,
    }));

    return NextResponse.json({
      success: true,
      workers,
      totalWorkers: workers.length,
      idleWorkers: workers.filter((w) => w.status === "idle").length,
      busyWorkers: workers.filter((w) => w.status === "busy").length,
    });
  } catch (error) {
    console.error("List workers error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
