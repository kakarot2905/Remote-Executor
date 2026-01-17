import { NextRequest, NextResponse } from "next/server";
import { jobRegistry } from "@/lib/registries";

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId");

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

    return NextResponse.json({
      success: true,
      cancelRequested: job.cancelRequested || false,
    });
  } catch (error) {
    console.error("Check cancel error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
