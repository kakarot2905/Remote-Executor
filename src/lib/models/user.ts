/**
 * User model for MongoDB
 * Stores user credentials and authentication data
 */

import { getMongoDb } from "../db/mongo";
import bcrypt from "bcryptjs";

export interface User {
  _id?: string;
  username: string;
  passwordHash: string;
  email?: string;
  role: "user" | "admin";
  createdAt: Date;
  lastLoginAt?: Date;
}

export async function createUser(
  username: string,
  password: string,
  email?: string,
  role: "user" | "admin" = "user",
): Promise<User> {
  const db = await getMongoDb();
  const users = db.collection<User>("users");

  // Check if user already exists
  const existing = await users.findOne({ username });
  if (existing) {
    throw new Error("Username already exists");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  const user: User = {
    username,
    passwordHash,
    email,
    role,
    createdAt: new Date(),
  };

  const result = await users.insertOne(user as any);
  return { ...user, _id: result.insertedId.toString() };
}

export async function findUserByUsername(
  username: string,
): Promise<User | null> {
  const db = await getMongoDb();
  const users = db.collection<User>("users");
  return users.findOne({ username });
}

export async function verifyPassword(
  user: User,
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export async function updateLastLogin(username: string): Promise<void> {
  const db = await getMongoDb();
  const users = db.collection<User>("users");
  await users.updateOne({ username }, { $set: { lastLoginAt: new Date() } });
}

export async function getUserById(userId: string): Promise<User | null> {
  const db = await getMongoDb();
  const users = db.collection<User>("users");
  const { ObjectId } = await import("mongodb");
  return users.findOne({ _id: new ObjectId(userId) } as any);
}
