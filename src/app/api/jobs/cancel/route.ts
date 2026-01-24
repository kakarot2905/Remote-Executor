import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJobStatus } from "@/lib/models/job";
import { getWorker, updateWorkerStatus } from "@/lib/models/worker";
import { releaseJobResources, scheduleJobs } from "@/lib/scheduler";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Missing jobId" },
        { status: 400 },
      );
    }

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
    }

    // If job is running, mark for cancellation so worker can kill container
    if (job.status === "RUNNING") {
      await updateJobStatus(jobId, job.status, { cancelRequested: true });

      return NextResponse.json({
        success: true,
        message: "Cancellation requested. Worker will kill container shortly.",
        jobId: job.jobId,
      });
    }

    // If job is queued/assigned, cancel immediately and free resources
    const now = Date.now();
    const workerId = job.assignedAgentId;

    await updateJobStatus(jobId, "FAILED", {
      errorMessage: "Job cancelled by user",
      completedAt: now,
      cancelRequested: true,
      assignedAgentId: null,
    });

    await releaseJobResources(jobId);

    if (workerId) {
      const worker = await getWorker(workerId);
      if (worker && (worker.currentJobIds?.length ?? 0) === 0) {
        await updateWorkerStatus(worker.workerId, "IDLE", { updatedAt: now });
      }
    }

    await scheduleJobs("job-cancelled");

    return NextResponse.json({
      success: true,
      message: "Job cancelled successfully",
      jobId: job.jobId,
    });
  } catch (error) {
    console.error("Cancel job error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
