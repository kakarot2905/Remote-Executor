/**
 * Get current user info
 * GET /api/auth/me
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { getUserById } from "@/lib/models/user";

export async function GET(request: NextRequest) {
  const auth = authenticateUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const user = await getUserById(auth.user.sub);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch user";
    console.error("Get user error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
