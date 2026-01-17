/**
 * Registry Persistence Layer
 *
 * Handles loading and saving job/worker state to/from persistent storage.
 * Automatically called on registries initialization and after state changes.
 *
 * @module registries/persistence
 */

import fs from "fs";
import { jobRegistry, workerRegistry } from "./index";
import { getJobStoragePath, getWorkerStoragePath } from "./constants";
import { coerceJob, coerceWorker } from "./coercion";

// ============================================================================
// JOB PERSISTENCE
// ============================================================================

/**
 * Load jobs from persistent storage
 *
 * Reads job state from `/tmp/cmd-executor-jobs.json` if it exists.
 * All loaded jobs are normalized using coerceJob() for type safety.
 * Silently skips if file doesn't exist (normal on first run).
 * Logs errors to console but doesn't throw (graceful degradation).
 *
 * **When called:**
 * - On module initialization (registries.ts startup)
 * - Can be manually called to reload state from disk
 *
 * **State recovery:**
 * Allows job state to survive server restarts. Any jobs that were in
 * progress when server crashed will be restored and potentially requeued
 * by the scheduler on next run.
 *
 * @function loadJobs
 * @returns {void}
 * @throws {void} - Errors are logged but not thrown
 *
 * @example
 * // Automatic on server startup
 * // Restores: 50 previous jobs
 * // Scheduler will determine which to requeue based on current state
 * loadJobs();
 */
export function loadJobs() {
  try {
    const filePath = getJobStoragePath();

    // Silently skip if file doesn't exist (first run)
    if (!fs.existsSync(filePath)) return;

    const data = fs.readFileSync(filePath, "utf-8");
    const jobs = JSON.parse(data);

    jobRegistry.clear();
    jobs.forEach((job: any) => {
      const normalized = coerceJob(job);
      jobRegistry.set(normalized.jobId, normalized);
    });

    console.log(`[Registry] Loaded ${jobs.length} jobs from storage`);
  } catch (error) {
    console.error("[Registry] Failed to load jobs:", error);
    // Continue silently - registries will start empty
  }
}

/**
 * Save all jobs to persistent storage
 *
 * Writes current job registry to `/tmp/cmd-executor-jobs.json`.
 * File is formatted with 2-space indentation for readability.
 * Called automatically after job state changes (creation, completion, failure).
 *
 * **When called:**
 * - After job submission via `/api/jobs/create`
 * - After job state changes (assignment, execution, completion)
 * - After scheduler updates (timeout, requeue)
 * - Can be manually called to force sync to disk
 *
 * **Performance:**
 * ~10-50ms for 100s of jobs (depends on disk speed).
 * Non-blocking - doesn't await filesystem.
 *
 * **Errors:**
 * Logged to console but not thrown. Jobs remain in memory even if save fails,
 * which can cause data loss on crash but keeps system running.
 *
 * @function saveJobs
 * @returns {void}
 * @throws {void} - Errors are logged but not thrown
 *
 * @example
 * // After updating a job
 * job.status = "COMPLETED";
 * jobRegistry.set(jobId, job);
 * saveJobs();  // Persist to disk immediately
 */
export function saveJobs() {
  try {
    const filePath = getJobStoragePath();
    const jobs = Array.from(jobRegistry.values());
    fs.writeFileSync(filePath, JSON.stringify(jobs, null, 2), "utf-8");
  } catch (error) {
    console.error("[Registry] Failed to save jobs:", error);
    // Continue silently - jobs remain in memory
  }
}

// ============================================================================
// WORKER PERSISTENCE
// ============================================================================

/**
 * Load workers from persistent storage
 *
 * Reads worker state from `/tmp/cmd-executor-workers.json` if it exists.
 * All loaded workers are normalized using coerceWorker() for type safety.
 * Silently skips if file doesn't exist (normal on first run).
 * Logs errors to console but doesn't throw (graceful degradation).
 *
 * **When called:**
 * - On module initialization (registries.ts startup)
 * - Can be manually called to reload state from disk
 *
 * **Important note:**
 * Worker state is not critical to recovery. Even if workers are lost,
 * they will re-register on next startup. This load is mainly for
 * tracking how many workers were active at last shutdown.
 *
 * **State recovery:**
 * Workers loaded from storage are initially OFFLINE until they send
 * a heartbeat (20-30 seconds after startup). Jobs assigned to them
 * will be requeued by scheduler if worker doesn't recover.
 *
 * @function loadWorkers
 * @returns {void}
 * @throws {void} - Errors are logged but not thrown
 *
 * @example
 * // Automatic on server startup
 * // Restores: 3 previous workers
 * // Workers will re-register or be marked OFFLINE after heartbeat timeout
 * loadWorkers();
 */
export function loadWorkers() {
  try {
    const filePath = getWorkerStoragePath();

    // Silently skip if file doesn't exist (first run)
    if (!fs.existsSync(filePath)) return;

    const data = fs.readFileSync(filePath, "utf-8");
    const workers = JSON.parse(data);

    workerRegistry.clear();
    workers.forEach((worker: any) => {
      const normalized = coerceWorker(worker);
      workerRegistry.set(normalized.workerId, normalized);
    });

    console.log(`[Registry] Loaded ${workers.length} workers from storage`);
  } catch (error) {
    console.error("[Registry] Failed to load workers:", error);
    // Continue silently - registries will start empty
  }
}

/**
 * Save all workers to persistent storage
 *
 * Writes current worker registry to `/tmp/cmd-executor-workers.json`.
 * File is formatted with 2-space indentation for readability.
 * Called automatically after worker registration, heartbeat, or state change.
 *
 * **When called:**
 * - After worker registration via `/api/workers/register`
 * - After heartbeat updates via `/api/workers/heartbeat`
 * - After worker status changes (IDLE → BUSY, BUSY → OFFLINE, etc.)
 * - Can be manually called to force sync to disk
 *
 * **Performance:**
 * ~10-50ms for 100s of workers (depends on disk speed).
 * Non-blocking - doesn't await filesystem.
 *
 * **Errors:**
 * Logged to console but not thrown. Workers remain in memory even if save fails,
 * which can cause data loss on crash but keeps system running.
 *
 * @function saveWorkers
 * @returns {void}
 * @throws {void} - Errors are logged but not thrown
 *
 * @example
 * // After worker registration
 * workerRegistry.set(workerId, workerRecord);
 * saveWorkers();  // Persist to disk immediately
 */
export function saveWorkers() {
  try {
    const filePath = getWorkerStoragePath();
    const workers = Array.from(workerRegistry.values());
    fs.writeFileSync(filePath, JSON.stringify(workers, null, 2), "utf-8");
  } catch (error) {
    console.error("[Registry] Failed to save workers:", error);
    // Continue silently - workers remain in memory
  }
}
