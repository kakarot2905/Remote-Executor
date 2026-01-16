import { NextRequest, NextResponse } from "next/server";
import {
  jobRegistry,
  saveJobs,
  workerRegistry,
  saveWorkers,
} from "@/lib/registries";

// Health check: mark idle workers as offline if they haven't sent heartbeat
const cleanupOfflineWorkers = () => {
  const now = Date.now();
  const heartbeatTimeout = 30000; // 30 seconds

  workerRegistry.forEach((worker, workerId) => {
    if (now - worker.lastHeartbeat > heartbeatTimeout) {
      worker.status = "offline";
      console.log(`Worker ${workerId} marked as offline`);
    }
  });
};

export async function GET(request: NextRequest) {
  try {
    // Clean up offline workers first
    cleanupOfflineWorkers();

    // Find the first idle worker
    let idleWorker = null;
    for (const worker of workerRegistry.values()) {
      if (worker.status === "idle") {
        idleWorker = worker;
        break;
      }
    }

    if (!idleWorker) {
      return NextResponse.json(
        {
          success: false,
          message: "No idle workers available",
          job: null,
        },
        { status: 202 } // 202 Accepted but no content
      );
    }

    // Find the first pending job
    let pendingJob = null;
    for (const job of jobRegistry.values()) {
      if (job.status === "pending") {
        pendingJob = job;
        break;
      }
    }

    if (!pendingJob) {
      return NextResponse.json(
        {
          success: false,
          message: "No pending jobs",
          job: null,
        },
        { status: 202 }
      );
    }

    // Assign the job to the worker
    pendingJob.workerId = idleWorker.workerId;
    pendingJob.status = "running";
    pendingJob.startedAt = Date.now();

    idleWorker.status = "busy";

    saveJobs();
    saveWorkers();

    console.log(
      `Job ${pendingJob.jobId} assigned to worker ${idleWorker.workerId}`
    );

    return NextResponse.json({
      success: true,
      job: {
        jobId: pendingJob.jobId,
        command: pendingJob.command,
        fileUrl: pendingJob.fileUrl,
        filename: pendingJob.filename,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
