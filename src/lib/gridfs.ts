/**
 * GridFS file storage for MongoDB
 * Handles file uploads and downloads
 */

import { getMongoDb } from "./db/mongo";
import { GridFSBucket, ObjectId } from "mongodb";

let bucket: GridFSBucket | null = null;

export async function getGridFSBucket(): Promise<GridFSBucket> {
  if (!bucket) {
    const db = await getMongoDb();
    bucket = new GridFSBucket(db, {
      bucketName: "uploads",
    });
  }
  return bucket;
}

export interface FileUploadResult {
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadDate: Date;
}

/**
 * Upload a file to GridFS
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string = "application/octet-stream",
  metadata?: Record<string, any>,
): Promise<FileUploadResult> {
  const bucket = await getGridFSBucket();

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: {
        ...metadata,
        contentType,
      },
    });

    uploadStream.on("finish", () => {
      resolve({
        fileId: uploadStream.id.toString(),
        filename,
        contentType,
        size: buffer.length,
        uploadDate: new Date(),
      });
    });

    uploadStream.on("error", reject);
    uploadStream.end(buffer);
  });
}

/**
 * Download a file from GridFS
 */
export async function downloadFile(
  fileId: string,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const bucket = await getGridFSBucket();
  const objectId = new ObjectId(fileId);

  // Get file metadata
  const files = await bucket.find({ _id: objectId }).toArray();
  if (files.length === 0) {
    throw new Error("File not found");
  }

  const file = files[0];

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const downloadStream = bucket.openDownloadStream(objectId);

    downloadStream.on("data", (chunk) => {
      chunks.push(chunk);
    });

    downloadStream.on("end", () => {
      const ct =
        (file as any).metadata?.contentType ||
        (file as any).contentType ||
        "application/octet-stream";
      resolve({
        buffer: Buffer.concat(chunks),
        filename: file.filename,
        contentType: ct,
      });
    });

    downloadStream.on("error", reject);
  });
}

/**
 * Delete a file from GridFS
 */
export async function deleteFile(fileId: string): Promise<void> {
  const bucket = await getGridFSBucket();
  const objectId = new ObjectId(fileId);
  await bucket.delete(objectId);
}

/**
 * Check if a file exists
 */
export async function fileExists(fileId: string): Promise<boolean> {
  try {
    const bucket = await getGridFSBucket();
    const objectId = new ObjectId(fileId);
    const files = await bucket.find({ _id: objectId }).toArray();
    return files.length > 0;
  } catch {
    return false;
  }
}

/**
 * List all files (for admin)
 */
export async function listFiles(
  limit: number = 100,
): Promise<
  Array<{ fileId: string; filename: string; size: number; uploadDate: Date }>
> {
  const bucket = await getGridFSBucket();
  const files = await bucket.find().limit(limit).toArray();

  return files.map((file) => ({
    fileId: file._id.toString(),
    filename: file.filename,
    size: file.length,
    uploadDate: file.uploadDate,
  }));
}
