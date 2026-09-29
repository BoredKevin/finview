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
