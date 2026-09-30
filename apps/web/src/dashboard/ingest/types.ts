/**
 * Unified Ingestion Pipeline Types
 */

import { StatementParserConfig } from "../../../../../packages/dsl/schema.js";
import { NormalizedTextSpan, ParsedTransaction } from "../../../../../packages/dsl/types.js";
import { InstalledParser } from "../../db/types.js";
import { StudioDocument } from "../../studio/types.js";

export type IngestionStep =
  | "idle"
  | "inspecting"
  | "password_required"
  | "scanned_detected"
  | "marketplace_prompt"
  | "parsing"
  | "reconciling"
  | "committed"
  | "error";

export interface MarketplaceMatch {
  id: string;
  slug: string;
  bankName: string;
  country: string;
  fileType: "pdf" | "csv";
  currentVersion: string;
  dslConfig: string;
  matchScore: number;
}

export interface TransactionConfidence {
  score: number; // 0..100
  level: "high" | "medium" | "low";
  factors: {
    dateValid: boolean;
    amountValid: boolean;
    descriptionValid: boolean;
    balanceConsistent: boolean;
  };
  warnings: string[];
}

export interface ReconciliationItem {
  id: string;
  transaction: ParsedTransaction;
  confidence: TransactionConfidence;
  selected: boolean;
}

export interface IngestionResult {
  step: IngestionStep;
  file?: File;
  fileBuffer?: ArrayBuffer;
  sampleText?: string;
  firstPageSpans?: NormalizedTextSpan[];
  totalPages?: number;
  matchedParser?: InstalledParser | StatementParserConfig;
  marketplaceMatch?: MarketplaceMatch;
  transactions?: ParsedTransaction[];
  reconciliationItems?: ReconciliationItem[];
  isBalanced?: boolean;
  discrepancyMinorUnits?: bigint;
  studioDocument?: StudioDocument;
  errorCode?: string;
  errorMessage?: string;
  progress?: { currentPage: number; totalPages: number };
}
