/**
 * Centralized scheduler for resource-aware job assignment.
 * Keeps worker state fresh, requeues stranded jobs, and assigns queued jobs
 * to the healthiest available agents based on CPU/RAM availability and load.
 */

import { AgentStatus, JobRecord, WorkerRecord } from "./types";
import { getAllWorkers, updateWorkerStatus } from "./models/worker";
import { getAllJobs, updateJobStatus } from "./models/job";

const HEARTBEAT_TIMEOUT_MS = 30_000; // mark workers offline after this gap
const AGENT_COOLDOWN_MS = 30_000; // temporary penalty after failures
const SCHEDULER_INTERVAL_MS = 5_000; // periodic sweep

let schedulerTimer: NodeJS.Timeout | null = null;

// Helper functions now operate via DB updates directly in the scheduling code.

const refreshWorkerHealth = async (now: number): Promise<boolean> => {
  const workers = await getAllWorkers();
  let changed = false;

  for (const worker of workers) {
    const heartbeatGap = now - worker.lastHeartbeat;
    let newStatus: AgentStatus | null = null;
    let healthReason: string | undefined = undefined;

    if (worker.cooldownUntil && worker.cooldownUntil > now) {
      newStatus = "UNHEALTHY";
      healthReason = "cooldown";
    } else if (heartbeatGap > HEARTBEAT_TIMEOUT_MS) {
      if (worker.status !== "OFFLINE") {
        newStatus = "OFFLINE";
        healthReason = "heartbeat_timeout";
        // Requeue jobs assigned to this worker
        for (const jobId of worker.currentJobIds || []) {
          await updateJobStatus(jobId, "QUEUED", {
            assignedAgentId: null,
            assignedAt: null,
            startedAt: null,
            completedAt: null,
            queuedAt: now,
            attempts:
              typeof (await getAllJobs()).find((j) => j.jobId === jobId)
                ?.attempts === "number"
                ? (await getAllJobs()).find((j) => j.jobId === jobId)!
                    .attempts + 1
                : 1,
            errorMessage: "Worker offline: heartbeat timeout",
          });
        }
      }
    } else if (worker.status === "OFFLINE" || worker.status === "UNHEALTHY") {
      newStatus = (worker.currentJobIds?.length ?? 0) === 0 ? "IDLE" : "BUSY";
    }

    if (newStatus && newStatus !== worker.status) {
      await updateWorkerStatus(worker.workerId, newStatus, { healthReason });
      changed = true;
    }
  }

  return changed;
};

const checkRunningJobTimeouts = async (now: number): Promise<number> => {
  const jobs = await getAllJobs();
  let reclaimed = 0;

  for (const job of jobs) {
    if (job.status !== "RUNNING" || !job.startedAt) continue;

    if (now - job.startedAt > job.timeoutMs) {
      const nextAttempts = (job.attempts ?? 0) + 1;
      if (nextAttempts > job.maxRetries) {
        await updateJobStatus(job.jobId, "FAILED", {
          errorMessage: "Execution timeout",
          completedAt: now,
        });
      } else {
        await updateJobStatus(job.jobId, "QUEUED", {
          assignedAgentId: null,
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          queuedAt: now,
          attempts: nextAttempts,
          errorMessage: "Execution timeout",
        });
      }
      reclaimed += 1;
    }
  }

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

const assignQueuedJobs = async (now: number): Promise<{ assigned: number }> => {
  const jobs = await getAllJobs();
  const workers = await getAllWorkers();
  const queuedJobs = jobs
    .filter((job) => job.status === "QUEUED")
    .sort((a, b) => (a.queuedAt ?? a.createdAt) - (b.queuedAt ?? b.createdAt));

  let assigned = 0;

  for (const job of queuedJobs) {
    const candidates = workers
      .filter((worker) => canFitJob(worker, job))
      .sort((a, b) => computeLoadScore(a) - computeLoadScore(b));

    if (candidates.length === 0) continue;

    const worker = candidates[0];

    await updateWorkerStatus(worker.workerId, "BUSY", {
      reservedCpu: (worker.reservedCpu ?? 0) + job.requiredCpu,
      reservedRamMb: (worker.reservedRamMb ?? 0) + job.requiredRamMb,
      currentJobIds: Array.from(
        new Set([...(worker.currentJobIds ?? []), job.jobId]),
      ),
      updatedAt: now,
    });

    await updateJobStatus(job.jobId, "ASSIGNED", {
      assignedAgentId: worker.workerId,
      assignedAt: now,
    });

    assigned += 1;
  }

  return { assigned };
};

export const scheduleJobs = async (trigger = "manual") => {
  const now = Date.now();
  const workersUpdated = await refreshWorkerHealth(now);
  const reclaimed = await checkRunningJobTimeouts(now);
  const { assigned } = await assignQueuedJobs(now);
  return { trigger, workersUpdated, reclaimed, assigned };
};

export const startSchedulerLoop = () => {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    void scheduleJobs("loop");
  }, SCHEDULER_INTERVAL_MS);
};

export const recordWorkerFailure = async (workerId: string, reason: string) => {
  const now = Date.now();
  await updateWorkerStatus(workerId, "UNHEALTHY", {
    cooldownUntil: now + AGENT_COOLDOWN_MS,
    healthReason: reason,
  });
  // Requeue jobs associated with this worker
  const workers = await getAllWorkers();
  const worker = workers.find((w) => w.workerId === workerId);
  if (worker) {
    for (const jobId of worker.currentJobIds ?? []) {
      await updateJobStatus(jobId, "QUEUED", {
        assignedAgentId: null,
        assignedAt: null,
        startedAt: null,
        completedAt: null,
        queuedAt: now,
        errorMessage: reason,
      });
    }
  }
};

export const releaseJobResources = async (jobId: string) => {
  const jobs = await getAllJobs();
  const job = jobs.find((j) => j.jobId === jobId);
  if (!job || !job.assignedAgentId) return;
  const workers = await getAllWorkers();
  const worker = workers.find((w) => w.workerId === job.assignedAgentId);
  if (!worker) return;
  await updateWorkerStatus(worker.workerId, worker.status, {
    currentJobIds: (worker.currentJobIds ?? []).filter(
      (id) => id !== job.jobId,
    ),
    reservedCpu: Math.max((worker.reservedCpu ?? 0) - job.requiredCpu, 0),
    reservedRamMb: Math.max((worker.reservedRamMb ?? 0) - job.requiredRamMb, 0),
    updatedAt: Date.now(),
  });
};

// Start periodic loop on first import
startSchedulerLoop();
