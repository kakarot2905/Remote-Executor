import { NextRequest, NextResponse } from "next/server";
import { scheduleJobs } from "@/lib/scheduler";
import { getAllJobs, updateJobStatus } from "@/lib/models/job";
import { getWorker, updateWorkerStatus } from "@/lib/models/worker";

export async function GET(request: NextRequest) {
  try {
    const workerId = request.nextUrl.searchParams.get("workerId");

    if (!workerId) {
      return NextResponse.json(
        { success: false, error: "workerId is required" },
        { status: 400 },
      );
    }

    const worker = await getWorker(workerId);
    if (!worker) {
      return NextResponse.json(
        { success: false, error: "Worker not found" },
        { status: 404 },
      );
    }

    // Run scheduler to ensure freshest assignments
    await scheduleJobs("worker-poll");

    const jobs = await getAllJobs();
    const assignedJob = jobs.find(
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
    await updateJobStatus(assignedJob.jobId, "RUNNING", {
      startedAt: now,
      attempts: (assignedJob.attempts || 0) + 1,
    });
    await updateWorkerStatus(worker.workerId, "BUSY", {
      currentJobIds: Array.from(
        new Set([...(worker.currentJobIds ?? []), assignedJob.jobId]),
      ),
      updatedAt: now,
    });

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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
