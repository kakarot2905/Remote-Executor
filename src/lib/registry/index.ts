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
// In-memory registries removed. This module now only re-exports types
// for compatibility with existing imports.

// ============================================================================
// RE-EXPORTS: TYPES
// ============================================================================

/** Re-export type definitions for convenience */
export type { JobRecord, WorkerRecord, JobStatus, AgentStatus };

// ============================================================================
// RE-EXPORTS: REGISTRIES
// ============================================================================

/** Re-export registry instances for convenience */
// No registries exported

// ============================================================================
// RE-EXPORTS: FUNCTIONS
// ============================================================================

/** Re-export persistence functions for convenience */
// No persistence functions exported

// No initialization or monitoring functions; registries are removed.
