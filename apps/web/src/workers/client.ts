/**
 * Comlink Worker RPC Client for Statement Parsing
 * 
 * Provides typed, ergonomic access to the parser web worker from the main thread.
 */

import * as Comlink from "comlink";
import {
  StatementParserWorkerAPI,
  ParseWorkerOptions,
  StatementParseResult,
  StatementParserConfig,
} from "./types.js";

/**
 * Creates a typed Comlink RPC client connected to parser.worker.ts.
 */
export function createParserWorkerClient(
  customWorker?: Worker
): Comlink.Remote<StatementParserWorkerAPI> {
  const worker =
    customWorker ??
    new Worker(new URL("./parser.worker.js", import.meta.url), {
      type: "module",
    });

  return Comlink.wrap<StatementParserWorkerAPI>(worker);
}

/**
 * High-level helper to parse a statement file with automatic config matching.
 */
export async function parseStatementFile(
  workerClient: Comlink.Remote<StatementParserWorkerAPI>,
  fileData: ArrayBuffer | Uint8Array | string,
  fileType: "pdf" | "csv",
  options: {
    accountId: string;
    config: StatementParserConfig;
    password?: string;
    onPasswordRequest?: () => Promise<string>;
    onProgress?: (progress: { currentPage: number; totalPages: number }) => void;
  }
): Promise<StatementParseResult> {
  // Wrap callbacks with Comlink.proxy if they cross thread boundaries
  const workerOptions: ParseWorkerOptions = {
    accountId: options.accountId,
    config: options.config,
    password: options.password,
    onPasswordRequest: options.onPasswordRequest
      ? Comlink.proxy(options.onPasswordRequest)
      : undefined,
    onProgress: options.onProgress
      ? Comlink.proxy(options.onProgress)
      : undefined,
  };

  if (fileType === "pdf") {
    const buffer =
      typeof fileData === "string"
        ? new TextEncoder().encode(fileData)
        : fileData;
    return await workerClient.parsePdf(buffer, workerOptions);
  } else {
    return await workerClient.parseCsv(fileData, workerOptions);
  }
}

/**
 * Inspects a statement file (PDF or CSV) to extract first page spans and check password/scanned state.
 */
export async function inspectStatementFile(
  workerClient: Comlink.Remote<StatementParserWorkerAPI>,
  fileData: ArrayBuffer | Uint8Array | string,
  fileType: "pdf" | "csv",
  options?: { password?: string }
) {
  const buffer =
    typeof fileData === "string"
      ? fileData
      : fileData instanceof Uint8Array
      ? fileData
      : new Uint8Array(fileData);
  return await workerClient.inspectDocument(buffer, fileType, options);
}

/**
 * Extracts page spans for a specific page of a statement file.
 */
export async function extractPageSpansFromFile(
  workerClient: Comlink.Remote<StatementParserWorkerAPI>,
  fileData: ArrayBuffer | Uint8Array | string,
  pageNum: number,
  options?: { password?: string }
) {
  const buffer =
    typeof fileData === "string"
      ? fileData
      : fileData instanceof Uint8Array
      ? fileData
      : new Uint8Array(fileData);
  return await workerClient.extractPageSpans(buffer, pageNum, options);
}

