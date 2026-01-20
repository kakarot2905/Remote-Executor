/**
 * List files endpoint (GridFS)
 * GET /api/files/list
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { listFiles } from "@/lib/gridfs";

export async function GET(request: NextRequest) {
  // Require authentication
  const auth = authenticateUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const files = await listFiles(limit);

    return NextResponse.json({
      success: true,
      files,
      count: files.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list files";
    console.error("File list error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
