/**
 * WebSocket server for worker agents.
 *
 * Protocol:
 * - Workers connect with `x-worker-token` header or `?token=...` query param
 * - Server sends `job-assign` messages when jobs are ready
 * - Workers send `heartbeat`, `log-chunk`, `result`, and `cancel-ack` messages
 * - Bidirectional keep-alive, auto-reconnect on disconnect
 */

import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import { config } from "./config";

type WorkerSocketData = {
  workerId: string;
  hostname?: string;
};

const activeConnections = new Map<string, WebSocket>();

export function createWorkerWsServer(port = 8080) {
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    let workerId: string | null = null;

    try {
      // Auth: token from header or query
      const headerToken = req.headers["x-worker-token"] as string;
      const urlToken = new URL(
        req.url || "",
        `http://${req.headers.host}`,
      ).searchParams.get("token");
      const token = headerToken || urlToken || "";
      if (!token) throw new Error("Missing worker token");

      const decoded = jwt.verify(token, config.workerTokenSecret) as any;
      if (!decoded.workerId) throw new Error("Invalid token payload");

      workerId = decoded.workerId as string;
      activeConnections.set(workerId, ws);

      console.log(`[WS] Worker ${workerId} connected`);

      ws.on("message", (raw: Buffer) => {
        handleWorkerMessage(workerId!, raw, ws);
      });

      ws.on("close", () => {
        if (workerId) {
          activeConnections.delete(workerId);
          console.log(`[WS] Worker ${workerId} disconnected`);
        }
      });

      ws.on("error", (error) => {
        console.error(`[WS] Worker ${workerId} error:`, error);
      });

      // Send initial welcome
      ws.send(JSON.stringify({ type: "welcome", workerId }));
    } catch (error: any) {
      console.error("[WS] Auth failed:", error.message);
      ws.close(1008, "Unauthorized");
    }
  });

  return wss;
}

function handleWorkerMessage(workerId: string, raw: Buffer, ws: WebSocket) {
  try {
    const msg = JSON.parse(raw.toString());

    switch (msg.type) {
      case "heartbeat":
        // Update worker heartbeat timestamp in DB
        console.log(`[WS] Heartbeat from ${workerId}`);
        ws.send(
          JSON.stringify({ type: "heartbeat-ack", timestamp: Date.now() }),
        );
        break;

      case "log-chunk":
        // Store log chunk in DB
        console.log(`[WS] Log chunk from ${workerId}:`, msg.jobId);
        break;

      case "result":
        // Job completed; update DB
        console.log(`[WS] Result from ${workerId}:`, msg.jobId);
        break;

      case "cancel-ack":
        // Worker confirmed job cancellation
        console.log(`[WS] Cancel ack from ${workerId}:`, msg.jobId);
        break;

      default:
        console.warn(`[WS] Unknown message type from ${workerId}:`, msg.type);
    }
  } catch (error) {
    console.error(`[WS] Failed to handle message from ${workerId}:`, error);
  }
}

export function sendJobToWorker(workerId: string, job: any) {
  const ws = activeConnections.get(workerId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn(`[WS] Cannot send job to ${workerId}: not connected`);
    return false;
  }

  ws.send(JSON.stringify({ type: "job-assign", job }));
  console.log(`[WS] Assigned job ${job.jobId} to ${workerId}`);
  return true;
}

export function cancelJobOnWorker(workerId: string, jobId: string) {
  const ws = activeConnections.get(workerId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  ws.send(JSON.stringify({ type: "job-cancel", jobId }));
  console.log(`[WS] Cancel request sent to ${workerId} for ${jobId}`);
  return true;
}
