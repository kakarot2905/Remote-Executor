/**
 * User registration endpoint
 * POST /api/auth/register
 */

import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/models/user";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, email } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const user = await createUser(username, password, email);

    return NextResponse.json(
      {
        success: true,
        message: "User created successfully",
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Registration failed";

    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    console.error("Registration error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
