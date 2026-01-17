/**
 * Registry System - Barrel Export
 *
 * DEPRECATED: This file is now a compatibility barrel export.
 *
 * For new code, import directly from the modular structure:
 * - Types: import { JobRecord, WorkerRecord } from "@/lib/types"
 * - Registries: import { jobRegistry, workerRegistry } from "@/lib/registry"
 * - Persistence: import { saveJobs, saveWorkers } from "@/lib/registry"
 *
 * This file maintains backward compatibility with Phase 2 code that
 * imports from this location.
 *
 * @deprecated Import from @/lib/types and @/lib/registry instead
 * @module registries (legacy)
 */

// Re-export all public APIs from new modular locations
export * from "./types";
export * from "./registry";
