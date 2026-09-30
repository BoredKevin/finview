/**
 * Authentication and User Isolation Helper for Convex
 * Enforces strict per-user boundaries on all endpoints and manages sessions.
 */

import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

export interface AuthContext {
  auth: {
    getUserIdentity: () => Promise<{
      subject: string;
      tokenIdentifier: string;
      issuer?: string;
      email?: string;
    } | null>;
  };
}

/**
 * Validates the caller identity and extracts the authenticated userId.
 * Throws an explicit error if the user is unauthenticated.
 */
export async function requireAuthenticatedUser(ctx: AuthContext): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated: A valid authentication session is required to perform sync.");
  }
  return identity.subject ?? identity.tokenIdentifier;
}

/**
 * Password Hashing Helper using Web Crypto SHA-256 rounds
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  let data: any = enc.encode(`${password}:${salt}`);
  for (let i = 0; i < 1000; i++) {
    const hash = await crypto.subtle.digest("SHA-256", data);
    data = new Uint8Array(hash);
  }
  return Array.from(data as Uint8Array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRandomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * User Sign Up Mutation
 */
export const signUp = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx: any, args: { email: string; password: string; name?: string }) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    if (!normalizedEmail || !args.password || args.password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", normalizedEmail))
      .first();

    if (existing) {
      throw new Error("A user with this email already exists.");
    }

    const salt = generateRandomHex(16);
    const passwordHash = await hashPassword(args.password, salt);
    const now = Date.now();

    const userId = await ctx.db.insert("users", {
      email: normalizedEmail,
      passwordHash,
      salt,
      name: args.name?.trim() || normalizedEmail.split("@")[0],
      createdAt: now,
      updatedAt: now,
    });

    const token = generateRandomHex(32);
    await ctx.db.insert("auth_sessions", {
      userId,
      token,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30-day session
      createdAt: now,
    });

    return {
      token,
      user: {
        id: userId,
        email: normalizedEmail,
        name: args.name?.trim() || normalizedEmail.split("@")[0],
      },
    };
  },
});

/**
 * User Sign In Mutation
 */
export const signIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx: any, args: { email: string; password: string }) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", normalizedEmail))
      .first();

    if (!user) {
      throw new Error("Invalid email or password.");
    }

    const calculatedHash = await hashPassword(args.password, user.salt);
    if (calculatedHash !== user.passwordHash) {
      throw new Error("Invalid email or password.");
    }

    const now = Date.now();
    const token = generateRandomHex(32);
    await ctx.db.insert("auth_sessions", {
      userId: user._id,
      token,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      createdAt: now,
    });

    return {
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  },
});

/**
 * Change Master Password Mutation
 */
export const changePassword = mutation({
  args: {
    token: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx: any, args: { token: string; currentPassword: string; newPassword: string }) => {
    if (!args.newPassword || args.newPassword.length < 6) {
      throw new Error("New password must be at least 6 characters.");
    }

    const session = await ctx.db
      .query("auth_sessions")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Session expired or invalid. Please sign in again.");
    }

    const user = await ctx.db.get(session.userId);
    if (!user) {
      throw new Error("User not found.");
    }

    const currentHash = await hashPassword(args.currentPassword, user.salt);
    if (currentHash !== user.passwordHash) {
      throw new Error("Incorrect current password.");
    }

    const newSalt = generateRandomHex(16);
    const newHash = await hashPassword(args.newPassword, newSalt);
    const now = Date.now();

    await ctx.db.patch(user._id, {
      passwordHash: newHash,
      salt: newSalt,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Get Current User Profile Query
 */
export const currentUser = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx: any, args: { token: string }) => {
    if (!args.token) return null;
    const session = await ctx.db
      .query("auth_sessions")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      return null;
    }

    const user = await ctx.db.get(session.userId);
    if (!user) return null;

    return {
      id: user._id,
      email: user.email,
      name: user.name,
    };
  },
});

/**
 * Sign Out Mutation
 */
export const signOut = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx: any, args: { token: string }) => {
    const session = await ctx.db
      .query("auth_sessions")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
    }
    return { success: true };
  },
});
