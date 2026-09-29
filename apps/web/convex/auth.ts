/**
 * Authentication and User Isolation Helper for Convex
 * Enforces strict per-user boundaries on all endpoints.
 */

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
