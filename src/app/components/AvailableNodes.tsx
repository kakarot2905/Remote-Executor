"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Server,
  Cpu,
  HardDrive,
  Trash2,
  Activity,
  Clock,
  X,
  Globe,
  Monitor,
  Container,
} from "lucide-react";

interface Worker {
  workerId: string;
  status: "IDLE" | "BUSY" | "UNHEALTHY" | "OFFLINE";
  hostname: string;
  os: string;
  cpuCount: number;
  cpuUsage?: number;
  ramTotalMb?: number;
  ramFreeMb?: number;
  lastHeartbeat: number;
  currentJobIds: string[];
  reservedCpu?: number;
  reservedRamMb?: number;
  updatedAt?: number;
  dockerContainers?: number;
  dockerCpuUsage?: number;
  dockerMemoryMb?: number;
}

const StatusIndicator = React.memo(({ status }: { status: string }) => {
  const variants = {
    IDLE: "bg-emerald-500",
    BUSY: "bg-amber-500",
    UNHEALTHY: "bg-red-500",
    OFFLINE: "bg-gray-400",
  };

  return (
    <div
      className={`w-2 h-2 rounded-full ${variants[status as keyof typeof variants] || variants.OFFLINE}`}
    />
  );
});

StatusIndicator.displayName = "StatusIndicator";

