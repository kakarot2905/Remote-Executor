/**
 * Next.js Middleware for CORS
 * Handles Cross-Origin Resource Sharing for API routes
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Check if origin is allowed
  const isAllowed =
    allowedOrigins.includes("*") ||
    allowedOrigins.includes(origin) ||
    origin === "" || // Allow requests without origin (e.g., from same origin)
    !origin;

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });

    if (isAllowed) {
      response.headers.set(
        "Access-Control-Allow-Origin",
        allowedOrigins.includes("*") ? "*" : origin,
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS, PATCH",
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Worker-Token, X-Requested-With",
      );
      response.headers.set("Access-Control-Max-Age", "86400"); // 24 hours
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }

    return response;
  }

  // Handle actual requests
  const response = NextResponse.next();

  if (isAllowed) {
    response.headers.set(
      "Access-Control-Allow-Origin",
      allowedOrigins.includes("*") ? "*" : origin,
    );
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Worker-Token, X-Requested-With",
    );
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}

// Configure which routes to apply middleware to
export const config = {
  matcher: [
    "/api/:path*", // Apply to all API routes
  ],
};
