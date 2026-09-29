/**
 * Marketplace Component Type Contracts
 */

import { StatementParserConfig } from "../../../../packages/dsl/schema.js";

export type ParserStatus = "pending" | "verified" | "flagged" | "rejected";

export interface MarketplaceParserItem {
  id: string; // slug or ID
  slug: string;
  bankName: string;
  country: string; // ISO 3166-1 alpha-2 (e.g. "ID", "SG", "US")
  fileType: "pdf" | "csv";
  currentVersion: string;
  authorId: string;
  status: ParserStatus;
  downloadCount: number;
  ratingScore: number;
  description?: string;
  dslConfig?: StatementParserConfig;
  isInstalled?: boolean;
  installedVersion?: string;
  hasUpdate?: boolean;
}

export interface MarketplaceFilter {
  country?: string;
  fileType?: "all" | "pdf" | "csv";
  searchQuery: string;
}

export interface ReportParserInput {
  parserId: string;
  slug: string;
  reason: "broken_parser" | "malicious_attempt" | "spam";
  details: string;
}
