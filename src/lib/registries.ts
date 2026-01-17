import path from "path";
import fs from "fs";
import os from "os";

// In-memory job storage (in production, use a database)
export const jobRegistry = new Map<
  string,
  {
    jobId: string;
    workerId: string | null;
    status: "pending" | "running" | "completed" | "failed";
    command: string;
    fileUrl: string;
    filename: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    errorMessage: string | null;
    cancelRequested: boolean;
  }
>();

// In-memory worker storage
export const workerRegistry = new Map<
  string,
  {
    workerId: string;
    hostname: string;
    os: string;
    cpuCount: number;
    version: string;
    status: "idle" | "busy" | "offline";
    lastHeartbeat: number;
    createdAt: number;
    currentJobId: string | null;
  }
>();

// Helper functions for persistence
const getJobStoragePath = () =>
  path.join(os.tmpdir(), "cmd-executor-jobs.json");
const getWorkerStoragePath = () =>
  path.join(os.tmpdir(), "cmd-executor-workers.json");

export function loadJobs() {
  try {
    const filePath = getJobStoragePath();
    if (!fs.existsSync(filePath)) return;

    const data = fs.readFileSync(filePath, "utf-8");
    const jobs = JSON.parse(data);
    jobRegistry.clear();
    jobs.forEach((job: any) => {
      jobRegistry.set(job.jobId, job);
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
      workerRegistry.set(worker.workerId, worker);
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
