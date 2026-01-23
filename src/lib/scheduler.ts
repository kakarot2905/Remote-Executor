/**
 * Centralized scheduler for resource-aware job assignment.
 * Keeps worker state fresh, requeues stranded jobs, and assigns queued jobs
 * to the healthiest available agents based on CPU/RAM availability and load.
 *
 * NOTE: Uses MongoDB as source of truth for multi-instance deployments.
 * In-memory registries are used for fast access within a single request cycle.
 */

import {
  AgentStatus,
  JobRecord,
  JobStatus,
  WorkerRecord,
  jobRegistry,
  saveJobs,
  saveWorkers,
  workerRegistry,
} from "./registries";
import { getAllJobs, updateJobStatus } from "./models/job";
import { getAllWorkers, updateWorkerStatus } from "./models/worker";
import { cacheWorker, cacheJobStatus } from "./redis-cache";

const HEARTBEAT_TIMEOUT_MS = 30_000; // mark workers offline after this gap
const AGENT_COOLDOWN_MS = 30_000; // temporary penalty after failures
const SCHEDULER_INTERVAL_MS = 5_000; // periodic sweep

let schedulerTimer: NodeJS.Timeout | null = null;

const clampNonNegative = (value: number) => (value < 0 ? 0 : value);

const releaseJobFromWorker = (worker: WorkerRecord, job: JobRecord) => {
  worker.currentJobIds = worker.currentJobIds.filter((id) => id !== job.jobId);
  worker.reservedCpu = clampNonNegative(worker.reservedCpu - job.requiredCpu);
  worker.reservedRamMb = clampNonNegative(
    worker.reservedRamMb - job.requiredRamMb,
  );
  if (worker.currentJobIds.length === 0 && worker.status !== "OFFLINE") {
    worker.status = "IDLE";
  }
  worker.updatedAt = Date.now();
};

const requeueJob = (job: JobRecord, reason: string) => {
  job.assignedAgentId = null;
  job.assignedAt = null;
  job.startedAt = null;
  job.completedAt = null;
  job.status = "QUEUED";
  job.queuedAt = Date.now();
  job.attempts += 1;
  job.errorMessage = reason;
};

const markJobFailed = (job: JobRecord, reason: string) => {
  job.status = "FAILED";
  job.errorMessage = reason;
  job.completedAt = Date.now();
};

const releaseWorkerJobs = (worker: WorkerRecord, reason: string) => {
  for (const jobId of [...worker.currentJobIds]) {
    const job = jobRegistry.get(jobId);
    if (!job) continue;

    releaseJobFromWorker(worker, job);

    if (job.attempts + 1 > job.maxRetries) {
      markJobFailed(job, `${reason} (max retries reached)`);
      continue;
    }

    requeueJob(job, reason);
  }
};

const refreshWorkerHealth = (now: number): boolean => {
  let changed = false;

  workerRegistry.forEach((worker) => {
    const heartbeatGap = now - worker.lastHeartbeat;

    if (worker.cooldownUntil && worker.cooldownUntil > now) {
      worker.status = "UNHEALTHY";
      worker.healthReason = "cooldown";
      changed = true;
      return;
    }

    if (heartbeatGap > HEARTBEAT_TIMEOUT_MS) {
      if (worker.status !== "OFFLINE") {
        worker.status = "OFFLINE";
        worker.healthReason = "heartbeat_timeout";
        releaseWorkerJobs(worker, "Worker offline: heartbeat timeout");
        changed = true;
      }
      return;
    }

    // Clear health flags when healthy heartbeats return
    if (worker.status === "OFFLINE" || worker.status === "UNHEALTHY") {
      worker.status = worker.currentJobIds.length === 0 ? "IDLE" : "BUSY";
      worker.healthReason = undefined;
      changed = true;
    }
  });

  return changed;
};

const checkRunningJobTimeouts = (now: number): number => {
  let reclaimed = 0;

  jobRegistry.forEach((job) => {
    if (job.status !== "RUNNING") return;
    if (!job.startedAt) return;

    if (now - job.startedAt > job.timeoutMs) {
      const worker = job.assignedAgentId
        ? workerRegistry.get(job.assignedAgentId)
        : null;

      if (worker) {
        releaseJobFromWorker(worker, job);
      }

      if (job.attempts + 1 > job.maxRetries) {
        markJobFailed(job, "Execution timeout");
      } else {
        requeueJob(job, "Execution timeout");
      }
      reclaimed += 1;
    }
  });

  return reclaimed;
};

const computeLoadScore = (worker: WorkerRecord): number => {
  const cpuHeadroom = Math.max(worker.cpuCount - worker.reservedCpu, 0.1);
  const ramBase = worker.ramTotalMb || 1;
  const ramHeadroom = Math.max(ramBase - worker.reservedRamMb, 1);
  const cpuLoad = worker.cpuUsage || 0;
  const cpuSaturation = (worker.reservedCpu / worker.cpuCount) * 100;
  const ramSaturation = (worker.reservedRamMb / ramBase) * 100;

  // Lower score is better
  return (
    cpuLoad * 0.6 +
    cpuSaturation * 0.3 +
    ramSaturation * 0.1 +
    (1 / cpuHeadroom) * 5 +
    (1 / ramHeadroom) * 0.01
  );
};

