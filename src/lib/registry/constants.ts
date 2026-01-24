/**
 * Registry Configuration & Constants
 *
 * Centralized configuration for default values and behavior constants.
 * These constants are used across the registry system for consistency.
 *
 * @module registries/constants
 */

// ============================================================================
// JOB EXECUTION DEFAULTS
// ============================================================================

/**
 * Default timeout for jobs (5 minutes)
 *
 * Used when job submission doesn't specify timeoutMs.
 * After this time, scheduler will forcibly terminate the job.
 * Units: milliseconds
 *
 * @type {number}
 * @constant
 */
export const DEFAULT_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Default CPU requirement for jobs (1 core)
 *
 * Used when job submission doesn't specify requiredCpu.
 * Scheduler ensures assigned worker has at least this many available cores.
 * Units: logical CPU cores
 *
 * @type {number}
 * @constant
 */
export const DEFAULT_JOB_CPU = 1;

/**
 * Default RAM requirement for jobs (256 MB)
 *
 * Used when job submission doesn't specify requiredRamMb.
 * Scheduler ensures assigned worker has at least this much free RAM.
 * Units: megabytes
 *
 * @type {number}
 * @constant
 */
export const DEFAULT_JOB_RAM_MB = 256;

/**
 * Default maximum retry attempts
 *
 * If a job fails, scheduler will requeue it up to this many times.
 * After exhausting retries, job is marked FAILED permanently.
 * Used when job submission doesn't specify maxRetries.
 *
 * @type {number}
 * @constant
 */
export const DEFAULT_MAX_RETRIES = 3;

// ============================================================================
// HEARTBEAT & HEALTH DEFAULTS
// ============================================================================

/**
 * Worker heartbeat timeout threshold (30 seconds)
 *
 * If scheduler doesn't receive a heartbeat from a worker for this duration,
 * the worker is marked OFFLINE and its jobs are requeued.
 * Units: milliseconds
 *
 * @type {number}
 * @constant
 */
export const WORKER_HEARTBEAT_TIMEOUT = 30 * 1000; // 30 seconds

/**
 * Worker cooldown period after failure (30 seconds)
 *
 * When a worker fails, it enters a cooldown period where the scheduler
 * won't assign new jobs to it. This allows it time to recover.
 * After this period, if worker is still healthy, it returns to IDLE.
 * Units: milliseconds
 *
 * @type {number}
 * @constant
 */
export const WORKER_COOLDOWN_MS = 30 * 1000; // 30 seconds

// ============================================================================
// SCHEDULER DEFAULTS
// ============================================================================

/**
 * Scheduler loop interval (5 seconds)
 *
 * Scheduler runs periodically to:
 * 1. Check worker health and heartbeats
 * 2. Enforce job timeouts
 * 3. Assign queued jobs to available workers
 *
 * Can be overridden by event triggers (registration, heartbeat, job creation).
 * Units: milliseconds
 *
 * @type {number}
 * @constant
 */
export const SCHEDULER_LOOP_INTERVAL = 5 * 1000; // 5 seconds
