/**
 * Typed RPC Interfaces and Definitions for Statement Parser Web Worker
 */

import { StatementParserConfig } from "../../../../packages/dsl/schema.js";
import {
  NormalizedTextSpan,
  ParsedTransaction,
  StatementParseResult,
} from "../../../../packages/dsl/types.js";

export interface ParseWorkerOptions {
  accountId: string;
  config: StatementParserConfig;
  password?: string;
  onPasswordRequest?: () => Promise<string>;
  onProgress?: (progress: { currentPage: number; totalPages: number }) => void;
  deadlineMsPerPage?: number;
}

export interface InspectDocumentOptions {
  password?: string;
}

export interface DocumentInspectionResult {
  fileType: "pdf" | "csv";
  sampleText: string;
  firstPageSpans: NormalizedTextSpan[];
  totalPages: number;
  isPasswordProtected: boolean;
  isScanned: boolean;
  csvRows?: string[][];
  errorCode?: string;
  errorMessage?: string;
}

export interface StatementParserWorkerAPI {
  /**
   * Parses a PDF statement buffer in the sandboxed worker.
   */
  parsePdf(
    fileBuffer: Uint8Array | ArrayBuffer,
    options: ParseWorkerOptions
  ): Promise<StatementParseResult>;

  /**
   * Parses CSV statement content in the sandboxed worker using streaming PapaParse.
   */
  parseCsv(
    csvContent: string | Uint8Array | ArrayBuffer,
    options: ParseWorkerOptions
  ): Promise<StatementParseResult>;

  /**
   * Inspects a document to extract first page spans, text signatures, and detect password / scanned status.
   */
  inspectDocument(
    fileData: Uint8Array | ArrayBuffer | string,
    fileType: "pdf" | "csv",
    options?: InspectDocumentOptions
  ): Promise<DocumentInspectionResult>;

  /**
   * Identifies the best matching StatementParserConfig from a document text sample.
   */
  identifyConfig(
    sampleText: string,
    configs: StatementParserConfig[]
  ): StatementParserConfig | null;

  /**
   * Extracts normalized text spans for a specific page of a PDF document.
   */
  extractPageSpans(
    fileData: Uint8Array | ArrayBuffer | string,
    pageNum: number,
    options?: { password?: string }
  ): Promise<NormalizedTextSpan[]>;

  /**
   * Health check / liveness probe for the worker.
   */
  ping(): Promise<string>;
}

export type {
  NormalizedTextSpan,
  ParsedTransaction,
  StatementParseResult,
  StatementParserConfig,
};

