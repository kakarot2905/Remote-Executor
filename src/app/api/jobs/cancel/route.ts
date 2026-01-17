import { NextRequest, NextResponse } from "next/server";
import {
  jobRegistry,
  workerRegistry,
  saveJobs,
  saveWorkers,
} from "@/lib/registries";
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

    const job = jobRegistry.get(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
    }

    // If job is running, mark for cancellation so worker can kill container
    if (job.status === "RUNNING") {
      job.cancelRequested = true;
      await saveJobs();

      return NextResponse.json({
        success: true,
        message: "Cancellation requested. Worker will kill container shortly.",
        jobId: job.jobId,
      });
    }

    // If job is queued/assigned, cancel immediately and free resources
    job.status = "FAILED";
    job.errorMessage = "Job cancelled by user";
    job.completedAt = Date.now();
    job.cancelRequested = true;

    const workerId = job.assignedAgentId;
    releaseJobResources(job.jobId);

    job.assignedAgentId = null;

    const worker = workerId ? workerRegistry.get(workerId) : null;
    if (worker && worker.currentJobIds.length === 0) {
      worker.status = "IDLE";
    }

    await saveJobs();
    await saveWorkers();
    scheduleJobs("job-cancelled");

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
