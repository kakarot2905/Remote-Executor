"use client";

import React, { useState, useEffect } from "react";

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

export default function AvailableNodes() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    idle: 0,
    busy: 0,
    unhealthy: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const response = await fetch("/api/workers/list");
        if (response.ok) {
          const data = await response.json();
          // Sort workers: idle first, then busy, then offline (based on heartbeat)
          const sortedWorkers = (data.workers || []).sort(
            (a: Worker, b: Worker) => {
              const now = Date.now();
              const HEARTBEAT_TIMEOUT = 15000; // 15 seconds

              const aIsOffline = now - a.lastHeartbeat > HEARTBEAT_TIMEOUT;
              const bIsOffline = now - b.lastHeartbeat > HEARTBEAT_TIMEOUT;

              // If one is offline and the other isn't, offline goes to bottom
              if (aIsOffline && !bIsOffline) return 1;
              if (!aIsOffline && bIsOffline) return -1;

              // If both are online, sort by status: idle first, then busy
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

    // Fetch immediately
    fetchWorkers();

    // Then poll every 3 seconds
    const interval = setInterval(fetchWorkers, 3000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    if (status === "IDLE") return "text-green-400";
    if (status === "BUSY") return "text-yellow-400";
    if (status === "UNHEALTHY") return "text-orange-400";
    return "text-gray-400";
  };

  const getOSIcon = (os: string) => {
    if (os.includes("win32")) return "🪟";
    if (os.includes("linux")) return "🐧";
    if (os.includes("darwin")) return "🍎";
    return "🖥️";
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return "never";
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="border-2 border-green-400 bg-gray-900 h-full flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-green-400 px-4 py-3">
        <h2 className="text-green-400 font-bold text-lg">Available Nodes</h2>
        <div className="flex gap-4 mt-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-green-400">●</span>
            <span className="text-green-300">Idle: {stats.idle}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-yellow-400">●</span>
            <span className="text-yellow-300">Busy: {stats.busy}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-orange-400">●</span>
            <span className="text-orange-300">
              Unhealthy: {stats.unhealthy}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400">●</span>
            <span className="text-gray-300">Total: {stats.total}</span>
          </div>
        </div>
      </div>

      {/* Workers List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 flex flex-col">
        {loading ? (
          <div className="text-green-600 text-xs animate-pulse">
            Loading workers...
          </div>
        ) : workers.length === 0 ? (
          <div className="text-green-600 text-xs">
            <p>No workers connected</p>
            <p className="text-green-700 mt-1">Run: node worker-agent.js</p>
          </div>
        ) : (
          workers.map((worker) => {
            const isOffline = Date.now() - worker.lastHeartbeat > 15000;
            const activeJobs = worker.currentJobIds?.length || 0;
            const statusLabel = isOffline ? "OFFLINE" : worker.status;
            return (
              <div
                key={worker.workerId}
                className={`border rounded p-2 text-xs ${
                  isOffline
                    ? "border-gray-600 bg-gray-900 opacity-60"
                    : worker.status === "IDLE"
                      ? "border-green-400 bg-gray-800"
                      : worker.status === "BUSY"
                        ? "border-yellow-400 bg-gray-700"
                        : "border-orange-400 bg-gray-700"
                }`}
              >
                {/* Worker ID and Status */}
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-green-300">
                    {worker.workerId}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded ${
                      isOffline
                        ? "bg-gray-700 text-gray-400"
                        : worker.status === "IDLE"
                          ? "bg-green-900 text-green-300"
                          : worker.status === "BUSY"
                            ? "bg-yellow-900 text-yellow-300"
                            : "bg-orange-900 text-orange-200"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>

                {/* Worker Details */}
                <div className="space-y-0.5 text-gray-300">
                  <div className="flex items-center gap-2">
                    <span>{getOSIcon(worker.os)}</span>
                    <span>{worker.os}</span>
                    <span className="text-gray-500">|</span>
                    <span>CPU: {worker.cpuCount}</span>
                    {worker.cpuUsage !== undefined && (
                      <span className="text-gray-500">
                        ({Math.round(worker.cpuUsage)}% load)
                      </span>
                    )}
                  </div>

                  <div className="text-gray-400">Host: {worker.hostname}</div>

                  <div className="text-gray-400 text-xs flex gap-2">
                    <span>
                      RAM: {worker.ramFreeMb ?? "?"} /{" "}
                      {worker.ramTotalMb ?? "?"} MB free
                    </span>
                    <span className="text-gray-500">|</span>
                    <span>Jobs: {activeJobs}</span>
                  </div>

                  {(worker.dockerContainers ?? 0) > 0 && (
                    <div className="text-blue-400 text-1">
                       CPU:{" "}
                      {worker.dockerCpuUsage ?? 0}% | RAM:{" "}
                      {worker.dockerMemoryMb ?? 0} MB
                    </div>
                  )}

                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>
                      Last heartbeat: {formatTime(worker.lastHeartbeat)}
                    </span>
                    {activeJobs > 0 && (
                      <span className={getStatusColor(worker.status)}>
                        Active: {activeJobs}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-green-400 bg-gray-800 px-4 py-2 text-xs text-green-300">
        <p>Auto-refreshing every 3s</p>
      </div>
    </div>
  );
}
