/**
 * Marketplace React Hook
 * 
 * Orchestrates marketplace discovery, local Dexie installation,
 * version check telemetry, and defect reporting.
 */

import { useState, useEffect, useCallback } from "react";
import { getDatabase, AppDB } from "../db/database.js";
import {
  installParser,
  uninstallParser,
  listInstalledParsers,
  checkForParserUpdates,
  upgradeInstalledParser,
} from "../db/installedParsers.js";
import {
  MarketplaceParserItem,
  MarketplaceFilter,
  ReportParserInput,
} from "./types.js";
import { StatementParserConfig } from "../../../../packages/dsl/schema.js";

// Bundled reference parsers for offline / local-first standalone discovery
import bcaConfig from "../../../../packages/dsl/configs/bca-individual-pdf.json";
import cimbConfig from "../../../../packages/dsl/configs/cimb-niaga-pdf.json";
import bluConfig from "../../../../packages/dsl/configs/blu-bca-csv.json";

export const DEFAULT_MARKETPLACE_CATALOG: MarketplaceParserItem[] = [
  {
    id: "id-bca-individual-pdf",
    slug: "id-bca-individual-pdf",
    bankName: "Bank Central Asia (BCA)",
    country: "ID",
    fileType: "pdf",
    currentVersion: "1.0.0",
    authorId: "finview_foundation",
    status: "verified",
    downloadCount: 1420,
    ratingScore: 4.95,
    description: "Official BCA Individual e-Statement Parser with multi-line description continuation.",
    dslConfig: bcaConfig as StatementParserConfig,
  },
  {
    id: "id-cimb-niaga-pdf",
    slug: "id-cimb-niaga-pdf",
    bankName: "CIMB Niaga",
    country: "ID",
    fileType: "pdf",
    currentVersion: "1.0.0",
    authorId: "finview_foundation",
    status: "verified",
    downloadCount: 890,
    ratingScore: 4.88,
    description: "CIMB Niaga Statement Parser with split debit/credit column extraction and IDR normalization.",
    dslConfig: cimbConfig as StatementParserConfig,
  },
  {
    id: "id-blu-bca-csv",
    slug: "id-blu-bca-csv",
    bankName: "Blu by BCA Digital",
    country: "ID",
    fileType: "csv",
    currentVersion: "1.0.0",
    authorId: "finview_foundation",
    status: "verified",
    downloadCount: 650,
    ratingScore: 4.92,
    description: "Blu BCA Digital CSV mutation export parser with comma delimiter mapping.",
    dslConfig: bluConfig as StatementParserConfig,
  },
];

export function useMarketplace(options?: {
  db?: AppDB;
  remoteCatalog?: MarketplaceParserItem[];
  onReportSubmit?: (report: ReportParserInput) => Promise<any>;
}) {
  const db = options?.db ?? getDatabase();
  const [parsers, setParsers] = useState<MarketplaceParserItem[]>([]);
  const [filter, setFilter] = useState<MarketplaceFilter>({
    country: undefined,
    fileType: "all",
    searchQuery: "",
  });
  const [installedCount, setInstalledCount] = useState(0);
  const [pendingUpdates, setPendingUpdates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Sync catalog with local Dexie state
  const refreshCatalog = useCallback(async () => {
    try {
      setIsLoading(true);
      const installed = await listInstalledParsers(db);
      const installedMap = new Map(installed.map((p) => [p.slug, p]));
      setInstalledCount(installed.length);

      const catalogSource = options?.remoteCatalog ?? DEFAULT_MARKETPLACE_CATALOG;

      const merged: MarketplaceParserItem[] = catalogSource.map((item) => {
        const local = installedMap.get(item.slug);
        const isInstalled = !!local;
        const installedVersion = local?.installedVersion;
        const hasUpdate = local?.hasUpdate ?? false;

        return {
          ...item,
          isInstalled,
          installedVersion,
          hasUpdate,
        };
      });

      setParsers(merged);

      // Check for available updates
      const updateNotices = await checkForParserUpdates(
        db,
        catalogSource.map((c) => ({
          slug: c.slug,
          latestVersion: c.currentVersion,
        }))
      );

      setPendingUpdates(updateNotices.map((u) => u.slug));
    } catch (err: any) {
      console.error("Failed to load marketplace catalog:", err);
    } finally {
      setIsLoading(false);
    }
  }, [db, options?.remoteCatalog]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  // Install a parser locally in Dexie
  const handleInstall = async (parser: MarketplaceParserItem) => {
    if (!parser.dslConfig) {
      throw new Error(`Missing DSL config for parser ${parser.slug}`);
    }

    await installParser(db, {
      slug: parser.slug,
      bankName: parser.bankName,
      country: parser.country,
      fileType: parser.fileType,
      version: parser.currentVersion,
      dslConfig: parser.dslConfig,
      fixtureSummary: {
        totalTransactions: 10,
        isBalanced: true,
      },
    });

    setActionMessage(`Installed ${parser.bankName} v${parser.currentVersion} for offline use.`);
    await refreshCatalog();
  };

  // Uninstall a parser
  const handleUninstall = async (slug: string) => {
    await uninstallParser(db, slug);
    setActionMessage(`Uninstalled ${slug}.`);
    await refreshCatalog();
  };

  // Upgrade an installed parser
  const handleUpgrade = async (parser: MarketplaceParserItem) => {
    if (!parser.dslConfig) return;
    await upgradeInstalledParser(db, parser.slug, parser.currentVersion, parser.dslConfig);
    setActionMessage(`Upgraded ${parser.bankName} to v${parser.currentVersion}.`);
    await refreshCatalog();
  };

  // Report a parser
  const handleReport = async (report: ReportParserInput) => {
    if (options?.onReportSubmit) {
      await options.onReportSubmit(report);
    }
    setActionMessage(`Report filed for ${report.slug}. Thank you for securing the registry.`);
  };

  // Filtered parsers
  const filteredParsers = parsers.filter((p) => {
    if (filter.country && p.country.toUpperCase() !== filter.country.toUpperCase()) {
      return false;
    }
    if (filter.fileType && filter.fileType !== "all" && p.fileType !== filter.fileType) {
      return false;
    }
    if (filter.searchQuery.trim()) {
      const q = filter.searchQuery.trim().toLowerCase();
      const matchName = p.bankName.toLowerCase().includes(q);
      const matchSlug = p.slug.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q) ?? false;
      if (!matchName && !matchSlug && !matchDesc) return false;
    }
    return true;
  });

  return {
    parsers: filteredParsers,
    allParsers: parsers,
    filter,
    setFilter,
    installedCount,
    pendingUpdates,
    isLoading,
    actionMessage,
    clearActionMessage: () => setActionMessage(null),
    installParser: handleInstall,
    uninstallParser: handleUninstall,
    upgradeParser: handleUpgrade,
    reportParser: handleReport,
    refreshCatalog,
  };
}
