/**
 * File download endpoint (GridFS)
 * GET /api/files/download/[fileId]
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, authenticateWorker } from "@/lib/auth";
import { downloadFile } from "@/lib/gridfs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  // Allow both user and worker authentication
  console.log("[FILE-DOWNLOAD] Request headers:", {
    authorization: request.headers.get("authorization")?.slice(0, 20),
    workerToken: request.headers.get("x-worker-token")?.slice(0, 20),
  });

  const userAuth = authenticateUser(request);
  const workerAuth = authenticateWorker(request);

  console.log("[FILE-DOWNLOAD] Auth results:", {
    userOk: userAuth.ok,
    workerOk: workerAuth.ok,
  });

  if (!userAuth.ok && !workerAuth.ok) {
    return NextResponse.json(
      { error: "Unauthorized - User or Worker authentication required" },
      { status: 401 },
    );
  }

  try {
    const { fileId } = await params;
    console.log("[FILE-DOWNLOAD] Requesting fileId:", fileId);

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required" },
        { status: 400 },
      );
    }

    const file = await downloadFile(fileId);
    console.log("[FILE-DOWNLOAD] Mongo file bytes:", file.buffer.length);

    return new NextResponse(file.buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Length": file.buffer.length.toString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Download failed";
    console.error("File download error:", error);

    if (message.includes("not found")) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
