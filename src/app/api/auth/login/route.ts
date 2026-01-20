/**
 * User login endpoint
 * POST /api/auth/login
 */

import { NextRequest, NextResponse } from "next/server";
import {
  findUserByUsername,
  verifyPassword,
  updateLastLogin,
} from "@/lib/models/user";
import jwt from "jsonwebtoken";
import { config } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    // Find user
    const user = await findUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Verify password
    const isValid = await verifyPassword(user, password);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Update last login
    await updateLastLogin(username);

    // Generate JWT token
    const token = jwt.sign(
      {
        sub: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions,
    );

    // Create response with token in httpOnly cookie
    const response = NextResponse.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token, // Also return in body for programmatic access
    });

    // Set httpOnly cookie for browser-based auth
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: config.enforceTls,
      sameSite: "strict",
      maxAge: 12 * 60 * 60, // 12 hours
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Login failed";
    console.error("Login error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