const canFitJob = (worker: WorkerRecord, job: JobRecord): boolean => {
  const availableCpu = worker.cpuCount - worker.reservedCpu;
  const availableRam = worker.ramTotalMb - worker.reservedRamMb;

  const healthy = worker.status === "IDLE" || worker.status === "BUSY";
  const notCooling =
    !worker.cooldownUntil || worker.cooldownUntil <= Date.now();

  return (
    healthy &&
    notCooling &&
    availableCpu >= job.requiredCpu &&
    availableRam >= job.requiredRamMb &&
    worker.cpuUsage <= 90 // basic overload guard
  );
};

const assignQueuedJobs = (now: number): { assigned: number } => {
  const queuedJobs = Array.from(jobRegistry.values())
    .filter((job) => job.status === "QUEUED")
    .sort((a, b) => (a.queuedAt ?? a.createdAt) - (b.queuedAt ?? b.createdAt));

  let assigned = 0;

  for (const job of queuedJobs) {
    const candidates = Array.from(workerRegistry.values())
      .filter((worker) => canFitJob(worker, job))
      .sort((a, b) => computeLoadScore(a) - computeLoadScore(b));

    if (candidates.length === 0) {
      continue;
    }

    const worker = candidates[0];

    // Reserve resources and mark assignment
    worker.reservedCpu += job.requiredCpu;
    worker.reservedRamMb += job.requiredRamMb;
    worker.currentJobIds = Array.from(
      new Set([...worker.currentJobIds, job.jobId]),
    );
    worker.status = "BUSY";
    worker.updatedAt = now;

    job.status = "ASSIGNED";
    job.assignedAgentId = worker.workerId;
    job.assignedAt = now;

    assigned += 1;
  }

  return { assigned };
};

export const scheduleJobs = async (trigger = "manual") => {
  const now = Date.now();

  // Load fresh state from MongoDB for multi-instance safety
  try {
    const dbJobs = await getAllJobs();
    const dbWorkers = await getAllWorkers();

    // Sync into in-memory registries for this cycle
    jobRegistry.clear();
    workerRegistry.clear();
    dbJobs.forEach((job) => jobRegistry.set(job.jobId, job));
    dbWorkers.forEach((worker) => workerRegistry.set(worker.workerId, worker));
  } catch (error) {
    console.error("[Scheduler] Failed to load from MongoDB:", error);
    // Continue with in-memory state as fallback
  }

  const workersUpdated = refreshWorkerHealth(now);
  const reclaimed = checkRunningJobTimeouts(now);
  const { assigned } = assignQueuedJobs(now);

  if (workersUpdated || reclaimed > 0 || assigned > 0) {
    // Persist changes back to MongoDB
    try {
      await Promise.all(
        Array.from(workerRegistry.values()).map(async (worker) => {
          try {
            await updateWorkerStatus(worker.workerId, worker.status, {
              currentJobIds: worker.currentJobIds,
              reservedCpu: worker.reservedCpu,
              reservedRamMb: worker.reservedRamMb,
              cooldownUntil: worker.cooldownUntil,
              updatedAt: worker.updatedAt,
            });
            // Warm cache for fast heartbeat responses
            await cacheWorker(worker);
          } catch (error) {
            console.warn(
              `[Scheduler] Failed to update worker ${worker.workerId}:`,
              error,
            );
          }
        }),
      );

      await Promise.all(
        Array.from(jobRegistry.values()).map(async (job) => {
          try {
            await updateJobStatus(job.jobId, job.status, {
              assignedAgentId: job.assignedAgentId,
              assignedAt: job.assignedAt,
              queuedAt: job.queuedAt,
              errorMessage: job.errorMessage,
              attempts: job.attempts,
            });
            // Warm cache for fast status queries
            await cacheJobStatus(job);
          } catch (error) {
            console.warn(
              `[Scheduler] Failed to update job ${job.jobId}:`,
              error,
            );
          }
        }),
      );
    } catch (error) {
      console.error("[Scheduler] Failed to persist changes:", error);
    }

    // Also save to in-memory persistence (fallback)
    saveWorkers();
    saveJobs();
  }

  return { trigger, workersUpdated, reclaimed, assigned };
};

export const startSchedulerLoop = () => {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(
    () => scheduleJobs("loop"),
    SCHEDULER_INTERVAL_MS,
  );
};

export const recordWorkerFailure = (workerId: string, reason: string) => {
  const worker = workerRegistry.get(workerId);
  if (!worker) return;

  worker.status = "UNHEALTHY";
  worker.cooldownUntil = Date.now() + AGENT_COOLDOWN_MS;
  worker.healthReason = reason;

  releaseWorkerJobs(worker, reason);
  saveWorkers();
  saveJobs();
};

export const releaseJobResources = (jobId: string) => {
  const job = jobRegistry.get(jobId);
  if (!job || !job.assignedAgentId) return;

  const worker = workerRegistry.get(job.assignedAgentId);
  if (!worker) return;

  releaseJobFromWorker(worker, job);
};

// Start periodic loop on first import
startSchedulerLoop();
