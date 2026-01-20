/**
 * Phase 3 Type Definitions
 *
 * Core types for job execution and worker management.
 * These types define the contract for all operations across the system.
 *
 * @module types
 */

// ============================================================================
// JOB STATE MACHINE
// ============================================================================

/**
 * Job lifecycle states (Phase 3 state machine)
 *
 * State transitions:
 * ```
 * SUBMITTED (0s)
 *    ↓
 * QUEUED (on scheduler)
 *    ↓
 * ASSIGNED (to worker)
 *    ↓
 * RUNNING (worker executing)
 *    ↓
 * COMPLETED or FAILED (on result)
 * ```
 *
 * @typedef {string} JobStatus
 * @property {string} SUBMITTED - Initial state: job received
 * @property {string} QUEUED - Waiting for scheduler assignment
 * @property {string} ASSIGNED - Assigned to worker, pending execution
 * @property {string} RUNNING - Actively executing on worker
 * @property {string} COMPLETED - Job finished successfully (exit code 0)
 * @property {string} FAILED - Job finished with error (exit code != 0)
 */
export type JobStatus =
  | "SUBMITTED" // Initial state: job received
  | "QUEUED" // Waiting for assignment
  | "ASSIGNED" // Assigned to worker, pending execution
  | "RUNNING" // Actively executing on worker
  | "COMPLETED" // Job finished successfully
  | "FAILED"; // Job finished with error

// ============================================================================
// WORKER STATE MACHINE
// ============================================================================

/**
 * Worker health and availability states
 *
 * State meanings:
 * - **IDLE**: Worker available and ready for jobs
 * - **BUSY**: Worker actively executing one or more jobs
 * - **UNHEALTHY**: Worker failed/unreachable, entering cooldown period
 * - **OFFLINE**: Worker not responding to heartbeats (30s+ no contact)
 *
 * Transitions:
 * ```
 * IDLE ↔ BUSY (on job assignment/completion)
 * (any state) → UNHEALTHY (on failure)
 * UNHEALTHY → IDLE or OFFLINE (after cooldown or timeout)
 * ```
 *
 * @typedef {string} AgentStatus
 * @property {string} IDLE - Worker available for jobs
 * @property {string} BUSY - Worker executing jobs
 * @property {string} UNHEALTHY - Worker failed, in cooldown
 * @property {string} OFFLINE - Worker unreachable, no heartbeat
 */
export type AgentStatus = "IDLE" | "BUSY" | "UNHEALTHY" | "OFFLINE";

// ============================================================================
// JOB EXECUTION RECORD
// ============================================================================

/**
 * Job execution record - tracks complete job lifecycle
 *
 * A JobRecord represents a single job from submission through completion.
 * It contains all execution metadata, resource requirements, state tracking,
 * output capture, and performance metrics.
 *
 * Usage lifecycle:
 * 1. Created with default values on job submission
 * 2. Updated as scheduler assigns to workers
 * 3. Modified as worker executes and streams output
 * 4. Finalized on completion with exit code
 *
 * @interface JobRecord
 */
export interface JobRecord {
  // ────────────────────────────────────────────────────────────────────────
  // IDENTITY
  // ────────────────────────────────────────────────────────────────────────

  /** Unique job identifier (format: job-${timestamp}-${randomId}) */
  jobId: string;

  // ────────────────────────────────────────────────────────────────────────
  // EXECUTION METADATA
  // ────────────────────────────────────────────────────────────────────────

  /** Command(s) to execute (newline-separated for multiple commands) */
  command: string;

  /** URL to fetch project ZIP file from server */
  fileUrl: string;

  /** Filename of uploaded ZIP (used for extraction) */
  filename: string;

  // ────────────────────────────────────────────────────────────────────────
  // RESOURCE REQUIREMENTS (Phase 3)
  // ────────────────────────────────────────────────────────────────────────

  /** Logical CPU cores needed (scheduler checks worker availability) */
  requiredCpu: number;

  /** RAM needed in MB (scheduler validates before assignment) */
  requiredRamMb: number;

  /** Max execution time in milliseconds (scheduler enforces timeout) */
  timeoutMs: number;

  /** Optional Docker container image for sandbox execution */
  containerImage?: string;

  /** Optional working directory for command execution */
  workDir?: string;

  // ────────────────────────────────────────────────────────────────────────
  // EXECUTION STATE
  // ────────────────────────────────────────────────────────────────────────

  /** Current lifecycle state in state machine (see JobStatus) */
  status: JobStatus;

