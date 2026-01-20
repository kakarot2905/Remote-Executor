"use client";

import React, { useRef, useState, useEffect } from "react";
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
          addLog(data.message, "info");
          addLog("Waiting for worker to pick up the job...", "info");

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

      const poll = async () => {
        try {
          const response = await fetch(`/api/jobs/status?jobId=${jId}`, {
            headers: clientAuth.getAuthHeaders(),
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

          if (job.status === "ASSIGNED" || job.status === "RUNNING") {
            // Show running message only once
            if (!hasShownRunningMessage) {
              addLog(
                `Job is running on worker: ${job.assignedAgentId}`,
                "info",
              );
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
            addLog("✓ Job completed!", "info");

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

            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsExecuting(false);
            setJobId(null);
            resolve();
          } else if (job.status === "FAILED") {
            addLog("✗ Job failed!", "error");
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
          console.error("Status poll error:", error);
        }
      };

      pollIntervalRef.current = setInterval(poll, 500);
      poll();
    });
  };

  const handleForceStop = async () => {
    addLog("Force stop requested", "info");

    // Stop polling if running
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Abort ongoing fetch requests
    abortRef.current?.abort();

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
      abortRef.current = null;
    }
  };

  const handleClear = () => {
    setLogs([]);
    addLog("Terminal cleared", "info");
  };

  const handleReset = () => {
    setCommands("");
    setSelectedFile(null);
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

  return (
    <div className="bg-black text-green-400 font-mono">
      {/* Header - Only show if not in multi-node mode */}
      {!nodeId && (
        <div className="bg-gray-900 border-b-2 border-green-400 p-4 sticky top-0 z-10">
          <h1 className="text-xl font-bold">
            CMD Executor - Remote Command Runner
          </h1>
          <p className="text-xs text-green-300 mt-1">
            Upload a zip file containing your project and execute commands in
            its root directory
          </p>
        </div>
      )}

      <div className="flex gap-4 p-4 bg-gray-950 min-h-screen">
        {/* Left Sidebar - Available Nodes */}
        <div className="w-80 flex flex-col max-h-[calc(100vh-120px)]">
          <AvailableNodes />
        </div>

        {/* Right Side - Control Panel + Terminal */}
        <div className="flex-1 space-y-4 flex flex-col">
          {/* Control Panel */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            {/* File Upload Section */}
            <div className="border-2 border-green-400 p-4 bg-gray-900">
              <h3 className="text-green-400 font-bold mb-3 border-b border-green-400 pb-2">
                File Upload
              </h3>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                disabled={isExecuting}
                className="w-full bg-gray-800 text-green-400 border border-green-400 p-2 mb-2 cursor-pointer file:bg-green-400 file:text-black file:border-0 file:px-3 file:py-1 disabled:opacity-50"
              />
              {selectedFile && (
                <div className="text-xs text-green-300 bg-gray-800 p-2 rounded">
                  <p>Selected: {selectedFile.name}</p>
                  <p>Size: {(selectedFile.size / 1024).toFixed(2)} KB</p>
                </div>
              )}
            </div>

            {/* Commands Section */}
            <div className="border-2 border-green-400 p-4 bg-gray-900">
              <h3 className="text-green-400 font-bold mb-3 border-b border-green-400 pb-2">
                Commands
              </h3>
              <textarea
                ref={inputRef}
                value={commands}
                onChange={(e) => setCommands(e.target.value)}
                placeholder="Enter commands (one per line)&#10;Example:&#10;dir&#10;npm install"
                disabled={isExecuting}
                className="w-full bg-gray-800 text-green-400 border border-green-400 p-2 h-32 resize-none focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
              />
              <p className="text-xs text-green-300 mt-2">
                Enter commands line by line. Each line will be executed in
                order.
              </p>
            </div>

            {/* Execution Mode Section */}
            <div className="border-2 border-green-400 p-4 bg-gray-900">
              <h3 className="text-green-400 font-bold mb-3 border-b border-green-400 pb-2">
                Execution Mode
              </h3>
              <div className="space-y-2">
                <label className="flex items-center cursor-pointer">
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
                    className="mr-2"
                  />
                  <span className="text-green-400 text-sm">
                    🔄 Distributed (Worker Nodes)
                  </span>
                </label>
                <p className="text-xs text-green-300 ml-6">
                  Runs on idle workers. Faster for server.
                </p>

                <label className="flex items-center cursor-pointer mt-3">
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
                    className="mr-2"
                  />
                  <span className="text-green-400 text-sm">
                    🖥️ Direct (Server)
                  </span>
                </label>
                <p className="text-xs text-green-300 ml-6">
                  Runs on this server. Legacy mode.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-4 gap-2 shrink-0">
              <button
                onClick={handleExecute}
                disabled={isExecuting || !selectedFile || !commands.trim()}
                className="bg-green-400 text-black font-bold py-2 px-4 hover:bg-green-300 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                {isExecuting ? "⏳ Executing..." : "▶ Execute"}
              </button>
              <button
                onClick={handleForceStop}
                disabled={!isExecuting}
                className={`font-bold py-2 px-4 transition-colors ${
                  isExecuting
                    ? "bg-orange-500 text-white hover:bg-orange-400 cursor-pointer"
                    : "bg-gray-600 text-gray-400 cursor-not-allowed"
                }`}
              >
                ⏹ Force Stop
              </button>
              <button
                onClick={handleClear}
                disabled={isExecuting}
                className="bg-yellow-600 text-white font-bold py-2 px-4 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                🧹 Clear Logs
              </button>
              <button
                onClick={handleReset}
                disabled={isExecuting}
                className="bg-red-700 text-white font-bold py-2 px-4 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                ↻ Reset
              </button>
            </div>
          </div>

          {/* Terminal Content */}
          <div className="flex-1 border-2 border-green-400 bg-gray-900 flex flex-col min-h-[500px]">
            {/* Terminal Header */}
            <div className="bg-gray-800 border-b border-green-400 px-4 py-2 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-green-400">
                  {nodeName || "CMD Executor"}
                </span>
                <span className="text-xs text-green-600">
                  C:\Users\SysAdmin\Project&gt;
                </span>
              </div>
              <span className="text-xs text-green-300">
                {logs.length} lines
              </span>
            </div>

            {/* Terminal Content */}
            <div
              ref={terminalRef}
              className="flex-1 p-4 overflow-y-auto space-y-1 text-sm max-h-[calc(100vh-400px)]"
            >
              {logs.length === 0 ? (
                <div className="text-green-600 ">
                  <p>CMD Executor v1.0</p>
                  <p>Ready for input...</p>
                  <p className="mt-4 text-xs">
                    1. Select a ZIP file with your project files
                  </p>
                  <p className="text-xs">2. Enter commands to execute</p>
                  <p className="text-xs">3. Click Execute to run commands</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`whitespace-pre-wrap wrap-break-word ${
                      log.type === "command"
                        ? "text-yellow-400 font-bold"
                        : log.type === "error"
                          ? "text-red-400"
                          : log.type === "info"
                            ? "text-cyan-400"
                            : "text-green-400"
                    }`}
                  >
                    {log.content}
                  </div>
                ))
              )}
            </div>

            {/* Terminal Footer */}
            <div className="bg-gray-800 border-t border-green-400 px-4 py-2 text-xs text-green-300">
              {isExecuting ? (
                <span>● Executing...</span>
              ) : logs.length > 0 ? (
                <span>✓ Ready</span>
              ) : (
                <span>○ Waiting for input...</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
