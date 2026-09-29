/**
 * Client Installation & Offline Registry
 * 
 * Persists verified parser configurations into local Dexie IndexedDB.
 * Guarantees 100% offline statement parsing capabilities without runtime network connectivity.
 * Implements version checks against Convex registry to notify users of layout updates.
 */

import { AppDB } from "./database.js";
import { InstalledParser } from "./types.js";
import {
  StatementParserConfig,
  validateStatementParserConfig,
} from "../../../../packages/dsl/schema.js";

export interface InstallParserInput {
  slug: string;
  bankName: string;
  country: string; // ISO 3166-1 alpha-2 (e.g. "ID", "SG", "US")
  fileType: "pdf" | "csv";
  version: string;
  dslConfig: StatementParserConfig;
  fixtureSummary?: {
    totalTransactions: number;
    isBalanced: boolean;
  };
}

export interface ParserUpdateNotice {
  slug: string;
  bankName: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
}

export interface OfflineMatchQuery {
  sampleText?: string;
  fileType?: "pdf" | "csv";
  country?: string;
  bankName?: string;
}

/**
 * Compare two semver strings (e.g. "1.0.0" vs "1.1.0").
 * Returns:
 *   -1 if v1 < v2
 *    0 if v1 === v2
 *    1 if v1 > v2
 */
export function compareSemver(v1: string, v2: string): number {
  const parseParts = (v: string) => {
    const cleaned = v.replace(/^v/, "").trim();
    const [numPart] = cleaned.split("-");
    const segments = (numPart || "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
    while (segments.length < 3) segments.push(0);
    return segments;
  };

  const [maj1, min1, pat1] = parseParts(v1);
  const [maj2, min2, pat2] = parseParts(v2);

  if (maj1 !== maj2) return (maj1 || 0) > (maj2 || 0) ? 1 : -1;
  if (min1 !== min2) return (min1 || 0) > (min2 || 0) ? 1 : -1;
  if (pat1 !== pat2) return (pat1 || 0) > (pat2 || 0) ? 1 : -1;
  return 0;
}

/**
 * Persist an installed parser configuration into Dexie local database.
 * Enables zero-network parsing execution.
 */
export async function installParser(
  db: AppDB,
  input: InstallParserInput
): Promise<InstalledParser> {
  // Validate schema strictly before saving to local disk
  const validatedConfig = validateStatementParserConfig(input.dslConfig);

  const now = Date.now();
  const installed: InstalledParser = {
    id: input.slug,
    slug: input.slug,
    bankName: input.bankName,
    country: input.country.toUpperCase(),
    fileType: input.fileType,
    installedVersion: input.version,
    latestAvailableVersion: input.version,
    hasUpdate: false,
    dslConfig: validatedConfig,
    fixtureSummary: input.fixtureSummary,
    installedAt: now,
    updatedAt: now,
  };

  await db.installedParsers.put(installed);
  return installed;
}

/**
 * Remove an installed parser from local offline storage.
 */
export async function uninstallParser(
  db: AppDB,
  slugOrId: string
): Promise<boolean> {
  const existing = await getInstalledParser(db, slugOrId);
  if (!existing) return false;

  await db.installedParsers.delete(existing.id);
  return true;
}

/**
 * Retrieve an installed parser by slug or ID.
 */
export async function getInstalledParser(
  db: AppDB,
  slugOrId: string
): Promise<InstalledParser | null> {
  let parser = await db.installedParsers.get(slugOrId);
  if (!parser) {
    parser = await db.installedParsers.where("slug").equals(slugOrId).first();
  }
  return parser || null;
}

/**
 * List all installed parsers stored in Dexie.
 */
export async function listInstalledParsers(db: AppDB): Promise<InstalledParser[]> {
  const all = await db.installedParsers.toArray();
  return all.sort((a, b) => a.bankName.localeCompare(b.bankName));
}

/**
 * Offline Auto-Detection Engine:
 * Identifies the matching installed parser for a statement file without network activity.
 * Evaluates fileType, bankName, and declarative contentPatterns from stored DSL matchers.
 */
export async function findInstalledParserForDocument(
  db: AppDB,
  query: OfflineMatchQuery
): Promise<InstalledParser | null> {
  let candidates = await db.installedParsers.toArray();

  if (query.fileType) {
    candidates = candidates.filter((p) => p.fileType === query.fileType);
  }

  if (query.country) {
    const cUpper = query.country.toUpperCase();
    candidates = candidates.filter((p) => p.country.toUpperCase() === cUpper);
  }

  // Exact or substring bank name match
  if (query.bankName && query.bankName.trim()) {
    const bLower = query.bankName.trim().toLowerCase();
    const bankMatch = candidates.find((p) => p.bankName.toLowerCase().includes(bLower));
    if (bankMatch) return bankMatch;
  }

  // Evaluate content patterns against sample text
  if (query.sampleText && query.sampleText.trim()) {
    const sampleUpper = query.sampleText.toUpperCase();
    let bestParser: InstalledParser | null = null;
    let highestMatches = 0;

    for (const parser of candidates) {
      const patterns = parser.dslConfig.matchers?.contentPatterns || [];
      let matches = 0;

      for (const pattern of patterns) {
        if (sampleUpper.includes(pattern.toUpperCase())) {
          matches++;
        }
      }

      if (matches > 0 && matches > highestMatches) {
        highestMatches = matches;
        bestParser = parser;
      }
    }

    if (bestParser && highestMatches > 0) {
      return bestParser;
    }
  }

  return null;
}

/**
 * Check installed parsers against remote Convex version registry.
 * Flags available updates in the local database and returns update notices.
 */
export async function checkForParserUpdates(
  db: AppDB,
  remoteVersions: Array<{ slug: string; latestVersion: string; changelog?: string }>
): Promise<ParserUpdateNotice[]> {
  const notices: ParserUpdateNotice[] = [];

  for (const remote of remoteVersions) {
    const local = await getInstalledParser(db, remote.slug);
    if (!local) continue;

    const isNewer = compareSemver(local.installedVersion, remote.latestVersion) < 0;

    if (isNewer) {
      // Mark update flag in local database
      await db.installedParsers.update(local.id, {
        latestAvailableVersion: remote.latestVersion,
        hasUpdate: true,
        updatedAt: Date.now(),
      });

      notices.push({
        slug: local.slug,
        bankName: local.bankName,
        currentVersion: local.installedVersion,
        latestVersion: remote.latestVersion,
        changelog: remote.changelog,
      });
    } else if (local.hasUpdate) {
      // Clear update flag if local version is already up to date
      await db.installedParsers.update(local.id, {
        latestAvailableVersion: local.installedVersion,
        hasUpdate: false,
        updatedAt: Date.now(),
      });
    }
  }

  return notices;
}

/**
 * Apply an update to an existing installed parser configuration in Dexie.
 */
export async function upgradeInstalledParser(
  db: AppDB,
  slug: string,
  newVersion: string,
  newDslConfig: StatementParserConfig
): Promise<InstalledParser> {
  const local = await getInstalledParser(db, slug);
  if (!local) {
    throw new Error(`Cannot upgrade uninstalled parser: ${slug}`);
  }

  const validatedConfig = validateStatementParserConfig(newDslConfig);
  const now = Date.now();

  const updated: InstalledParser = {
    ...local,
    installedVersion: newVersion,
    latestAvailableVersion: newVersion,
    hasUpdate: false,
    dslConfig: validatedConfig,
    updatedAt: now,
  };

  await db.installedParsers.put(updated);
  return updated;
}
