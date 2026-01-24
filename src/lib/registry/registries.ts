/**
 * Registry Storage - In-memory Maps
 *
 * Provides the actual Map instances for job and worker storage.
 * Separated from index.ts to avoid circular dependencies with persistence layer.
 *
 * @module registries/registries
 */

import { JobRecord, WorkerRecord } from "../types";

/**
 * Global job registry - stores all jobs by jobId
 */
export const jobRegistry = new Map<string, JobRecord>();

/**
 * Global worker registry - stores all connected workers by workerId
 */
export const workerRegistry = new Map<string, WorkerRecord>();
