/**
 * Convex Marketplace Operations
 * 
 * Decentralized parser registry, discovery, version checking,
 * and automated moderation with reputation demotion.
 */

import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { requireAuthenticatedUser } from "./auth.js";

/**
 * 7 days in milliseconds for reputation window calculation.
 */
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Minimum number of reports within 7 days to trigger automated demotion to 'flagged'.
 */
export const AUTOMATED_DEMOTION_THRESHOLD = 3;

/**
 * List all verified parsers for public discovery.
 * Strictly excludes any 'flagged', 'rejected', or 'pending' parsers.
 */
export const listVerifiedParsers = query({
  args: {
    country: v.optional(v.string()),
    fileType: v.optional(v.union(v.literal("pdf"), v.literal("csv"))),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("parsers"),
      slug: v.string(),
      bankName: v.string(),
      country: v.string(),
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
      updatedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    let queryBuilder = ctx.db
      .query("parsers")
      .withIndex("by_status", (q: any) => q.eq("status", "verified"));

    let results = await queryBuilder.collect();

    // In-memory filters for country, fileType, and text search
    if (args.country) {
      const countryUpper = args.country.toUpperCase();
      results = results.filter((p: any) => p.country.toUpperCase() === countryUpper);
    }

    if (args.fileType) {
      results = results.filter((p: any) => p.fileType === args.fileType);
    }

    if (args.search && args.search.trim()) {
      const term = args.search.trim().toLowerCase();
      results = results.filter(
        (p: any) =>
          p.bankName.toLowerCase().includes(term) ||
          p.slug.toLowerCase().includes(term) ||
          (p.description && p.description.toLowerCase().includes(term))
      );
    }

    // Sort by ratingScore descending, then downloadCount descending
    results.sort((a: any, b: any) => {
      if (b.ratingScore !== a.ratingScore) return b.ratingScore - a.ratingScore;
      return b.downloadCount - a.downloadCount;
    });

    if (args.limit && args.limit > 0) {
      results = results.slice(0, args.limit);
    }

    return results.map((r: any) => ({
      _id: r._id,
      slug: r.slug,
      bankName: r.bankName,
      country: r.country,
      fileType: r.fileType,
      authorId: r.authorId,
      currentVersion: r.currentVersion,
      status: r.status,
      downloadCount: r.downloadCount,
      ratingScore: r.ratingScore,
      description: r.description,
      updatedAt: r.updatedAt,
    }));
  },
});

/**
 * Retrieve a specific parser and its active verified DSL configuration by slug.
 */
export const getParserBySlug = query({
  args: {
    slug: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("parsers"),
      slug: v.string(),
      bankName: v.string(),
      country: v.string(),
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
      dslConfig: v.optional(v.string()),
      changelog: v.optional(v.string()),
      versionId: v.optional(v.id("parser_versions")),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const parser = await ctx.db
      .query("parsers")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .first();

    if (!parser) return null;

    // Fetch the version document corresponding to currentVersion
    const versionDoc = await ctx.db
      .query("parser_versions")
      .withIndex("by_parserId_version", (q: any) =>
        q.eq("parserId", parser._id).eq("version", parser.currentVersion)
      )
      .first();

    return {
      _id: parser._id,
      slug: parser.slug,
      bankName: parser.bankName,
      country: parser.country,
      fileType: parser.fileType,
      authorId: parser.authorId,
      currentVersion: parser.currentVersion,
      status: parser.status,
      downloadCount: parser.downloadCount,
      ratingScore: parser.ratingScore,
      description: parser.description,
      dslConfig: versionDoc?.dslConfig,
      changelog: versionDoc?.changelog,
      versionId: versionDoc?._id,
    };
  },
});

/**
 * Registry Query API: getMatchingParser(metadata)
 * Used by Phase 5 client orchestrator to auto-match statements against verified configurations.
 */
