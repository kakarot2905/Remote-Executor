/**
 * Redis Caching Layer for Frequently Accessed Data
 *
 * Provides high-performance caching for frequently called API routes:
 * - Worker heartbeats
 * - Job status checks
 * - Job cancellation flags
 *
 * Data is cached in Redis with automatic TTL and background sync to MongoDB.
 */

import { getRedis } from "./db/redis";
import { JobRecord, WorkerRecord } from "./types";

const CACHE_TTL = {
  WORKER: 60, // 60 seconds - workers update frequently
  WORKER_LIST: 5, // 5 seconds - worker list changes frequently
  JOB_STATUS: 30, // 30 seconds - job status checked often
  CANCEL_FLAG: 10, // 10 seconds - cancellation needs quick propagation
};

const KEYS = {
  worker: (workerId: string) => `worker:${workerId}`,
  workerList: () => `workers:list`,
  workerMongoThrottle: (workerId: string) =>
    `worker:mongo:throttle:${workerId}`,
  jobStatus: (jobId: string) => `job:status:${jobId}`,
  jobCancel: (jobId: string) => `job:cancel:${jobId}`,
  jobFull: (jobId: string) => `job:full:${jobId}`,
};

// ============================================================================
// WORKER OPERATIONS
// ============================================================================

/**
 * Cache worker data in Redis
 */
export async function cacheWorker(worker: WorkerRecord): Promise<void> {
  const redis = getRedis();
  const key = KEYS.worker(worker.workerId);

  // Store essential worker data for fast access
  const cached = {
    workerId: worker.workerId,
    status: worker.status,
    cpuUsage: worker.cpuUsage,
    ramFreeMb: worker.ramFreeMb,
    ramTotalMb: worker.ramTotalMb,
    lastHeartbeat: worker.lastHeartbeat,
    dockerContainers: worker.dockerContainers,
    dockerCpuUsage: worker.dockerCpuUsage,
    dockerMemoryMb: worker.dockerMemoryMb,
  };

  await redis.setex(key, CACHE_TTL.WORKER, JSON.stringify(cached));
}

/**
 * Get worker from Redis cache
 */
export async function getCachedWorker(
  workerId: string,
): Promise<Partial<WorkerRecord> | null> {
  const redis = getRedis();
  const key = KEYS.worker(workerId);
  const data = await redis.get(key);

  if (!data) return null;
  return JSON.parse(data);
}

/**
 * Update worker heartbeat in Redis (high-frequency operation)
 */
export async function updateWorkerHeartbeat(
  workerId: string,
  data: {
    cpuUsage?: number;
    ramFreeMb?: number;
    ramTotalMb?: number;
    status?: string;
    dockerContainers?: number;
    dockerCpuUsage?: number;
    dockerMemoryMb?: number;
  },
): Promise<void> {
  const redis = getRedis();
  const key = KEYS.worker(workerId);

  // Get existing cached worker
  const existing = await redis.get(key);
  if (!existing) return;

  const worker = JSON.parse(existing);
  const now = Date.now();

  // Update only changed fields
  const updated = {
    ...worker,
    ...data,
    lastHeartbeat: now,
  };

  await redis.setex(key, CACHE_TTL.WORKER, JSON.stringify(updated));
}

/**
 * Determine if we should write the worker heartbeat to Mongo now.
 * Uses a Redis throttle key to limit writes to at most once per interval.
 */
export async function shouldWriteWorkerToMongo(
  workerId: string,
  intervalSec: number = 30,
): Promise<boolean> {
  const redis = getRedis();
  const throttleKey = KEYS.workerMongoThrottle(workerId);
  const exists = await redis.exists(throttleKey);
  if (exists === 1) return false;
  await redis.setex(throttleKey, intervalSec, "1");
  return true;
}

/**
 * Cache worker list in Redis (for fast list queries)
 */
export async function cacheWorkerList(workers: WorkerRecord[]): Promise<void> {
  const redis = getRedis();
  const key = KEYS.workerList();

  // Cache the entire worker list with statistics
  const cached = {
    workers: workers.map((w) => ({
      workerId: w.workerId,
      status: w.status,
      hostname: w.hostname,
      os: w.os,
      cpuCount: w.cpuCount,
      cpuUsage: w.cpuUsage,
      ramTotalMb: w.ramTotalMb,
      ramFreeMb: w.ramFreeMb,
      lastHeartbeat: w.lastHeartbeat,
      currentJobIds: w.currentJobIds,
      reservedCpu: w.reservedCpu,
      reservedRamMb: w.reservedRamMb,
      cooldownUntil: w.cooldownUntil,
      updatedAt: w.updatedAt,
      dockerContainers: w.dockerContainers,
      dockerCpuUsage: w.dockerCpuUsage,
      dockerMemoryMb: w.dockerMemoryMb,
    })),
    cachedAt: Date.now(),
  };

  await redis.setex(key, CACHE_TTL.WORKER_LIST, JSON.stringify(cached));
}