  /** Worker ID currently executing this job (null if not assigned) */
  assignedAgentId: string | null;

  /** User requested job cancellation (worker checks this flag) */
  cancelRequested: boolean;

  /** Number of times this job has been attempted (incremented on retry) */
  attempts: number;

  /** Maximum retry attempts allowed before marking FAILED */
  maxRetries: number;

  // ────────────────────────────────────────────────────────────────────────
  // OUTPUT CAPTURE
  // ────────────────────────────────────────────────────────────────────────

  /** Accumulated stdout from job execution */
  stdout: string;

  /** Accumulated stderr from job execution */
  stderr: string;

  /** Process exit code (0 = success, non-zero = failure) */
  exitCode: number | null;

  /** Error message if job failed (populated on failure) */
  errorMessage: string | null;

  // ────────────────────────────────────────────────────────────────────────
  // LIFECYCLE TIMESTAMPS (for performance tracking)
  // ────────────────────────────────────────────────────────────────────────

  /** When job was submitted to system */
  createdAt: number;

  /** When job moved to QUEUED state (scheduler decision) */
  queuedAt: number | null;

  /** When job assigned to worker */
  assignedAt: number | null;

  /** When job started executing (RUNNING state) */
  startedAt: number | null;

  /** When job completed or failed */
  completedAt: number | null;

  /** Last time output was streamed from worker (for real-time updates) */
  lastStreamedAt?: number;
}

// ============================================================================
// WORKER AGENT RECORD
// ============================================================================

/**
 * Worker agent registration record - tracks connected worker state
 *
 * A WorkerRecord represents a single connected worker agent, including:
 * - Identity and capabilities (CPU count, OS, version)
 * - Current state (IDLE/BUSY/UNHEALTHY/OFFLINE)
 * - Resource availability and reservations
 * - Health tracking and cooldown management
 * - Active jobs being executed
 *
 * Usage lifecycle:
 * 1. Created on worker registration with initial metrics
 * 2. Updated on each heartbeat with new CPU/RAM metrics
 * 3. Status changed as jobs are assigned/completed
 * 4. Resources reserved/released as needed
 * 5. Cooldown applied on failure, cleared on recovery
 *
 * @interface WorkerRecord
 */
export interface WorkerRecord {
  // ────────────────────────────────────────────────────────────────────────
  // IDENTITY & METADATA
  // ────────────────────────────────────────────────────────────────────────

  /** Unique worker identifier (generated on worker startup) */
  workerId: string;

  /** Machine hostname where worker is running */
  hostname: string;

  /** Operating system (win32, linux, darwin) */
  os: string;

  /** Worker agent version (semantic versioning) */
  version: string;

  // ────────────────────────────────────────────────────────────────────────
  // HARDWARE CAPABILITIES & METRICS
  // ────────────────────────────────────────────────────────────────────────

  /** Total logical CPU cores available on machine */
  cpuCount: number;

  /** Current CPU usage percentage (0-100%, updated on heartbeat) */
  cpuUsage: number;

  /** Total RAM available in MB (static, set on registration) */
  ramTotalMb: number;

  /** Free RAM available in MB (updated on heartbeat) */
  ramFreeMb: number;

  // ────────────────────────────────────────────────────────────────────────
  // RESOURCE MANAGEMENT (Phase 3)
  // ────────────────────────────────────────────────────────────────────────

  /** Current health state (IDLE, BUSY, UNHEALTHY, OFFLINE) */
  status: AgentStatus;

  /** Array of job IDs currently executing on this worker */
  currentJobIds: string[];

  /** CPU cores reserved by assigned jobs (deducted from available) */
  reservedCpu: number;

  /** RAM reserved by assigned jobs in MB (deducted from available) */
  reservedRamMb: number;

  /** Timestamp when worker cooldown expires (after failure, null if not in cooldown) */
  cooldownUntil: number | null;

  // ────────────────────────────────────────────────────────────────────────
  // HEALTH TRACKING
  // ────────────────────────────────────────────────────────────────────────

  /** Timestamp of last successful heartbeat */
  lastHeartbeat: number;

  /** Reason if worker is UNHEALTHY (e.g., "Failed after 3 attempts") */
  healthReason?: string;

  // ────────────────────────────────────────────────────────────────────────
  // METADATA
  // ────────────────────────────────────────────────────────────────────────

  /** When worker first registered with system */
  createdAt: number;

  /** When worker state was last updated */
  updatedAt: number;
}
