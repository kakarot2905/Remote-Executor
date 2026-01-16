import { NextRequest, NextResponse } from "next/server";
import {
  jobRegistry,
  saveJobs,
  workerRegistry,
  saveWorkers,
} from "@/lib/registries";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, workerId, stdout, stderr, exitCode } = body;

    if (!jobId || !workerId) {
      return NextResponse.json(
        { error: "jobId and workerId are required" },
        { status: 400 }
      );
    }

    const job = jobRegistry.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify the worker is assigned to this job
    if (job.workerId !== workerId) {
      return NextResponse.json(
        { error: "Worker is not assigned to this job" },
        { status: 403 }
      );
    }

    // Update job with results
    job.status = "completed";
    job.stdout = stdout || "";
    job.stderr = stderr || "";
    job.exitCode = exitCode !== undefined ? exitCode : null;
    job.completedAt = Date.now();

    // Mark worker as idle
    const worker = workerRegistry.get(workerId);
    if (worker) {
      worker.status = "idle";
      console.log(`Worker ${workerId} is now idle`);
    }

    saveJobs();
    saveWorkers();

    console.log(`Job ${jobId} completed with exit code ${exitCode}`);

    return NextResponse.json({
      success: true,
      jobId,
      message: "Job result submitted successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Allow workers to mark job as failed
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, workerId, errorMessage } = body;

    if (!jobId || !workerId) {
      return NextResponse.json(
        { error: "jobId and workerId are required" },
        { status: 400 }
      );
    }

    const job = jobRegistry.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Update job as failed
    job.status = "failed";
    job.errorMessage = errorMessage || "Unknown error";
    job.completedAt = Date.now();

    // Mark worker as idle
    const worker = workerRegistry.get(workerId);
    if (worker) {
      worker.status = "idle";
    }

    saveJobs();
    saveWorkers();

    console.log(`Job ${jobId} failed: ${errorMessage}`);

    return NextResponse.json({
      success: true,
      jobId,
      message: "Job failure recorded successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
