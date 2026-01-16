import { NextRequest, NextResponse } from "next/server";
import {
  jobRegistry,
  workerRegistry,
  saveJobs,
  saveWorkers,
} from "@/lib/registries";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Missing jobId" },
        { status: 400 }
      );
    }

    const job = jobRegistry.get(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    // Update job status to cancelled
    job.status = "failed";
    job.errorMessage = "Job cancelled by user";
    job.completedAt = Date.now();

    // Free up the worker if assigned
    if (job.workerId) {
      const worker = workerRegistry.get(job.workerId);
      if (worker) {
        worker.status = "idle";
        worker.currentJobId = null;
        await saveWorkers();
      }
    }

    await saveJobs();

    return NextResponse.json({
      success: true,
      message: "Job cancelled successfully",
      jobId: job.jobId,
    });
  } catch (error) {
    console.error("Cancel job error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
