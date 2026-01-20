/**
 * Job Model - MongoDB persistence for jobs
 */

import { getMongoDb } from "../db/mongo";
import { JobRecord } from "../types";

const COLLECTION_NAME = "jobs";

/**
 * Save a job to MongoDB
 */
export async function saveJob(job: JobRecord): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  await collection.updateOne(
    { jobId: job.jobId },
    { $set: job },
    { upsert: true }
  );
}

/**
 * Get a job by ID from MongoDB
 */
export async function getJob(jobId: string): Promise<JobRecord | null> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  const doc = await collection.findOne({ jobId });
  if (!doc) return null;
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...job } = doc;
  return job as unknown as JobRecord;
}

/**
 * Get all jobs from MongoDB
 */
export async function getAllJobs(): Promise<JobRecord[]> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  const docs = await collection.find().toArray();
  return docs.map((doc) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...job } = doc;
    return job as unknown as JobRecord;
  });
}

/**
 * Delete a job from MongoDB
 */
export async function deleteJob(jobId: string): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  await collection.deleteOne({ jobId });
}

/**
 * Update job status
 */
export async function updateJobStatus(
  jobId: string,
  status: JobRecord["status"],
  updates?: Partial<JobRecord>
): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  await collection.updateOne(
    { jobId },
    { $set: { status, ...updates } }
  );
}
