/**
 * File upload endpoint (GridFS)
 * POST /api/files/upload
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { uploadFile } from "@/lib/gridfs";

export async function POST(request: NextRequest) {
  // Require authentication
  const auth = authenticateUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to GridFS
    const result = await uploadFile(buffer, file.name, file.type, {
      uploadedBy: auth.user.username,
      uploadedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      file: {
        fileId: result.fileId,
        filename: result.filename,
        contentType: result.contentType,
        size: result.size,
        uploadDate: result.uploadDate,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("File upload error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
