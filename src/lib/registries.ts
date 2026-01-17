import path from "path";
import fs from "fs";
import os from "os";

export type JobStatus =
  | "SUBMITTED"
  | "QUEUED"
  | "ASSIGNED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export type AgentStatus = "IDLE" | "BUSY" | "UNHEALTHY" | "OFFLINE";

export interface JobRecord {
  jobId: string;
  command: string;
  fileUrl: string;
  filename: string;
  requiredCpu: number; // logical cores requested
  requiredRamMb: number; // RAM requested in MB
  timeoutMs: number; // per-job timeout
  status: JobStatus;
  assignedAgentId: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  createdAt: number;
  queuedAt: number | null;
  assignedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  errorMessage: string | null;
  cancelRequested: boolean;
  attempts: number;
  maxRetries: number;
  lastStreamedAt?: number;
}

export interface WorkerRecord {
  workerId: string;
  hostname: string;
  os: string;
  cpuCount: number;
  cpuUsage: number; // percentage 0-100
  ramTotalMb: number;
  ramFreeMb: number;
  version: string;
  status: AgentStatus;
  lastHeartbeat: number;
  createdAt: number;
  updatedAt: number;
  currentJobIds: string[];
  reservedCpu: number;
  reservedRamMb: number;
  cooldownUntil: number | null;
  healthReason?: string;
}

// In-memory job storage (in production, use a database)
export const jobRegistry = new Map<string, JobRecord>();

// In-memory worker storage
export const workerRegistry = new Map<string, WorkerRecord>();

// Helper functions for persistence
const getJobStoragePath = () =>
  path.join(os.tmpdir(), "cmd-executor-jobs.json");
const getWorkerStoragePath = () =>
  path.join(os.tmpdir(), "cmd-executor-workers.json");

const DEFAULT_JOB_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_JOB_CPU = 1;
const DEFAULT_JOB_RAM_MB = 256;
const DEFAULT_MAX_RETRIES = 3;

const coerceJob = (raw: any): JobRecord => {
  const job: JobRecord = {
    jobId: raw.jobId,
    command: raw.command,
    fileUrl: raw.fileUrl,
    filename: raw.filename,
    requiredCpu: raw.requiredCpu ?? DEFAULT_JOB_CPU,
    requiredRamMb: raw.requiredRamMb ?? DEFAULT_JOB_RAM_MB,
    timeoutMs: raw.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
    status: (raw.status as JobStatus) ?? "QUEUED",
    assignedAgentId: raw.assignedAgentId ?? raw.workerId ?? null,
    stdout: raw.stdout ?? "",
    stderr: raw.stderr ?? "",
    exitCode: raw.exitCode ?? null,
    createdAt: raw.createdAt ?? Date.now(),
    queuedAt: raw.queuedAt ?? raw.createdAt ?? Date.now(),
    assignedAt: raw.assignedAt ?? null,
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,
    errorMessage: raw.errorMessage ?? null,
    cancelRequested: raw.cancelRequested ?? false,
    attempts: raw.attempts ?? 0,
    maxRetries: raw.maxRetries ?? DEFAULT_MAX_RETRIES,
    lastStreamedAt: raw.lastStreamedAt,
  };

  // Normalize legacy statuses
  const legacyStatus = raw.status as any;
  if (legacyStatus === "pending") job.status = "QUEUED";
  else if (legacyStatus === "running") job.status = "RUNNING";
  else if (legacyStatus === "completed") job.status = "COMPLETED";
  else if (legacyStatus === "failed") job.status = "FAILED";

  return job;
};

const coerceWorker = (raw: any): WorkerRecord => {
  const now = Date.now();
  let status: AgentStatus = "IDLE";
  if (raw.status === "busy") status = "BUSY";
  else if (raw.status === "offline") status = "OFFLINE";
  else if (raw.status === "unhealthy") status = "UNHEALTHY";
  else if (raw.status === "idle") status = "IDLE";
  else if (raw.status) status = raw.status;

  return {
    workerId: raw.workerId,
    hostname: raw.hostname,
    os: raw.os,
    cpuCount: raw.cpuCount ?? 1,
    cpuUsage: raw.cpuUsage ?? 0,
    ramTotalMb:
      raw.ramTotalMb ?? (raw.ramTotal ? raw.ramTotal / 1024 / 1024 : 0),
    ramFreeMb: raw.ramFreeMb ?? (raw.ramFree ? raw.ramFree / 1024 / 1024 : 0),
    version: raw.version ?? "unknown",
    status,
    lastHeartbeat: raw.lastHeartbeat ?? now,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
    currentJobIds:
      raw.currentJobIds ?? (raw.currentJobId ? [raw.currentJobId] : []),
    reservedCpu: raw.reservedCpu ?? 0,
    reservedRamMb:
      raw.reservedRamMb ??
      (raw.reservedRam ? raw.reservedRam / 1024 / 1024 : 0),
    cooldownUntil: raw.cooldownUntil ?? null,
    healthReason: raw.healthReason,
  };
};

export function loadJobs() {
  try {
    const filePath = getJobStoragePath();
    if (!fs.existsSync(filePath)) return;

    const data = fs.readFileSync(filePath, "utf-8");
    const jobs = JSON.parse(data);
    jobRegistry.clear();
    jobs.forEach((job: any) => {
      const normalized = coerceJob(job);
      jobRegistry.set(normalized.jobId, normalized);
    });
  } catch (error) {
    console.error("Failed to load jobs:", error);
  }
}

export function saveJobs() {
  try {
    const filePath = getJobStoragePath();
    const jobs = Array.from(jobRegistry.values());
    fs.writeFileSync(filePath, JSON.stringify(jobs, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save jobs:", error);
  }
}

export function loadWorkers() {
  try {
    const filePath = getWorkerStoragePath();
    if (!fs.existsSync(filePath)) return;

    const data = fs.readFileSync(filePath, "utf-8");
    const workers = JSON.parse(data);
    workerRegistry.clear();
    workers.forEach((worker: any) => {
      const normalized = coerceWorker(worker);
      workerRegistry.set(normalized.workerId, normalized);
    });
  } catch (error) {
    console.error("Failed to load workers:", error);
  }
}

export function saveWorkers() {
  try {
    const filePath = getWorkerStoragePath();
    const workers = Array.from(workerRegistry.values());
    fs.writeFileSync(filePath, JSON.stringify(workers, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save workers:", error);
  }
}

// Initialize registries on load
loadJobs();
loadWorkers();
