import { NextRequest, NextResponse } from "next/server";
import {
  deleteWorker as deleteWorkerFromMongo,
  getWorker,
} from "@/lib/models/worker";

export async function DELETE(
  request: NextRequest,
  context: { params: { workerId: string } },
) {
  console.log("DELETE /api/workers/[workerId] called", request);
  try {
    const { workerId } = (await context.params) || {};
    if (!workerId) {
      return NextResponse.json(
        { error: "workerId is required" },
        { status: 400 },
      );
    }

    // Check existence in DB (optional)
    const existing = await getWorker(workerId);

    // Remove from MongoDB persistence (idempotent)
    await deleteWorkerFromMongo(workerId);

    return NextResponse.json(
      { success: true, workerId, existed: Boolean(existing) },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Workers/Delete] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
