/**
 * TypeScript Type Definitions for the Statement Parser Engine & Web Worker Pipeline
 */

import { StatementParserConfig } from "./schema.js";

/**
 * Text span extracted from a PDF page and mapped to a normalized 0..1000 coordinate grid.
 */
export interface NormalizedTextSpan {
  text: string;
  x: number;      // 0..1000 normalized integer
  y: number;      // 0..1000 normalized integer (0 = top, 1000 = bottom)
  width: number;  // normalized width
  height: number; // normalized height
}

/**
 * A horizontal row reconstructed by clustering spans with vertical tolerance Delta y <= 3.
 */
export interface ExtractedRow {
  y: number;               // Representative y baseline (0..1000)
  spans: NormalizedTextSpan[]; // Spans sorted by x ascending
  rawText: string;         // Space-joined row text
}

/**
 * Fully parsed and normalized transaction record.
 */
export interface ParsedTransaction {
  id: string;                               // Unique deterministic UUID or hash-based ID
  accountId: string;                        // Associated account ID
  date: string;                             // Normalized ISO 8601 string (YYYY-MM-DD)
  rawDate: string;                          // Original date string from statement
  description: string;                      // Sanitized, multi-line joined description
  amountMinorUnits: bigint;                 // Signed minor units: negative for debit, positive for credit
  runningBalanceMinorUnits?: bigint | null; // Optional running balance in minor units
  hash: string;                             // Deterministic SHA-256 deduplication hash
  sequenceIndex: number;                    // 0-indexed position within the statement document
  metadata?: Record<string, string>;        // Supplementary attributes (e.g. branch, reference no)
}

/**
 * Summary result returned by the parsing engine upon completion.
 */
export interface StatementParseResult {
  bankId: string;
  configVersion: string;
  fileType: "pdf" | "csv";
  transactions: ParsedTransaction[];
  totalPages: number;
  totalTransactions: number;
  executionTimeMs: number;
}

/**
 * Runtime execution options for parsing a statement.
 */
export interface StatementParseOptions {
  accountId: string;
  config: StatementParserConfig;
  password?: string;
  onPasswordRequest?: () => Promise<string>;
  onProgress?: (progress: { currentPage: number; totalPages: number }) => void;
  deadlineMsPerPage?: number; // Defaults to 50ms
}
