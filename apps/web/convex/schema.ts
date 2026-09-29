import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const encryptedEnvelopeValidator = v.object({
  recordId: v.string(),
  table: v.union(v.literal("transactions"), v.literal("accounts"), v.literal("categories")),
  iv: v.string(),
  ciphertext: v.string(),
  schemaVersion: v.number(),
  updatedAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
});

export default defineSchema({
  encrypted_records: defineTable({
    userId: v.string(),
    recordId: v.string(),
    table: v.union(v.literal("transactions"), v.literal("accounts"), v.literal("categories")),
    ciphertext: v.string(),
    iv: v.string(),
    schemaVersion: v.number(),
    updatedAt: v.number(),
    deletedAt: v.union(v.number(), v.null()),
  })
    .index("by_user_record", ["userId", "recordId"])
    .index("by_user_updatedAt", ["userId", "updatedAt"])
    .index("by_user_table", ["userId", "table"]),

  sync_cursors: defineTable({
    userId: v.string(),
    lastPulledAt: v.number(),
  }).index("by_user", ["userId"]),
});