const WorkerDetailsModal = React.memo(
  ({
    worker,
    isOpen,
    onClose,
  }: {
    worker: Worker | null;
    isOpen: boolean;
    onClose: () => void;
  }) => {
    if (!isOpen || !worker) return null;

    const isOffline = Date.now() - worker.lastHeartbeat > 15000;

    return (
      <div className="fixed inset-0  bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-card border border-border rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto  backdrop-blur-sm">
          {/* Header */}
          <div className="border-b border-border px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Worker Details
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-secondary rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Status Section */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Worker ID
                </p>
                <p className="font-mono text-sm font-medium text-foreground break-all">
                  {worker.workerId}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Status
                </p>
                <div className="flex items-center gap-2">
                  <StatusIndicator
                    status={isOffline ? "OFFLINE" : worker.status}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {isOffline ? "OFFLINE" : worker.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Host Information */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Host Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Hostname</p>
                  <p className="text-sm text-foreground">{worker.hostname}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">OS</p>
                  <p className="text-sm text-foreground capitalize">
                    {worker.os
                      .replace("win32", "Windows")
                      .replace("linux", "Linux")
                      .replace("darwin", "macOS")}
                  </p>
                </div>
              </div>
            </div>

            {/* Resource Metrics */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Resources
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">CPU</p>
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="font-medium text-foreground">
                        {worker.cpuCount}
                      </span>
                      <span className="text-muted-foreground"> cores</span>
                    </p>
                    {worker.cpuUsage !== undefined && (
                      <p className="text-sm text-muted-foreground">
                        Usage: {Math.round(worker.cpuUsage)}%
                      </p>
                    )}
                    {worker.reservedCpu !== undefined && (
                      <p className="text-sm text-muted-foreground">
                        Reserved: {worker.reservedCpu}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">RAM</p>
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="font-medium text-foreground">
                        {worker.ramFreeMb || "?"}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {worker.ramTotalMb || "?"} MB
                      </span>
                    </p>
                    {worker.reservedRamMb !== undefined && (
                      <p className="text-sm text-muted-foreground">
                        Reserved: {worker.reservedRamMb} MB
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Jobs Section */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Active Jobs
              </h3>
              {worker.currentJobIds && worker.currentJobIds.length > 0 ? (
                <div className="space-y-2">
                  {worker.currentJobIds.map((jobId) => (
                    <div
                      key={jobId}
                      className="px-3 py-2 bg-secondary/30 rounded text-sm font-mono text-foreground"
                    >
                      {jobId}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active jobs</p>
              )}
            </div>

            {/* Docker Section */}
            {(worker.dockerContainers ?? 0) > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Docker
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Containers
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {worker.dockerContainers}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">CPU</p>
                    <p className="text-sm font-medium text-foreground">
                      {Math.round(worker.dockerCpuUsage ?? 0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Memory</p>
                    <p className="text-sm font-medium text-foreground">
                      {worker.dockerMemoryMb ?? 0} MB
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Heartbeat Section */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Activity
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Last Heartbeat
                  </p>
                  <p className="text-sm text-foreground">
                    {new Date(worker.lastHeartbeat).toLocaleString()}
                  </p>
                </div>
                {worker.updatedAt && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Last Updated
                    </p>
                    <p className="text-sm text-foreground">
                      {new Date(worker.updatedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

WorkerDetailsModal.displayName = "WorkerDetailsModal";

const WorkerCard = React.memo(
  ({
    worker,
    onSelect,
    onDelete,
    formatTime,
  }: {
    worker: Worker;
    onSelect: (worker: Worker) => void;
    onDelete: (workerId: string) => void;
    formatTime: (timestamp: number) => string;
  }) => {
    const isOffline = Date.now() - worker.lastHeartbeat > 15000;
    const activeJobs = worker.currentJobIds?.length || 0;
    const statusLabel = isOffline ? "OFFLINE" : worker.status;
    const cpuFree = worker.cpuCount - (worker.reservedCpu || 0);

    const handleDelete = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (
          window.confirm(`Delete ${worker.workerId}? This cannot be undone.`)
        ) {
          onDelete(worker.workerId);
        }
      },
      [worker.workerId, onDelete],
    );

    return (
      <button
        onClick={() => onSelect(worker)}
        className={`w-full text-left p-4 border border-border rounded-lg transition-all duration-200 hover:border-primary/50 hover:bg-card ${
          isOffline ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <StatusIndicator status={statusLabel} />
            <p className="font-mono text-sm font-medium text-foreground truncate">
              {worker.workerId}
            </p>
          </div>
          <button
            onClick={handleDelete}
            className="group/delete opacity-0 hover:opacity-100 transition-opacity p-1.5 hover:bg-destructive/10 rounded text-destructive"
            title="Delete node"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-6 gap-2 text-xs">
          <div className="bg-secondary/20 rounded p-2 flex flex-col items-center justify-center">
            <HardDrive className="w-4 h-4 text-muted-foreground mb-1" />
            <p className="font-semibold text-foreground text-sm">
              {worker.ramFreeMb || "?"} MB
            </p>
          </div>

          <div className="bg-secondary/20 rounded p-2 flex flex-col items-center justify-center">
            <Clock className="w-4 h-4 text-muted-foreground mb-1" />
            <p className="font-semibold text-foreground text-sm">
              {formatTime(worker.lastHeartbeat)}
            </p>
          </div>

          <div className="bg-secondary/20 rounded p-2 flex flex-col items-center justify-center">
            <Monitor className="w-4 h-4 text-muted-foreground mb-1" />
            <p className="font-semibold text-foreground text-sm">
              {worker.os.includes("win")
                ? "Win"
                : worker.os.includes("linux")
                  ? "Linux"
                  : "macOS"}
            </p>
          </div>


          <div className="bg-secondary/20 rounded p-2 flex flex-col items-center justify-center">
            <Cpu className="w-4 h-4 text-muted-foreground mb-1" />
            <p className="font-semibold text-foreground text-sm">
              {cpuFree}/{worker.cpuCount}
            </p>
          </div>

          <div className="bg-secondary/20 rounded p-2 flex flex-col items-center justify-center">
            <Activity className="w-4 h-4 text-muted-foreground mb-1" />
            <p className="font-semibold text-foreground text-sm">
              {activeJobs}
            </p>
          </div>

          {(worker.dockerContainers ?? 0) > 0 && (
            <div className="bg-secondary/20 rounded p-2 flex flex-col items-center justify-center">
              <Container className="w-4 h-4 text-muted-foreground mb-1" />
              <p className="font-semibold text-foreground text-sm">
                {worker.dockerContainers}
              </p>
            </div>
          )}
        </div>
      </button>
    );
  },
);

WorkerCard.displayName = "WorkerCard";

export default function AvailableNodes() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    idle: 0,
    busy: 0,
    unhealthy: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  const formatTime = useCallback((timestamp: number) => {
    if (!timestamp) return "never";
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  }, []);

  useEffect(() => {
    if (!selectedWorker) return;
    const updatedWorker = workers.find(
      (worker) => worker.workerId === selectedWorker.workerId,
    );
    if (updatedWorker && updatedWorker !== selectedWorker) {
      setSelectedWorker(updatedWorker);
    }
  }, [workers, selectedWorker]);

  const handleDeleteWorker = useCallback(
    async (workerId: string) => {
      try {
        const res = await fetch(`/api/workers/${workerId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to delete worker");
        }
        setWorkers((prev) => prev.filter((w) => w.workerId !== workerId));
        setStats((prev) => {
          const deletedWorker = workers.find((w) => w.workerId === workerId);
          if (!deletedWorker) return prev;
          return {
            ...prev,
            total: Math.max(0, prev.total - 1),
            idle: Math.max(
              0,
              prev.idle - (deletedWorker.status === "IDLE" ? 1 : 0),
            ),
            busy: Math.max(
              0,
              prev.busy - (deletedWorker.status === "BUSY" ? 1 : 0),
            ),
            unhealthy: Math.max(
              0,
              prev.unhealthy - (deletedWorker.status === "UNHEALTHY" ? 1 : 0),
            ),
          };
        });
      } catch (err) {
        console.error("Failed to delete worker:", err);
        alert(err instanceof Error ? err.message : "Failed to delete worker");
      }
    },
    [workers],
  );

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const response = await fetch("/api/workers/list");
        if (response.ok) {
          const data = await response.json();
          const sortedWorkers = (data.workers || []).sort(
            (a: Worker, b: Worker) => {
              const now = Date.now();
              const HEARTBEAT_TIMEOUT = 15000;

              const aIsOffline = now - a.lastHeartbeat > HEARTBEAT_TIMEOUT;
              const bIsOffline = now - b.lastHeartbeat > HEARTBEAT_TIMEOUT;

              if (aIsOffline && !bIsOffline) return 1;
              if (!aIsOffline && bIsOffline) return -1;

              if (!aIsOffline && !bIsOffline) {
                if (a.status === "IDLE" && b.status === "BUSY") return -1;
                if (a.status === "BUSY" && b.status === "IDLE") return 1;
              }

              return 0;
            },
          );
          setWorkers(sortedWorkers);
          setStats({
            total: data.totalWorkers || 0,
            idle: data.idleWorkers || 0,
            busy: data.busyWorkers || 0,
            unhealthy: data.unhealthyWorkers || 0,
          });
        }
      } catch (error) {
        console.error("Failed to fetch workers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkers();
    const interval = setInterval(fetchWorkers, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full flex flex-col bg-background border border-border rounded-lg">
      {/* Minimalist Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Workers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.total} connected
            </p>
          </div>
        </div>

        {/* Stats Grid - Minimal */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="flex items-center gap-2">
            <StatusIndicator status="IDLE" />
            <div>
              <p className="text-xs text-muted-foreground">Idle</p>
              <p className="text-lg font-semibold text-foreground">
                {stats.idle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="BUSY" />
            <div>
              <p className="text-xs text-muted-foreground">Busy</p>
              <p className="text-lg font-semibold text-foreground">
                {stats.busy}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="UNHEALTHY" />
            <div>
              <p className="text-xs text-muted-foreground">Unhealthy</p>
              <p className="text-lg font-semibold text-foreground">
                {stats.unhealthy}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="OFFLINE" />
            <div>
              <p className="text-xs text-muted-foreground">Offline</p>
              <p className="text-lg font-semibold text-foreground">
                {stats.total - stats.idle - stats.busy - stats.unhealthy}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Workers List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground animate-pulse">
              Loading...
            </p>
          </div>
        ) : workers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Server className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground mb-2">No workers</p>
              <p className="text-xs text-muted-foreground">
                Run: node worker-agent.js
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {workers.map((worker) => (
              <WorkerCard
                key={worker.workerId}
                worker={worker}
                onSelect={setSelectedWorker}
                onDelete={handleDeleteWorker}
                formatTime={formatTime}
              />
            ))}
          </div>
        )}

        {/* Details Modal */}
        <WorkerDetailsModal
          worker={selectedWorker}
          isOpen={selectedWorker !== null}
          onClose={() => setSelectedWorker(null)}
        />
      </div>

      {/* Minimal Footer */}
      <div className="border-t border-border px-6 py-2 text-xs text-muted-foreground">
        Auto-refresh: 3s
      </div>
    </div>
  );
}
