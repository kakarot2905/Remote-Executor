/**
 * Registry Persistence Layer
 *
 * Handles loading and saving job/worker state to/from persistent storage.
 * Automatically called on registries initialization and after state changes.
 *
 * @module registries/persistence
 */

import { jobRegistry, workerRegistry } from "./registries";
import { coerceJob, coerceWorker } from "./coercion";
import {
  saveJob as saveJobToMongo,
  getAllJobs as getAllJobsFromMongo,
} from "../models/job";
import {
  saveWorker as saveWorkerToMongo,
  getAllWorkers as getAllWorkersFromMongo,
} from "../models/worker";

// ============================================================================
// JOB PERSISTENCE
// ============================================================================

/**
 * Load jobs from persistent storage
 *
 * Pulls job state from MongoDB so data survives restarts and works in
 * distributed deployments. All loaded jobs are normalized using coerceJob()
 * for type safety.
 *
 * @function loadJobs
 * @returns {void}
 * @throws {void} - Errors are logged but not thrown
 */
export function loadJobs() {
  try {
    getAllJobsFromMongo()
      .then((jobs) => {
        jobRegistry.clear();
        jobs.forEach((job) => {
          const normalized = coerceJob(job);
          jobRegistry.set(normalized.jobId, normalized);
        });

        console.log(`[Registry] Loaded ${jobs.length} jobs from MongoDB`);
      })
      .catch((error) => {
        console.error("[Registry] Failed to load jobs from MongoDB:", error);
      });
  } catch (error) {
    console.error("[Registry] Unexpected error while loading jobs:", error);
  }
}

/**
 * Save all jobs to persistent storage
 *
 * Writes current job registry to MongoDB for durability.
 * Called automatically after job state changes (creation, completion, failure).
 * Waits for all MongoDB operations to complete before returning.
 *
 * @function saveJobs
 * @returns {Promise<void>}
 * @throws {void} - Errors are logged but not thrown
 */
export async function saveJobs(): Promise<void> {
  try {
    const jobs = Array.from(jobRegistry.values());

    const results = await Promise.allSettled(
      jobs.map((job) => saveJobToMongo(job)),
    );

    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      console.error(
        `[Registry] Failed to persist ${failures.length} job(s) to MongoDB`,
        failures.map((f) => (f as PromiseRejectedResult).reason),
      );
    } else if (jobs.length > 0) {
      console.log(`[Registry] Persisted ${jobs.length} jobs to MongoDB`);
    }
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
 * Pulls worker state from MongoDB so data survives restarts and distributed
 * deployments. All loaded workers are normalized using coerceWorker() for
 * type safety.
 *
 * @function loadWorkers
 * @returns {void}
 * @throws {void} - Errors are logged but not thrown
 */
export function loadWorkers() {
  try {
    getAllWorkersFromMongo()
      .then((workers) => {
        workerRegistry.clear();
        workers.forEach((worker) => {
          const normalized = coerceWorker(worker);
          workerRegistry.set(normalized.workerId, normalized);
        });

        console.log(`[Registry] Loaded ${workers.length} workers from MongoDB`);
      })
      .catch((error) => {
        console.error("[Registry] Failed to load workers from MongoDB:", error);
      });
  } catch (error) {
    console.error("[Registry] Unexpected error while loading workers:", error);
    // Continue silently - registries will start empty
  }
}

/**
 * Save all workers to persistent storage
 *
 * Writes current worker registry to MongoDB for durability.
 * Called automatically after worker registration, heartbeat, or state change.
 * Waits for all MongoDB operations to complete before returning.
 *
 * @function saveWorkers
 * @returns {Promise<void>}
 * @throws {void} - Errors are logged but not thrown
 */
export async function saveWorkers(): Promise<void> {
  try {
    const workers = Array.from(workerRegistry.values());

    const results = await Promise.allSettled(
      workers.map((worker) => saveWorkerToMongo(worker)),
    );

    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      console.error(
        `[Registry] Failed to persist ${failures.length} worker(s) to MongoDB`,
        failures.map((f) => (f as PromiseRejectedResult).reason),
      );
    } else if (workers.length > 0) {
      console.log(`[Registry] Persisted ${workers.length} workers to MongoDB`);
    }
  } catch (error) {
    console.error("[Registry] Failed to save workers:", error);
    // Continue silently - workers remain in memory
  }
}
