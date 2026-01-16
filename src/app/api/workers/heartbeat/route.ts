import { NextRequest, NextResponse } from "next/server";
import { workerRegistry, saveWorkers } from "@/lib/registries";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workerId } = body;

    if (!workerId) {
      return NextResponse.json(
        { error: "workerId is required" },
        { status: 400 }
      );
    }

    const worker = workerRegistry.get(workerId);
    if (!worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    // Update heartbeat timestamp
    worker.lastHeartbeat = Date.now();
    saveWorkers();

    return NextResponse.json({
      success: true,
      workerId,
      timestamp: worker.lastHeartbeat,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
