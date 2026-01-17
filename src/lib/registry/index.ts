/**
 * Phase 3 Registry System - Main Index
 *
 * Central in-memory registry for tracking distributed jobs and worker agents.
 * Provides persistence layer for job and worker state across server restarts.
 *
 * **Architecture:**
 * - `types.ts` - Type definitions (JobStatus, AgentStatus, JobRecord, WorkerRecord)
 * - `constants.ts` - Configuration & default values
 * - `coercion.ts` - Type normalization (backward compatibility)
 * - `persistence.ts` - Load/save operations
 * - `index.ts` (this file) - Main registries & barrel exports
 *
 * **Usage:**
 * ```typescript
 * import { jobRegistry, workerRegistry, saveJobs, saveWorkers } from "@/lib/registries";
 *
 * // Access jobs
 * const job = jobRegistry.get(jobId);
 * jobRegistry.set(jobId, updatedJob);
 * Array.from(jobRegistry.values()); // Get all jobs
 *
 * // Access workers
 * const worker = workerRegistry.get(workerId);
 * workerRegistry.set(workerId, updatedWorker);
 *
 * // Persist to disk
 * saveJobs();
 * saveWorkers();
 * ```
 *
 * @module registries
 */

import { JobRecord, WorkerRecord, JobStatus, AgentStatus } from "../types";
import { loadJobs, saveJobs, loadWorkers, saveWorkers } from "./persistence";

// ============================================================================
// RE-EXPORTS: TYPES
// ============================================================================

/** Re-export type definitions for convenience */
export type { JobRecord, WorkerRecord, JobStatus, AgentStatus };

// ============================================================================
// RE-EXPORTS: FUNCTIONS
// ============================================================================

/** Re-export persistence functions for convenience */
export { loadJobs, saveJobs, loadWorkers, saveWorkers };

// ============================================================================
// IN-MEMORY REGISTRIES
// ============================================================================

/**
 * Global job registry - stores all jobs by jobId
 *
 * **Purpose:**
 * Central, in-memory store for all job objects. Provides O(1) access
 * to any job by ID and allows efficient iteration over all jobs.
 *
 * **Usage:**
 * ```typescript
 * // Store/update a job
 * jobRegistry.set(jobId, jobRecord);
 *
 * // Retrieve a job
 * const job = jobRegistry.get(jobId);
 *
 * // Delete a job
 * jobRegistry.delete(jobId);
 *
 * // Iterate all jobs
 * for (const job of jobRegistry.values()) {
 *   console.log(job.jobId, job.status);
 * }
 *
 * // Get count
 * jobRegistry.size;
 *
 * // Clear all
 * jobRegistry.clear();
 * ```
 *
 * **Persistence:**
 * - Automatically saved to `/tmp/cmd-executor-jobs.json` after each update via saveJobs()
 * - Automatically loaded from storage on module initialization
 * - State survives server restarts
 *
 * **Memory characteristics:**
 * - ~1KB per job (metadata only)
 * - 100 jobs ≈ 100KB RAM
 * - 1000 jobs ≈ 1MB RAM
 *
 * **Thread safety:**
 * Single-threaded Node.js environment, but Map operations are atomic.
 * Always call saveJobs() after modifications to ensure persistence.
 *
 * @type {Map<string, JobRecord>}
 * @constant
 */
export const jobRegistry = new Map<string, JobRecord>();

/**
 * Global worker registry - stores all connected workers by workerId
 *
 * **Purpose:**
 * Central, in-memory store for all worker objects. Tracks connected agents,
 * their resource availability, and current jobs. Provides O(1) access to any
 * worker by ID.
 *
 * **Usage:**
 * ```typescript
 * // Register/update a worker
 * workerRegistry.set(workerId, workerRecord);
 *
 * // Retrieve a worker
 * const worker = workerRegistry.get(workerId);
 *
 * // Delete a worker
 * workerRegistry.delete(workerId);
 *
 * // Find all IDLE workers
 * const idleWorkers = Array.from(workerRegistry.values())
 *   .filter(w => w.status === "IDLE");
 *
 * // Get count
 * workerRegistry.size;
 *
 * // Clear all
 * workerRegistry.clear();
 * ```
 *
 * **Persistence:**
 * - Automatically saved to `/tmp/cmd-executor-workers.json` after each update via saveWorkers()
 * - Automatically loaded from storage on module initialization
 * - State survives server restarts
 *
 * **Memory characteristics:**
 * - ~2KB per worker (including current jobs array)
 * - 100 workers ≈ 200KB RAM
 * - 1000 workers ≈ 2MB RAM
 *
 * **Thread safety:**
 * Single-threaded Node.js environment, but Map operations are atomic.
 * Always call saveWorkers() after modifications to ensure persistence.
 *
 * **Health tracking:**
 * Scheduler periodically checks lastHeartbeat timestamp. Workers not
 * responding for 30 seconds are marked OFFLINE, triggering job requeue.
 *
 * @type {Map<string, WorkerRecord>}
 * @constant
 */
export const workerRegistry = new Map<string, WorkerRecord>();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize registries on module load
 *
 * Called automatically when this module is first imported.
 * Restores previous session state (jobs and workers) from /tmp storage.
 * If storage files don't exist (first run), starts with empty registries.
 *
 * **Process:**
 * 1. loadJobs() reads /tmp/cmd-executor-jobs.json
 * 2. loadWorkers() reads /tmp/cmd-executor-workers.json
 * 3. All data is normalized using coerceJob() and coerceWorker()
 * 4. Registries populated with normalized records
 * 5. Scheduler can now query existing jobs/workers
 *
 * @private
 */
loadJobs();
loadWorkers();

// ============================================================================
// DEBUG & MONITORING
// ============================================================================

/**
 * Get registry statistics (for monitoring/debugging)
 *
 * Returns counts of jobs and workers by status for observability.
 * Useful for dashboards and health checks.
 *
 * @returns {object} Registry statistics
 * @example
 * const stats = getRegistryStats();
 * // {
 * //   jobs: {
 * //     total: 100,
 * //     QUEUED: 20,
 * //     RUNNING: 5,
 * //     COMPLETED: 70,
 * //     FAILED: 5
 * //   },
 * //   workers: {
 * //     total: 10,
 * //     IDLE: 6,
 * //     BUSY: 3,
 * //     OFFLINE: 1
 * //   }
 * // }
 */
export function getRegistryStats() {
  const jobsByStatus: Record<JobStatus, number> = {
    SUBMITTED: 0,
    QUEUED: 0,
    ASSIGNED: 0,
    RUNNING: 0,
    COMPLETED: 0,
    FAILED: 0,
  };

  for (const job of jobRegistry.values()) {
    jobsByStatus[job.status]++;
  }

  const workersByStatus: Record<AgentStatus, number> = {
    IDLE: 0,
    BUSY: 0,
    UNHEALTHY: 0,
    OFFLINE: 0,
  };

  for (const worker of workerRegistry.values()) {
    workersByStatus[worker.status]++;
  }

  return {
    jobs: {
      total: jobRegistry.size,
      ...jobsByStatus,
    },
    workers: {
      total: workerRegistry.size,
      ...workersByStatus,
    },
  };
}
