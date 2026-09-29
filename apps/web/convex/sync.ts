/**
 * Convex Remote Storage Engine Operations
 * Zero-Knowledge Sync Endpoints with Last-Write-Wins (LWW) and Tombstone Retention
 */

import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { requireAuthenticatedUser } from "./auth.js";
import { encryptedEnvelopeValidator } from "./schema.js";

/**
 * Push a batch of encrypted envelopes to remote storage.
 * Enforces:
 * 1. Caller authentication via Convex Auth and strict userId isolation.
 * 2. Last-Write-Wins (LWW) conflict resolution using record updatedAt timestamps.
 * 3. Tombstone retention: records with deletedAt !== null are preserved to propagate deletions.
 */
export const pushBatch = mutation({
  args: {
    records: v.array(encryptedEnvelopeValidator),
  },
  returns: v.object({
    processed: v.number(),
    upserted: v.number(),
    skipped: v.number(),
    timestamp: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUser(ctx);
    let upserted = 0;
    let skipped = 0;
    const now = Date.now();

    for (const record of args.records) {
      const existing = await ctx.db
        .query("encrypted_records")
        .withIndex("by_user_record", (q: any) =>
          q.eq("userId", userId).eq("recordId", record.recordId)
        )
        .first();

      if (!existing) {
        await ctx.db.insert("encrypted_records", {
          userId,
          recordId: record.recordId,
          table: record.table,
          ciphertext: record.ciphertext,
          iv: record.iv,
          schemaVersion: record.schemaVersion,
          updatedAt: record.updatedAt,
          deletedAt: record.deletedAt,
        });
        upserted++;
      } else {
        // Last-Write-Wins (LWW) comparison
        if (record.updatedAt > existing.updatedAt) {
          await ctx.db.patch(existing._id, {
            table: record.table,
            ciphertext: record.ciphertext,
            iv: record.iv,
            schemaVersion: record.schemaVersion,
            updatedAt: record.updatedAt,
            deletedAt: record.deletedAt, // Retains tombstone if deletedAt !== null
          });
          upserted++;
        } else {
          skipped++;
        }
      }
    }

    return {
      processed: args.records.length,
      upserted,
      skipped,
      timestamp: now,
    };
  },
});

/**
 * Pull all changes modified strictly after the `since` timestamp.
 * Enforces:
 * 1. Caller authentication via Convex Auth and strict userId isolation.
 * 2. Tombstone delivery: deleted records are returned with deletedAt !== null.
 */
export const pullChanges = query({
  args: {
    since: v.number(),
  },
  returns: v.object({
    records: v.array(encryptedEnvelopeValidator),
    serverTime: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUser(ctx);
    const serverTime = Date.now();

    const records = await ctx.db
      .query("encrypted_records")
      .withIndex("by_user_updatedAt", (q: any) =>
        q.eq("userId", userId).gt("updatedAt", args.since)
      )
      .collect();

    const envelopes = records.map((r: any) => ({
      recordId: r.recordId,
      table: r.table,
      iv: r.iv,
      ciphertext: r.ciphertext,
      schemaVersion: r.schemaVersion,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
    }));

    return {
      records: envelopes,
      serverTime,
    };
  },
});

/**
 * Update the user's sync cursor position after a successful pull.
 */
export const updateSyncCursor = mutation({
  args: {
    lastPulledAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUser(ctx);

    const existing = await ctx.db
      .query("sync_cursors")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastPulledAt: args.lastPulledAt,
      });
    } else {
      await ctx.db.insert("sync_cursors", {
        userId,
        lastPulledAt: args.lastPulledAt,
      });
    }

    return null;
  },
});

/**
 * Retrieve the current sync cursor for the authenticated user.
 */
export const getSyncCursor = query({
  args: {},
  returns: v.union(
    v.object({
      lastPulledAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUser(ctx);

    const existing = await ctx.db
      .query("sync_cursors")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .first();

    if (!existing) {
      return null;
    }

    return {
      lastPulledAt: existing.lastPulledAt,
    };
  },
});
