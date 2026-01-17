/**
 * Type Coercion & Normalization
 *
 * Converts raw data from storage/APIs to properly typed records.
 * Handles backward compatibility with Phase 2 legacy field names.
 * Provides sensible defaults for missing fields.
 *
 * @module registries/coercion
 */

import { JobRecord, JobStatus, WorkerRecord, AgentStatus } from "../types";
import {
  DEFAULT_JOB_TIMEOUT_MS,
  DEFAULT_JOB_CPU,
  DEFAULT_JOB_RAM_MB,
  DEFAULT_MAX_RETRIES,
} from "./constants";

// ============================================================================
// JOB COERCION
// ============================================================================

/**
 * Normalize raw job data to typed JobRecord
 *
 * Handles:
 * - Missing fields → sensible defaults (timeout, CPU, RAM, retries)
 * - Phase 2 legacy field names → Phase 3 standard fields
 *  - Backward compatibility with old status values ("pending" → "QUEUED")
 * - Field conversions (workerId → assignedAgentId)
 *
 * @param {any} raw - Raw job data from storage or API (untyped)
 * @returns {JobRecord} Properly typed and normalized job record
 *
 * @example
 * // Legacy Phase 2 data
 * const raw = {
 *   jobId: "job-123",
 *   status: "pending",        // Old status
 *   workerId: "worker-1",     // Old field name
 *   command: "npm run build"
 * };
 * const job = coerceJob(raw);
 * // Returns normalized record with:
 * // - status: "QUEUED" (converted from "pending")
 * // - assignedAgentId: "worker-1" (converted from workerId)
 * // - requiredCpu: 1 (default)
 * // - requiredRamMb: 256 (default)
 * // - timeoutMs: 300000 (default 5 min)
 */
export const coerceJob = (raw: any): JobRecord => {
  // Start with normalized base record
  const job: JobRecord = {
    jobId: raw.jobId,
    command: raw.command,
    fileUrl: raw.fileUrl,
    filename: raw.filename,

    // Apply defaults for resource requirements if not specified
    requiredCpu: raw.requiredCpu ?? DEFAULT_JOB_CPU,
    requiredRamMb: raw.requiredRamMb ?? DEFAULT_JOB_RAM_MB,
    timeoutMs: raw.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,

    // Status with defaults
    status: (raw.status as JobStatus) ?? "QUEUED",

    // Handle Phase 2 legacy "workerId" → Phase 3 "assignedAgentId"
    assignedAgentId: raw.assignedAgentId ?? raw.workerId ?? null,

    // Output fields
    stdout: raw.stdout ?? "",
    stderr: raw.stderr ?? "",
    exitCode: raw.exitCode ?? null,

    // Timestamps with defaults
    createdAt: raw.createdAt ?? Date.now(),
    queuedAt: raw.queuedAt ?? raw.createdAt ?? Date.now(),
    assignedAt: raw.assignedAt ?? null,
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,

    // State tracking
    errorMessage: raw.errorMessage ?? null,
    cancelRequested: raw.cancelRequested ?? false,
    attempts: raw.attempts ?? 0,
    maxRetries: raw.maxRetries ?? DEFAULT_MAX_RETRIES,
    lastStreamedAt: raw.lastStreamedAt,
  };

  // Normalize legacy Phase 2 status values to Phase 3 uppercase enums
  // This handles old data loaded from storage with lowercase statuses
  const legacyStatus = raw.status as any;
  if (legacyStatus === "pending") job.status = "QUEUED";
  else if (legacyStatus === "running") job.status = "RUNNING";
  else if (legacyStatus === "completed") job.status = "COMPLETED";
  else if (legacyStatus === "failed") job.status = "FAILED";

  return job;
};

// ============================================================================
// WORKER COERCION
// ============================================================================

/**
 * Normalize raw worker data to typed WorkerRecord
 *
 * Handles:
 * - Missing fields → sensible defaults
 * - Phase 2 legacy field names → Phase 3 standard fields
 * - Byte-to-MB conversions (ramTotal/ramFree in bytes → MB)
 * - Legacy status values → new uppercase enums
 * - Single job ID → array of job IDs
 *
 * @param {any} raw - Raw worker data from storage or registration (untyped)
 * @returns {WorkerRecord} Properly typed and normalized worker record
 *
 * @example
 * // Legacy Phase 2 data
 * const raw = {
 *   workerId: "worker-1",
 *   status: "idle",           // Old lowercase
 *   ramTotal: 16777216000,    // In bytes (Phase 2)
 *   ramFree: 8388608000,      // In bytes (Phase 2)
 *   currentJobId: "job-123"   // Single job (Phase 2)
 * };
 * const worker = coerceWorker(raw);
 * // Returns normalized record with:
 * // - status: "IDLE" (converted from "idle")
 * // - ramTotalMb: 16000 (converted from bytes)
 * // - ramFreeMb: 8000 (converted from bytes)
 * // - currentJobIds: ["job-123"] (converted from single ID)
 */
export const coerceWorker = (raw: any): WorkerRecord => {
  const now = Date.now();

  // Normalize status from any format to uppercase enum
  let status: AgentStatus = "IDLE";
  if (raw.status === "busy") status = "BUSY";
  else if (raw.status === "offline") status = "OFFLINE";
  else if (raw.status === "unhealthy") status = "UNHEALTHY";
  else if (raw.status === "idle") status = "IDLE";
  else if (raw.status) status = raw.status; // Use as-is if already uppercase

  return {
    workerId: raw.workerId,
    hostname: raw.hostname,
    os: raw.os,
    cpuCount: raw.cpuCount ?? 1,
    cpuUsage: raw.cpuUsage ?? 0,

    // Handle both Phase 3 MB format and Phase 2 byte format
    ramTotalMb:
      raw.ramTotalMb ?? (raw.ramTotal ? raw.ramTotal / 1024 / 1024 : 0),
    ramFreeMb: raw.ramFreeMb ?? (raw.ramFree ? raw.ramFree / 1024 / 1024 : 0),

    version: raw.version ?? "unknown",
    status,

    lastHeartbeat: raw.lastHeartbeat ?? now,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,

    // Handle both Phase 3 array format and Phase 2 single ID format
    currentJobIds:
      raw.currentJobIds ?? (raw.currentJobId ? [raw.currentJobId] : []),

    reservedCpu: raw.reservedCpu ?? 0,

    // Handle both Phase 3 MB format and Phase 2 byte format
    reservedRamMb:
      raw.reservedRamMb ??
      (raw.reservedRam ? raw.reservedRam / 1024 / 1024 : 0),

    cooldownUntil: raw.cooldownUntil ?? null,
    healthReason: raw.healthReason,
  };
};