/**
 * Get cached worker list from Redis
 */
export async function getCachedWorkerList(): Promise<{
  workers: WorkerRecord[];
  cachedAt: number;
} | null> {
  const redis = getRedis();
  const key = KEYS.workerList();
  const data = await redis.get(key);

  if (!data) return null;
  return JSON.parse(data);
}

// ============================================================================
// JOB STATUS OPERATIONS
// ============================================================================

/**
 * Cache job status in Redis (for frequent status checks)
 */
export async function cacheJobStatus(job: JobRecord): Promise<void> {
  const redis = getRedis();
  const statusKey = KEYS.jobStatus(job.jobId);

  const cached = {
    jobId: job.jobId,
    status: job.status,
    assignedAgentId: job.assignedAgentId,
    exitCode: job.exitCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    attempts: job.attempts,
  };

  await redis.setex(statusKey, CACHE_TTL.JOB_STATUS, JSON.stringify(cached));
}

/**
 * Get job status from Redis cache
 */
export async function getCachedJobStatus(
  jobId: string,
): Promise<Partial<JobRecord> | null> {
  const redis = getRedis();
  const key = KEYS.jobStatus(jobId);
  const data = await redis.get(key);

  if (!data) return null;
  return JSON.parse(data);
}

/**
 * Cache full job data in Redis
 */
export async function cacheFullJob(job: JobRecord): Promise<void> {
  const redis = getRedis();
  const key = KEYS.jobFull(job.jobId);

  await redis.setex(key, CACHE_TTL.JOB_STATUS, JSON.stringify(job));
}

/**
 * Get full job from Redis cache
 */
export async function getCachedFullJob(
  jobId: string,
): Promise<JobRecord | null> {
  const redis = getRedis();
  const key = KEYS.jobFull(jobId);
  const data = await redis.get(key);

  if (!data) return null;
  return JSON.parse(data);
}

// ============================================================================
// JOB CANCELLATION OPERATIONS
// ============================================================================

/**
 * Set job cancellation flag in Redis (very fast propagation)
 */
export async function setCancelFlag(
  jobId: string,
  cancelled: boolean = true,
): Promise<void> {
  const redis = getRedis();
  const key = KEYS.jobCancel(jobId);

  if (cancelled) {
    await redis.setex(key, CACHE_TTL.CANCEL_FLAG, "1");
  } else {
    await redis.del(key);
  }
}

/**
 * Check if job is cancelled (very fast lookup)
 */
export async function getCancelFlag(jobId: string): Promise<boolean> {
  const redis = getRedis();
  const key = KEYS.jobCancel(jobId);
  const value = await redis.get(key);

  return value === "1";
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Invalidate job cache (when job is updated)
 */
export async function invalidateJobCache(jobId: string): Promise<void> {
  const redis = getRedis();
  const keys = [KEYS.jobStatus(jobId), KEYS.jobFull(jobId)];

  await redis.del(...keys);
}

/**
 * Invalidate worker cache (when worker is removed)
 */
export async function invalidateWorkerCache(workerId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(KEYS.worker(workerId));
}

/**
 * Invalidate worker list cache (when worker registry changes)
 */
export async function invalidateWorkerListCache(): Promise<void> {
  const redis = getRedis();
  await redis.del(KEYS.workerList());
}

/**
 * Get cache statistics (for monitoring)
 */
export async function getCacheStats(): Promise<{
  workerKeys: number;
  workerListCached: boolean;
  jobKeys: number;
  cancelKeys: number;
}> {
  const redis = getRedis();

  const [workerKeys, jobKeys, cancelKeys, workerListExists] = await Promise.all(
    [
      redis.keys("worker:*"),
      redis.keys("job:*"),
      redis.keys("job:cancel:*"),
      redis.exists(KEYS.workerList()),
    ],
  );

  return {
    workerKeys: workerKeys.length,
    workerListCached: workerListExists === 1,
    jobKeys: jobKeys.length,
    cancelKeys: cancelKeys.length,
  };
}
