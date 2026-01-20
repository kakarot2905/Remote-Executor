/**
 * Centralized configuration loader for backend and worker services.
 * Supports MongoDB, Redis, JWT, and OIDC/SSO parameters with sane defaults
 * so the stack can run locally while remaining production-ready.
 */

const required = (
  value: string | undefined,
  name: string,
  fallback?: string,
): string => {
  if (value && value.trim()) return value;
  const resolved = fallback ?? "";
  // Warn instead of throwing so dev servers can start without full env.
  console.warn(
    `[config] Missing ${name}; using fallback${
      resolved ? "" : " (empty string)"
    }`,
  );
  return resolved;
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  // Datastores
  mongodbUri: required(
    process.env.MONGODB_URI,
    "MONGODB_URI",
    "mongodb://127.0.0.1:27017/cmd-executor",
  ),
  mongodbDb: process.env.MONGODB_DB || "cmd-executor",
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",

  // Auth (users)
  jwtSecret: required(process.env.JWT_SECRET, "JWT_SECRET", "dev-jwt-secret"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",

  // Auth (workers)
  workerTokenSecret: required(
    process.env.WORKER_TOKEN_SECRET,
    "WORKER_TOKEN_SECRET",
    "dev-worker-token-secret",
  ),

  // OIDC / SSO (optional)
  oidcIssuer: process.env.OIDC_ISSUER || "",
  oidcClientId: process.env.OIDC_CLIENT_ID || "",
  oidcClientSecret: process.env.OIDC_CLIENT_SECRET || "",
  oidcRedirectUri: process.env.OIDC_REDIRECT_URI || "",

  // Network & security
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  enforceTls: (process.env.ENFORCE_TLS || "true").toLowerCase() === "true",

  // Rate limiting
  rateLimitWindowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitMax: toNumber(process.env.RATE_LIMIT_MAX, 100),

  // Scheduler
  schedulerLockKey: process.env.SCHEDULER_LOCK_KEY || "scheduler:lock",
  schedulerLockTtlMs: toNumber(process.env.SCHEDULER_LOCK_TTL_MS, 5_000),
};

// Log loaded configuration once (masking secrets)
const mask = (value: string, visible: number = 4) => {
  if (!value) return "";
  const prefix = value.slice(0, visible);
  const masked = "*".repeat(Math.max(0, value.length - visible));
  return `${prefix}${masked}`;
};

console.log("[config] Loaded", {
  mongodbUri: config.mongodbUri,
  mongodbDb: config.mongodbDb,
  redisUrl: config.redisUrl,
  jwtSecret: mask(config.jwtSecret),
  jwtExpiresIn: config.jwtExpiresIn,
  workerTokenSecret: mask(config.workerTokenSecret),
  oidcIssuer: config.oidcIssuer,
  oidcClientId: mask(config.oidcClientId),
  oidcClientSecret: mask(config.oidcClientSecret),
  oidcRedirectUri: config.oidcRedirectUri,
  allowedOrigins: config.allowedOrigins,
  enforceTls: config.enforceTls,
  rateLimitWindowMs: config.rateLimitWindowMs,
  rateLimitMax: config.rateLimitMax,
  schedulerLockKey: config.schedulerLockKey,
  schedulerLockTtlMs: config.schedulerLockTtlMs,
});