export const getMatchingParser = query({
  args: {
    sampleText: v.optional(v.string()),
    fileType: v.optional(v.union(v.literal("pdf"), v.literal("csv"))),
    country: v.optional(v.string()),
    bankName: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      _id: v.id("parsers"),
      slug: v.string(),
      bankName: v.string(),
      country: v.string(),
      fileType: v.union(v.literal("pdf"), v.literal("csv")),
      currentVersion: v.string(),
      dslConfig: v.string(),
      matchScore: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // 1. Fetch only verified parsers
    const verifiedParsers = await ctx.db
      .query("parsers")
      .withIndex("by_status", (q: any) => q.eq("status", "verified"))
      .collect();

    let candidates = verifiedParsers;

    if (args.fileType) {
      candidates = candidates.filter((p: any) => p.fileType === args.fileType);
    }

    if (args.country) {
      const c = args.country.toUpperCase();
      candidates = candidates.filter((p: any) => p.country.toUpperCase() === c);
    }

    if (args.bankName && args.bankName.trim()) {
      const b = args.bankName.trim().toLowerCase();
      const directMatch = candidates.find(
        (p: any) =>
          p.bankName.toLowerCase().includes(b) ||
          p.slug.toLowerCase().includes(b)
      );
      if (directMatch) {
        const vDoc = await ctx.db
          .query("parser_versions")
          .withIndex("by_parserId_version", (q: any) =>
            q.eq("parserId", directMatch._id).eq("version", directMatch.currentVersion)
          )
          .first();

        if (vDoc) {
          return {
            _id: directMatch._id,
            slug: directMatch.slug,
            bankName: directMatch.bankName,
            country: directMatch.country,
            fileType: directMatch.fileType,
            currentVersion: directMatch.currentVersion,
            dslConfig: vDoc.dslConfig,
            matchScore: 100,
          };
        }
      }
    }

    // 2. Pattern matching against sampleText
    if (args.sampleText && args.sampleText.trim()) {
      const textUpper = args.sampleText.toUpperCase();
      let bestMatch: any = null;
      let highestScore = 0;
      let bestConfig = "";

      for (const parser of candidates) {
        const vDoc = await ctx.db
          .query("parser_versions")
          .withIndex("by_parserId_version", (q: any) =>
            q.eq("parserId", parser._id).eq("version", parser.currentVersion)
          )
          .first();

        if (!vDoc) continue;

        try {
          const config = JSON.parse(vDoc.dslConfig);
          const patterns: string[] = config.matchers?.contentPatterns || [];
          let matches = 0;

          for (const pattern of patterns) {
            if (textUpper.includes(pattern.toUpperCase())) {
              matches++;
            }
          }

          if (matches > 0 && matches > highestScore) {
            highestScore = matches;
            bestMatch = parser;
            bestConfig = vDoc.dslConfig;
          }
        } catch {
          // ignore malformed config
        }
      }

      if (bestMatch && highestScore > 0) {
        return {
          _id: bestMatch._id,
          slug: bestMatch.slug,
          bankName: bestMatch.bankName,
          country: bestMatch.country,
          fileType: bestMatch.fileType,
          currentVersion: bestMatch.currentVersion,
          dslConfig: bestConfig,
          matchScore: Math.round((highestScore / 5) * 100),
        };
      }
    }

    return null;
  },
});

/**
 * Batch version check endpoint:
 * Allows clients to query available updates for locally installed parsers.
 */
