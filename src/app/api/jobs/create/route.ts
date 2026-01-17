import { NextRequest, NextResponse } from "next/server";
import { jobRegistry, saveJobs } from "@/lib/registries";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { command, fileUrl, filename } = body;

    if (!command || !fileUrl || !filename) {
      return NextResponse.json(
        {
          error: "command, fileUrl, and filename are required",
        },
        { status: 400 },
      );
    }

    const jobId = `job-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const job = {
      jobId,
      workerId: null,
      status: "pending" as const,
      command,
      fileUrl,
      filename,
      stdout: "",
      stderr: "",
      exitCode: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      cancelRequested: false,
    };

    jobRegistry.set(jobId, job);
    saveJobs();

    return NextResponse.json({
      success: true,
      jobId,
      message: "Job created successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  // Return list of all jobs (admin endpoint)
  const jobs = Array.from(jobRegistry.values());
  return NextResponse.json({ jobs, count: jobs.length });
}
