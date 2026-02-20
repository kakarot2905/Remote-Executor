"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Upload,
  Play,
  Square,
  Trash2,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
} from "lucide-react";
import AvailableNodes from "./AvailableNodes";
import { clientAuth } from "@/lib/client-auth";

interface TerminalLog {
  id: string;
  content: string;
  type: "command" | "output" | "error" | "info";
  timestamp: Date;
}

interface TerminalInterfaceProps {
  nodeId?: string;
  nodeName?: string;
}

export default function TerminalInterface({
  nodeId,
  nodeName,
}: TerminalInterfaceProps = {}) {
  const storageKey = `terminal-${nodeId || "default"}`;

  // Initialize state from localStorage
  const [logs, setLogs] = useState<TerminalLog[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(`${storageKey}-logs`);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [commands, setCommands] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`${storageKey}-commands`) || "";
  });

  const [isExecuting, setIsExecuting] = useState(false);
  const [execId, setExecId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [executionMode, setExecutionMode] = useState<"direct" | "distributed">(
    "distributed",
  );
  const [jobId, setJobId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`${storageKey}-jobId`) || null;
  });
  const [statusMessage, setStatusMessage] = useState<string>(
    "Ready to start - Select a file and enter commands",
  );
  const [statusType, setStatusType] = useState<
    "idle" | "info" | "success" | "error" | "warning"
  >("info");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Persist logs to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`${storageKey}-logs`, JSON.stringify(logs));
    }
  }, [logs, storageKey]);

  // Persist commands to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`${storageKey}-commands`, commands);
    }
  }, [commands, storageKey]);

  // Persist jobId to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (jobId) {
        localStorage.setItem(`${storageKey}-jobId`, jobId);
      } else {
        localStorage.removeItem(`${storageKey}-jobId`);
      }
    }
  }, [jobId, storageKey]);

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (
    content: string,
    type: "command" | "output" | "error" | "info" = "info",
  ) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        content,
        type,
        timestamp: new Date(),
      },
    ]);
  };

  const downloadResultZip = async (url: string, filename?: string | null) => {
    try {
      const response = await fetch(url, {
        headers: clientAuth.getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error("Failed to download result zip");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename || "job-results.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      addLog(
        `Error downloading result zip: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      addLog(`File selected: ${file.name}`, "info");
    }
  };

  const handleExecute = async () => {
    if (!selectedFile) {
      addLog("Error: Please select a file first", "error");
      return;
    }

    if (!commands.trim()) {
      addLog("Error: Please enter at least one command", "error");
      return;
    }

    setIsExecuting(true);
    setStatusMessage("Uploading file and executing commands...");
    setStatusType("info");
    const abortController = new AbortController();
    abortRef.current = abortController;
    addLog(
      `Starting execution (mode: ${executionMode}) with file: ${selectedFile.name}`,
      "info",
    );
    addLog("Uploading file and executing commands...", "info");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("commands", commands);
      formData.append("mode", executionMode);

      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {
          ...clientAuth.getAuthHeaders(),
        },
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        addLog(`Error: ${error.error || "Unknown error"}`, "error");
        setIsExecuting(false);
        return;
      }

      // Handle distributed mode
      if (executionMode === "distributed") {
        const data = await response.json();
        if (data.jobId) {
          setJobId(data.jobId);
          addLog(`Job created: ${data.jobId}`, "info");
          setStatusMessage(`Job created: ${data.jobId}`);
          setStatusType("info");

          // Start polling for job status
          await pollJobStatus(data.jobId);
          return;
        }
      }

      // Handle direct mode (streaming)
      // Capture execution id for force-stop
      const respExecId = response.headers.get("x-exec-id");
      if (respExecId) {
        setExecId(respExecId);
      }

      // Read the streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        addLog("Error: Could not read response", "error");
        setIsExecuting(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        // Process all complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line) {
            if (line.startsWith(">")) {
              addLog(line, "command");
            } else if (line.startsWith("Error:")) {
              addLog(line, "error");
            } else if (line === "-".repeat(80) || line === "=".repeat(80)) {
              addLog(line, "info");
            } else {
              addLog(line, "output");
            }
          }
        }

        // Keep incomplete line in buffer
        buffer = lines[lines.length - 1];
      }

      // Process remaining buffer
      if (buffer) {
        addLog(buffer, "output");
      }

      addLog("Execution completed successfully!", "info");
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        addLog("Execution aborted by user", "info");
      } else {
        addLog(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
    } finally {
      setExecId(null);
      abortRef.current = null;
      setIsExecuting(false);
    }
  };

  const pollJobStatus = async (jId: string) => {
    return new Promise<void>((resolve) => {
      let completionAttempts = 0;
      const maxAttempts = 600; // 5 minutes with 500ms polling
      let lastStdoutLength = 0;
      let lastStderrLength = 0;
      let hasShownRunningMessage = false;
      let isCancelled = false; // Track if job was cancelled
      let finished = false; // Ensure terminal state handled once
      let promptedDownload = false;

      const pollAbortController = new AbortController();

      const poll = async () => {
        try {
          const response = await fetch(`/api/jobs/status?jobId=${jId}`, {
            headers: clientAuth.getAuthHeaders(),
            signal: pollAbortController.signal,
          });
          if (!response.ok) {
            if (completionAttempts > maxAttempts) {
              addLog("Job status check timeout", "error");
              setIsExecuting(false);
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              resolve();
              return;
            }
            completionAttempts++;
            return;
          }

          const job = await response.json();

          // If we've already finalized, ignore any further ticks
          if (finished) return;

          if (job.status === "ASSIGNED" || job.status === "RUNNING") {
            // Show running message only once
            if (!hasShownRunningMessage) {
              const message =
                job.status === "ASSIGNED"
                  ? `Waiting for worker to pick up the job...`
                  : `Job is running on worker: ${job.assignedAgentId}`;
              setStatusMessage(message);
              setStatusType("info");
              hasShownRunningMessage = true;
            }

            // Display new streaming output in real-time
            if (job.stdout && job.stdout.length > lastStdoutLength) {
              const newOutput = job.stdout.substring(lastStdoutLength);
              newOutput.split("\n").forEach((line: string) => {
                if (line) addLog(line, "output");
              });
              lastStdoutLength = job.stdout.length;
            }

            if (job.stderr && job.stderr.length > lastStderrLength) {
              const newOutput = job.stderr.substring(lastStderrLength);
              newOutput.split("\n").forEach((line: string) => {
                if (line) addLog(line, "error");
              });
              lastStderrLength = job.stderr.length;
            }
          } else if (job.status === "COMPLETED") {
            // Guard: handle completion once
            finished = true;
            setStatusMessage(`Job completed with exit code: ${job.exitCode}`);
            setStatusType(job.exitCode === 0 ? "success" : "warning");
            addLog("Job completed!", "info");

            // Display any remaining output that wasn't shown during streaming
            if (job.stdout && job.stdout.length > lastStdoutLength) {
              const remainingOutput = job.stdout.substring(lastStdoutLength);
              remainingOutput.split("\n").forEach((line: string) => {
                if (line) addLog(line, "output");
              });
            }

            if (job.stderr && job.stderr.length > lastStderrLength) {
              const remainingOutput = job.stderr.substring(lastStderrLength);
              remainingOutput.split("\n").forEach((line: string) => {
                if (line) addLog(line, "error");
              });
            }

            addLog(`Exit code: ${job.exitCode}`, "info");

            const resultUrl =
              job.resultFileUrl ||
              (job.resultFileId
                ? `/api/files/download/${job.resultFileId}`
                : null);
            if (resultUrl && !promptedDownload) {
              promptedDownload = true;
              const filename = job.resultFilename || `${job.jobId}-results.zip`;
              setTimeout(() => {
                const shouldDownload = window.confirm(
                  "Job completed. Download result zip (logs + output files)?",
                );
                if (shouldDownload) {
                  void downloadResultZip(resultUrl, filename);
                }
              }, 0);
            }

            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsExecuting(false);
            setJobId(null);
            resolve();
          } else if (job.status === "CANCELLED") {
            // Handle cancelled status - don't show error or re-output
            finished = true;
            isCancelled = true;
            setStatusMessage("Job was cancelled by user");
            setStatusType("warning");
            addLog("Job was cancelled", "info");
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsExecuting(false);
            setJobId(null);
            resolve();
          } else if (job.status === "FAILED") {
            // Guard: handle failure once
            finished = true;
            setStatusMessage(
              `Job failed: ${job.errorMessage || "Unknown error"}`,
            );
            setStatusType("error");
            addLog("Job failed!", "error");
            addLog(job.errorMessage || "Unknown error", "error");

            if (job.stdout) {
              addLog("--- STDOUT ---", "info");
              job.stdout.split("\n").forEach((line: string) => {
                if (line) addLog(line, "output");
              });
            }

            if (job.stderr) {
              addLog("--- STDERR ---", "error");
              job.stderr.split("\n").forEach((line: string) => {
                if (line) addLog(line, "error");
              });
            }

            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsExecuting(false);
            setJobId(null);
            resolve();
          }
        } catch (error: unknown) {
          // Ignore abort errors (expected when cancelling)
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          console.error("Status poll error:", error);
        }
      };
      // Clear any existing interval before starting a new one
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      pollIntervalRef.current = setInterval(poll, 500);
      poll();

      // Store abort controller in ref for cancellation
      abortRef.current = pollAbortController;
    });
  };

  const handleForceStop = async () => {
    setStatusMessage("Force stop requested...");
    setStatusType("warning");
    addLog("Force stop requested", "info");

    // Stop polling if running
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Abort ongoing fetch requests
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    try {
      // For direct mode - kill process
      if (execId) {
        await fetch("/api/execute", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            ...clientAuth.getAuthHeaders(),
          },
          body: JSON.stringify({ execId }),
        });
        addLog("Direct execution stopped", "info");
      }

      // For distributed mode - cancel job
      if (jobId) {
        await fetch("/api/jobs/cancel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...clientAuth.getAuthHeaders(),
          },
          body: JSON.stringify({ jobId }),
        });
        addLog("Job cancelled on worker", "info");
      }
    } catch {
      addLog("Failed to send stop request", "error");
    } finally {
      setIsExecuting(false);
      setExecId(null);
      setJobId(null);
    }
  };

  const handleClear = () => {
    setLogs([]);
    setStatusMessage("Ready to start - Select a file and enter commands");
    setStatusType("info");
    addLog("Terminal cleared", "info");
  };

  const handleReset = () => {
    setCommands("");
    setSelectedFile(null);
    setStatusMessage("Ready to start - Select a file and enter commands");
    setStatusType("info");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setLogs([]);
    addLog("Ready for new execution", "info");

    // Clear localStorage for this terminal
    if (typeof window !== "undefined") {
      localStorage.removeItem(`${storageKey}-commands`);
      localStorage.removeItem(`${storageKey}-logs`);
      localStorage.removeItem(`${storageKey}-jobId`);
    }
  };

  const getStatusIcon = () => {
    switch (statusType) {
      case "success":
        return <CheckCircle className="w-4 h-4" />;
      case "error":
        return <AlertCircle className="w-4 h-4" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getStatusStyles = () => {
    const baseStyles = "p-3 rounded-lg border flex items-center gap-3";
    switch (statusType) {
      case "success":
        return `${baseStyles} bg-emerald-50 border-emerald-200 text-emerald-900`;
      case "error":
        return `${baseStyles} bg-red-50 border-red-200 text-red-900`;
      case "warning":
        return `${baseStyles} bg-amber-50 border-amber-200 text-amber-900`;
      default:
        return `${baseStyles} bg-blue-50 border-blue-200 text-blue-900`;
    }
  };

  return (
    <div className="h-full flex flex-col max-h-screen bg-background">
      {/* Header - Only show if not in multi-node mode */}
      {!nodeId && (
        <div className="border-b border-border px-6 py-4 bg-card">
          <h1 className="text-2xl font-bold text-foreground">CMD Executor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a zip file and execute commands across distributed workers
          </p>
        </div>
      )}

      <div className="flex gap-4 p-4 flex-1 overflow-hidden ">
        {/* Left Sidebar - Available Nodes */}
        <div className="w-80 flex flex-col flex-shrink-0">
          <AvailableNodes />
        </div>

        {/* Right Side - Control Panel + Terminal */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Control Panel Grid */}
          <div className="grid grid-cols-3 gap-3">
            {/* File Upload Section */}
            <div className="border border-border rounded-lg p-4 bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Upload className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">File</h3>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                disabled={isExecuting}
                className="w-full px-3 py-2 border border-border rounded bg-input text-sm disabled:opacity-50 cursor-pointer"
              />
              {selectedFile && (
                <div className="mt-2 p-2 bg-secondary/20 rounded text-xs text-foreground">
                  <p className="font-medium truncate">{selectedFile.name}</p>
                  <p className="text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              )}
            </div>

            {/* Commands Section */}
            <div className="border border-border rounded-lg p-4 bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Play className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">Commands</h3>
              </div>
              <textarea
                ref={inputRef}
                value={commands}
                onChange={(e) => setCommands(e.target.value)}
                placeholder="npm install&#10;npm run build"
                disabled={isExecuting}
                className="w-full px-3 py-2 border border-border rounded bg-input text-sm h-24 resize-none disabled:opacity-50 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-2">
                One command per line
              </p>
            </div>

            {/* Execution Mode Section */}
            <div className="border border-border rounded-lg p-4 bg-card">
              <h3 className="font-semibold text-foreground mb-3">Mode</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="distributed"
                    checked={executionMode === "distributed"}
                    onChange={(e) =>
                      setExecutionMode(
                        e.target.value as "distributed" | "direct",
                      )
                    }
                    disabled={isExecuting}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Distributed
                  </span>
                </label>
                <p className="text-xs text-muted-foreground ml-6">
                  Runs on idle workers
                </p>

                <label className="flex items-center gap-2 cursor-pointer mt-3">
                  <input
                    type="radio"
                    name="mode"
                    value="direct"
                    checked={executionMode === "direct"}
                    onChange={(e) =>
                      setExecutionMode(
                        e.target.value as "distributed" | "direct",
                      )
                    }
                    disabled={isExecuting}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Direct
                  </span>
                </label>
                <p className="text-xs text-muted-foreground ml-6">
                  Runs on this server
                </p>
              </div>
            </div>
          </div>

          {/* Status Display */}
          {statusMessage && (
            <div className={getStatusStyles()}>
              {getStatusIcon()}
              <span className="text-sm flex-1">{statusMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleExecute}
              disabled={isExecuting || !selectedFile || !commands.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
            >
              <Play className="w-4 h-4" />
              {isExecuting ? "Executing..." : "Execute"}
            </button>
            <button
              onClick={handleForceStop}
              disabled={!isExecuting}
              className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
            <button
              onClick={handleClear}
              disabled={isExecuting}
              className="flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
            <button
              onClick={handleReset}
              disabled={isExecuting}
              className="flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>

          {/* Terminal Content */}
          <div className="border border-border rounded-lg flex flex-col flex-1 min-h-0  bg-card overflow-hidden">
            {/* Terminal Header */}
            <div className="border-b border-border px-4 py-3 flex justify-between items-center bg-secondary/30">
              <span className="text-sm font-semibold text-foreground">
                {nodeName || "Output"}
              </span>
              <span className="text-xs text-muted-foreground">
                {logs.length} lines
              </span>
            </div>

            {/* Terminal Content */}
            <div
              ref={terminalRef}
              className="flex-1 p-4 overflow-y-auto space-y-1 text-sm font-mono max-h-full"
            >
              {logs.length === 0 ? (
                <div className="text-muted-foreground space-y-1 text-xs">
                  <p>Ready for input</p>
                  <p className="mt-4 text-muted-foreground/70">
                    1. Select a ZIP file with your project
                  </p>
                  <p className="text-muted-foreground/70">2. Enter commands</p>
                  <p className="text-muted-foreground/70">3. Click Execute</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`whitespace-pre-wrap break-words ${
                      log.type === "command"
                        ? "text-amber-600 font-semibold"
                        : log.type === "error"
                          ? "text-red-600"
                          : log.type === "info"
                            ? "text-blue-600"
                            : "text-emerald-600"
                    }`}
                  >
                    {log.content}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
