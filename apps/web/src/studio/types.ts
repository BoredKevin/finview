/**
 * Parser Studio Type Definitions
 * 
 * Strict type contracts for canvas interactions, visual configuration wizard,
 * mathematical reconciliation engine, and PII sanitization/fixture export.
 */

import { StatementParserConfig, PdfColumn, CsvColumn } from "../../../../packages/dsl/schema.js";
import { NormalizedTextSpan, ParsedTransaction, StatementParseResult } from "../../../../packages/dsl/types.js";

/**
 * Ephemeral document stored exclusively in transient React state.
 * INVARIANT: Must NEVER be written to IndexedDB, localStorage, or external services.
 */
export interface StudioDocument {
  id: string;
  name: string;
  fileType: "pdf" | "csv";
  /** Raw binary data for PDF or string content for CSV */
  data: Uint8Array | string;
  totalPages: number;
  currentPage: number;
  /** Normalized spans partitioned by page (1-indexed) */
  spansByPage: Record<number, NormalizedTextSpan[]>;
  /** CSV raw rows if fileType is 'csv' */
  csvRows?: string[][];
  /** Whether this is a bundled sample or a user-uploaded file */
  isSample: boolean;
  uploadedAt: number;
}

/**
 * Visual column representation on the interactive canvas.
 */
export interface VisualColumn {
  id: string;
  name: string;
  xStart: number; // 0..1000 normalized
  xEnd: number;   // 0..1000 normalized
  color: string;  // Visual theme accent color
  columnIndex?: number; // For CSV mode
}

/**
 * Dragging state on the interactive SVG canvas.
 */
export interface CanvasDragState {
  type: "topMargin" | "bottomMargin" | "colStart" | "colEnd" | "colMove" | null;
  columnId?: string;
  initialX?: number;
  initialY?: number;
  initialVal?: number;
  initialXStart?: number;
  initialXEnd?: number;
}

/**
 * Result of the mathematical parity verification across statement pages.
 * Invariant: OpeningBalance + Sum(Credits) - Sum(Debits) == ClosingBalance
 */
export interface MathematicalReconciliation {
  openingBalanceMinorUnits: bigint | null;
  closingBalanceMinorUnits: bigint | null;
  totalCreditsMinorUnits: bigint;
  totalDebitsMinorUnits: bigint;
  netMutationMinorUnits: bigint;
  calculatedClosingBalanceMinorUnits: bigint | null;
  discrepancyMinorUnits: bigint;
  isBalanced: boolean;
  creditCount: number;
  debitCount: number;
  totalTransactions: number;
  /** Indices of rows where consecutive running balance equation failed */
  unbalancedRowIndices: number[];
  /** Indices of rows where date could not be parsed */
  malformedDateRowIndices: number[];
  /** Indices of rows where balance is missing when required */
  missingBalanceRowIndices: number[];
}

/**
 * Configuration options for PII sanitization.
 */
export interface SanitizationRuleConfig {
  /** Replace 8-16 digit account numbers with randomized digits */
  maskAccountNumbers: boolean;
  /** Anonymize customer names and addresses in metadata headers */
  anonymizeCustomerNames: boolean;
  /** Obfuscate narrative remarks while preserving structural markers */
  obfuscateNarratives: boolean;
  /** Proportional scalar multiplier applied to amounts (e.g. 1.25) */
  amountScalar: number;
  /** Financial keywords that must remain un-redacted */
  preserveStructuralTokens: string[];
}

/**
 * Sanitized transaction record for fixture sharing.
 * Retains character counts, bounding-box geometry, and exact math balance.
 */
export interface SanitizedTransactionRecord {
  date: string;
  rawDate: string;
  description: string;
  debitMinorUnits: string; // Serialized string representation of bigint
  creditMinorUnits: string;
  amountMinorUnits: string;
  runningBalanceMinorUnits?: string | null;
  hash: string;
  sequenceIndex: number;
}

/**
 * Shareable sanitized extraction fixture.
 */
export interface SanitizedFixture {
  bankId: string;
  bankName: string;
  fileType: "pdf" | "csv";
  totalPages: number;
  totalTransactions: number;
  /** Sanitized text spans with preserved geometry */
  anonymizedTextSpans?: NormalizedTextSpan[];
  /** Sanitized CSV rows */
  anonymizedCsvRows?: string[][];
  /** Sanitized extracted transactions */
  sanitizedTransactions: SanitizedTransactionRecord[];
  /** Mathematical balance verification summary */
  reconciliation: {
    openingBalanceMinorUnits: string;
    totalCreditsMinorUnits: string;
    totalDebitsMinorUnits: string;
    closingBalanceMinorUnits: string;
    isBalanced: boolean;
  };
  /** Proof of sanitization parity */
  parityVerification: {
    characterCountPreserved: boolean;
    geometryPreserved: boolean;
    mathematicalParityPreserved: boolean;
  };
}

/**
 * Complete export bundle schema.
 */
export interface StudioExportBundle {
  version: string;
  generatedAt: string;
  config: StatementParserConfig;
  fixture: SanitizedFixture;
  /** Deterministic cryptographic signature (SHA-256 hex digest) */
  signature: string;
}

export type CanvasZoomLevel = "50%" | "75%" | "100%" | "125%" | "150%" | "fit";
