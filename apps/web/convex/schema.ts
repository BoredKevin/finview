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

  parsers: defineTable({
    slug: v.string(),
    bankName: v.string(),
    country: v.string(), // ISO 3166-1 alpha-2
    fileType: v.union(v.literal("pdf"), v.literal("csv")),
    authorId: v.string(),
    currentVersion: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("flagged"),
      v.literal("rejected")
    ),
    downloadCount: v.number(),
    ratingScore: v.number(),
    description: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_country_status", ["country", "status"])
    .index("by_fileType_status", ["fileType", "status"])
    .index("by_authorId", ["authorId"])
    .searchIndex("search_bankName", {
      searchField: "bankName",
      filterFields: ["country", "fileType", "status"],
    }),

  parser_versions: defineTable({
    parserId: v.id("parsers"),
    version: v.string(),
    dslConfig: v.string(),
    fixtureData: v.string(),
    changelog: v.string(),
    createdAt: v.number(),
    verifiedAt: v.optional(v.number()),
    verificationLog: v.optional(v.string()),
  })
    .index("by_parserId", ["parserId"])
    .index("by_parserId_version", ["parserId", "version"]),

  parser_reports: defineTable({
    parserId: v.id("parsers"),
    reporterId: v.string(),
    reason: v.union(
      v.literal("broken_parser"),
      v.literal("malicious_attempt"),
      v.literal("spam")
    ),
    details: v.string(),
    createdAt: v.number(),
  })
    .index("by_parserId", ["parserId"])
    .index("by_parserId_createdAt", ["parserId", "createdAt"])
    .index("by_reporterId", ["reporterId"]),

  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
    name: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  auth_sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),
});

