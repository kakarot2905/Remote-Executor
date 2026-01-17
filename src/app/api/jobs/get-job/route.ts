import { NextRequest, NextResponse } from "next/server";
import {
  jobRegistry,
  saveJobs,
  workerRegistry,
  saveWorkers,
} from "@/lib/registries";
import { scheduleJobs } from "@/lib/scheduler";

export async function GET(request: NextRequest) {
  try {
    const workerId = request.nextUrl.searchParams.get("workerId");

    if (!workerId) {
      return NextResponse.json(
        { success: false, error: "workerId is required" },
        { status: 400 },
      );
    }

    const worker = workerRegistry.get(workerId);
    if (!worker) {
      return NextResponse.json(
        { success: false, error: "Worker not found" },
        { status: 404 },
      );
    }

    // Run scheduler to ensure freshest assignments
    scheduleJobs("worker-poll");

    const assignedJob = Array.from(jobRegistry.values()).find(
      (job) => job.status === "ASSIGNED" && job.assignedAgentId === workerId,
    );

    if (!assignedJob) {
      return NextResponse.json(
        {
          success: false,
          message: "No assigned jobs for this worker",
          job: null,
        },
        { status: 202 },
      );
    }

    const now = Date.now();
    assignedJob.status = "RUNNING";
    assignedJob.startedAt = now;
    assignedJob.attempts = (assignedJob.attempts || 0) + 1;

    worker.status = "BUSY";
    worker.currentJobIds = Array.from(
      new Set([...worker.currentJobIds, assignedJob.jobId]),
    );
    worker.updatedAt = now;

    saveJobs();
    saveWorkers();

    return NextResponse.json({
      success: true,
      job: {
        jobId: assignedJob.jobId,
        command: assignedJob.command,
        fileUrl: assignedJob.fileUrl,
        filename: assignedJob.filename,
        timeoutMs: assignedJob.timeoutMs,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