export const checkForUpdates = query({
  args: {
    installed: v.array(
      v.object({
        slug: v.string(),
        version: v.string(),
      })
    ),
  },
  returns: v.array(
    v.object({
      slug: v.string(),
      installedVersion: v.string(),
      latestVersion: v.string(),
      hasUpdate: v.boolean(),
      changelog: v.optional(v.string()),
      dslConfig: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const updates: any[] = [];

    for (const item of args.installed) {
      const parser = await ctx.db
        .query("parsers")
        .withIndex("by_slug", (q: any) => q.eq("slug", item.slug))
        .first();

      if (!parser || parser.status !== "verified") {
        continue;
      }

      const hasUpdate = parser.currentVersion !== item.version;

      if (hasUpdate) {
        const vDoc = await ctx.db
          .query("parser_versions")
          .withIndex("by_parserId_version", (q: any) =>
            q.eq("parserId", parser._id).eq("version", parser.currentVersion)
          )
          .first();

        updates.push({
          slug: parser.slug,
          installedVersion: item.version,
          latestVersion: parser.currentVersion,
          hasUpdate: true,
          changelog: vDoc?.changelog,
          dslConfig: vDoc?.dslConfig,
        });
      }
    }

    return updates;
  },
});

/**
 * Submit a parser definition and its verified fixture to the marketplace.
 * Enters in 'pending' status until verified by the Automated Ingestion Gatekeeper.
 */
export const submitParser = mutation({
  args: {
    slug: v.string(),
    bankName: v.string(),
    country: v.string(),
    fileType: v.union(v.literal("pdf"), v.literal("csv")),
    version: v.string(),
    dslConfig: v.string(),
    fixtureData: v.string(),
    changelog: v.string(),
    description: v.optional(v.string()),
    authorId: v.optional(v.string()),
  },
  returns: v.object({
    parserId: v.id("parsers"),
    versionId: v.id("parser_versions"),
    status: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("flagged"),
      v.literal("rejected")
    ),
  }),
  handler: async (ctx, args) => {
    let authorId = args.authorId ?? "anonymous_author";
    try {
      const caller = await requireAuthenticatedUser(ctx);
      if (caller) authorId = caller;
    } catch {
      // Guest or local development author fallback
    }

    const now = Date.now();

    // Check if parser already exists
    let parser = await ctx.db
      .query("parsers")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .first();

    let parserId: any;

    if (!parser) {
      parserId = await ctx.db.insert("parsers", {
        slug: args.slug,
        bankName: args.bankName,
        country: args.country.toUpperCase(),
        fileType: args.fileType,
        authorId,
        currentVersion: args.version,
        status: "pending",
        downloadCount: 0,
        ratingScore: 5.0,
        description: args.description,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      parserId = parser._id;
      await ctx.db.patch(parserId, {
        bankName: args.bankName,
        country: args.country.toUpperCase(),
        fileType: args.fileType,
        currentVersion: args.version,
        status: "pending",
        description: args.description ?? parser.description,
        updatedAt: now,
      });
    }

    // Insert version document
    const versionId = await ctx.db.insert("parser_versions", {
      parserId,
      version: args.version,
      dslConfig: args.dslConfig,
      fixtureData: args.fixtureData,
      changelog: args.changelog,
      createdAt: now,
    });

    return {
      parserId,
      versionId,
      status: "pending" as const,
    };
  },
});

/**
 * Report a defect, malicious attempt, or spam for an installed parser.
 * AUTOMATED DEMOTION POLICY:
 * If a parser receives >= 3 defect reports within 7 days, its status
 * is immediately changed to "flagged", removing it from public search indices.
 */
export const reportParser = mutation({
  args: {
    parserId: v.id("parsers"),
    reason: v.union(
      v.literal("broken_parser"),
      v.literal("malicious_attempt"),
      v.literal("spam")
    ),
    details: v.string(),
    reporterId: v.optional(v.string()),
  },
  returns: v.object({
    reportId: v.id("parser_reports"),
    reportsInLast7Days: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("flagged"),
      v.literal("rejected")
    ),
    demoted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    let reporterId = args.reporterId ?? "anonymous_reporter";
    try {
      const caller = await requireAuthenticatedUser(ctx);
      if (caller) reporterId = caller;
    } catch {
      // Guest reporter fallback
    }

    const now = Date.now();

    // 1. Insert the report
    const reportId = await ctx.db.insert("parser_reports", {
      parserId: args.parserId,
      reporterId,
      reason: args.reason,
      details: args.details,
      createdAt: now,
    });

    // 2. Fetch all reports for this parser within the last 7 days
    const sevenDaysAgo = now - SEVEN_DAYS_MS;
    const recentReports = await ctx.db
      .query("parser_reports")
      .withIndex("by_parserId_createdAt", (q: any) =>
        q.eq("parserId", args.parserId).gte("createdAt", sevenDaysAgo)
      )
      .collect();

    const reportCount = recentReports.length;
    let demoted = false;

    // 3. Automated Demotion Gate: If >= 3 reports in 7 days, flag and delist
    const parser = await ctx.db.get(args.parserId);
    let currentStatus = parser?.status ?? "verified";

    if (reportCount >= AUTOMATED_DEMOTION_THRESHOLD && currentStatus !== "flagged") {
      await ctx.db.patch(args.parserId, {
        status: "flagged",
        updatedAt: now,
      });
      currentStatus = "flagged";
      demoted = true;
    }

    return {
      reportId,
      reportsInLast7Days: reportCount,
      status: currentStatus,
      demoted,
    };
  },
});

/**
 * Increment the download count for a parser upon installation.
 */
export const recordDownload = mutation({
  args: {
    parserId: v.id("parsers"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parser = await ctx.db.get(args.parserId);
    if (parser) {
      await ctx.db.patch(args.parserId, {
        downloadCount: (parser.downloadCount || 0) + 1,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Retrieve reputation metrics and defect reports for a parser.
 */
export const getParserReputation = query({
  args: {
    parserId: v.id("parsers"),
  },
  returns: v.object({
    parserId: v.id("parsers"),
    status: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("flagged"),
      v.literal("rejected")
    ),
    ratingScore: v.number(),
    downloadCount: v.number(),
    totalReports: v.number(),
    reportsInLast7Days: v.number(),
    isFlagged: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const parser = await ctx.db.get(args.parserId);
    if (!parser) {
      throw new Error(`Parser not found: ${args.parserId}`);
    }

    const allReports = await ctx.db
      .query("parser_reports")
      .withIndex("by_parserId", (q: any) => q.eq("parserId", args.parserId))
      .collect();

    const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;
    const recentReports = allReports.filter((r: any) => r.createdAt >= sevenDaysAgo);

    return {
      parserId: parser._id,
      status: parser.status,
      ratingScore: parser.ratingScore,
      downloadCount: parser.downloadCount,
      totalReports: allReports.length,
      reportsInLast7Days: recentReports.length,
      isFlagged: parser.status === "flagged",
    };
  },
});
