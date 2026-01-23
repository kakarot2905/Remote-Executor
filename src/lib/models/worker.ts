/**
 * Worker Model - MongoDB persistence for workers
 */

import { getMongoDb } from "../db/mongo";
import { WorkerRecord } from "../types";

const COLLECTION_NAME = "workers";

/**
 * Save a worker to MongoDB
 */
export async function saveWorker(worker: WorkerRecord): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  await collection.updateOne(
    { workerId: worker.workerId },
    { $set: worker },
    { upsert: true },
  );
}

/**
 * Get a worker by ID from MongoDB
 */
export async function getWorker(
  workerId: string,
): Promise<WorkerRecord | null> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  const doc = await collection.findOne({ workerId });
  if (!doc) return null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...worker } = doc;
  return worker as unknown as WorkerRecord;
}

/**
 * Get all workers from MongoDB
 */
export async function getAllWorkers(): Promise<WorkerRecord[]> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  const docs = await collection.find().toArray();
  return docs.map((doc) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...worker } = doc;
    return worker as unknown as WorkerRecord;
  });
}

/**
 * Delete a worker from MongoDB
 */
export async function deleteWorker(workerId: string): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  await collection.deleteOne({ workerId });
}

/**
 * Update worker status
 */
export async function updateWorkerStatus(
  workerId: string,
  status: WorkerRecord["status"],
  updates?: Partial<WorkerRecord>,
): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  await collection.updateOne({ workerId }, { $set: { status, ...updates } });
}

/**
 * Update worker heartbeat
 */
export async function updateWorkerHeartbeat(
  workerId: string,
  updates?: Partial<WorkerRecord>,
): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  await collection.updateOne(
    { workerId },
    {
      $set: {
        lastHeartbeat: Date.now(),
        ...updates,
      },
    },
  );
}

/**
 * Get workers by status
 */
export async function getWorkersByStatus(
  status: WorkerRecord["status"],
): Promise<WorkerRecord[]> {
  const db = await getMongoDb();
  const collection = db.collection(COLLECTION_NAME);

  const docs = await collection.find({ status }).toArray();
  return docs.map((doc) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...worker } = doc;
    return worker as unknown as WorkerRecord;
  });
}
