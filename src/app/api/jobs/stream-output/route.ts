import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJobStatus } from "@/lib/models/job";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, data, type } = body;

    if (!jobId || !data || !type) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
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

    // Append streamed data to job output in real-time
    const now = Date.now();
    const updates: Partial<typeof job> = {};
    if (type === "stdout") {
      updates.stdout = (job.stdout || "") + data;
    } else if (type === "stderr") {
      updates.stderr = (job.stderr || "") + data;
    }
    updates.lastStreamedAt = now;

    await updateJobStatus(job.jobId, job.status, updates);

    return NextResponse.json({
      success: true,
      message: "Output streamed successfully",
    });
  } catch (error) {
    console.error("Stream output error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
