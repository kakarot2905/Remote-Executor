import type { NextConfig } from "next";

const mask = (value: string | undefined, visible: number = 4) => {
  if (!value) return "";
  const prefix = value.slice(0, visible);
  const masked = "*".repeat(Math.max(0, value.length - visible));
  return `${prefix}${masked}`;
};

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    middlewareClientMaxBodySize: "50mb",
  },
  async headers() {
    return [
      {
        // Apply CORS headers to all API routes
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.ALLOWED_ORIGINS || "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,DELETE,PATCH,POST,PUT,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Worker-Token",
          },
        ],
      },
    ];
  },
};

console.log("[next.config] Loaded env", {
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  ENFORCE_TLS: process.env.ENFORCE_TLS,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB: process.env.MONGODB_DB,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: mask(process.env.JWT_SECRET),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  WORKER_TOKEN_SECRET: mask(process.env.WORKER_TOKEN_SECRET),
  OIDC_ISSUER: process.env.OIDC_ISSUER,
  OIDC_CLIENT_ID: mask(process.env.OIDC_CLIENT_ID),
  OIDC_CLIENT_SECRET: mask(process.env.OIDC_CLIENT_SECRET),
  OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
  SCHEDULER_LOCK_KEY: process.env.SCHEDULER_LOCK_KEY,
  SCHEDULER_LOCK_TTL_MS: process.env.SCHEDULER_LOCK_TTL_MS,
});

export default nextConfig;
