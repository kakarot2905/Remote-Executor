/**
 * User logout endpoint
 * POST /api/auth/logout
 */

import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  // Clear the auth cookie
  response.cookies.delete("auth_token");

  return response;
}
