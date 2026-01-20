/**
 * Authentication & rate limiting helpers.
 * - User auth: JWT (bearer header or httpOnly cookie `auth_token`)
 * - Worker auth: HMAC token (bearer or `x-worker-token` header)
 * - Rate limiting: Redis-based fixed window
 */

import jwt, { JwtPayload } from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { config } from "./config";
import { getRedis } from "./db/redis";

export interface UserClaims extends JwtPayload {
  sub: string;
  email?: string;
  role?: string;
}

export interface WorkerClaims {
  workerId: string;
  hostname?: string;
}

const extractBearer = (req: NextRequest): string | null => {
  const header = req.headers.get("authorization") || "";
  const [, token] = header.split(" ");
  return token || null;
};

const extractCookieToken = (req: NextRequest, name: string): string | null => {
  const cookie = req.cookies.get(name);
  return cookie?.value || null;
};

export function authenticateUser(
  req: NextRequest,
): { ok: true; user: UserClaims } | { ok: false; response: NextResponse } {
  try {
    const token =
      extractBearer(req) || extractCookieToken(req, "auth_token") || "";
    const decoded = jwt.verify(token, config.jwtSecret) as UserClaims;
    return { ok: true, user: decoded };
  } catch (error: any) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized", detail: error?.message || "Invalid token" },
        { status: 401 },
      ),
    };
  }
}

export function authenticateWorker(
  req: NextRequest,
): { ok: true; worker: WorkerClaims } | { ok: false; response: NextResponse } {
  try {
    const headerToken = req.headers.get("x-worker-token") || "";
    const bearer = extractBearer(req) || "";
    const token = headerToken || bearer;
    if (!token) throw new Error("Missing worker token");
    const decoded = jwt.verify(token, config.workerTokenSecret) as any;
    if (!decoded.workerId) throw new Error("workerId missing in token");
    return {
      ok: true,
      worker: { workerId: decoded.workerId, hostname: decoded.hostname },
    };
  } catch (error: any) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Unauthorized worker",
          detail: error?.message || "Invalid token",
        },
        { status: 401 },
      ),
    };
  }
}

export async function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const redis = getRedis();
  const redisKey = `ratelimit:${key}`;
  const [[, countResult], [, ttlResult]] = await redis
    .multi()
    .incr(redisKey)
    .pttl(redisKey)
    .exec();

  const count = Number(countResult || 0);
  let ttl = Number(ttlResult || windowMs);

  // If first hit, set expiry
  if (count === 1) {
    await redis.pexpire(redisKey, windowMs);
    ttl = windowMs;
  }

  if (count > max) {
    const retryAfter = Math.ceil(ttl / 1000);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Rate limit exceeded", retryAfterSeconds: retryAfter },
        { status: 429, headers: { "Retry-After": `${retryAfter}` } },
      ),
    };
  }

  return { ok: true };
}
