/**
 * Typed RPC Interfaces and Definitions for Statement Parser Web Worker
 */

import { StatementParserConfig } from "../../../../packages/dsl/schema.js";
import { ParsedTransaction, StatementParseResult } from "../../../../packages/dsl/types.js";

export interface ParseWorkerOptions {
  accountId: string;
  config: StatementParserConfig;
  password?: string;
  onPasswordRequest?: () => Promise<string>;
  onProgress?: (progress: { currentPage: number; totalPages: number }) => void;
  deadlineMsPerPage?: number;
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
   * Identifies the best matching StatementParserConfig from a document text sample.
   */
  identifyConfig(
    sampleText: string,
    configs: StatementParserConfig[]
  ): StatementParserConfig | null;

  /**
   * Health check / liveness probe for the worker.
   */
  ping(): Promise<string>;
}

export type { ParsedTransaction, StatementParseResult, StatementParserConfig };
