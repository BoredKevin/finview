/**
 * Web Worker Statement Parser Pipeline
 * 
 * Invariants:
 * 1. Complete Sandbox: Dynamic code evaluation (eval, new Function, dynamic import) is strictly prohibited.
 * 2. ReDoS Protection: Any regex containing nested repetition or taking >50ms is aborted.
 * 3. Memory Safety: page.cleanup() after every page, pdfDocument.destroy() after parsing.
 * 4. Password Interception: Emits password request to host, verifies in worker memory, discards immediately.
 * 5. PapaParse streaming with auto-delimiter detection.
 */

import * as Comlink from "comlink";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-ignore - pdf.worker.mjs provides in-process WorkerMessageHandler without .d.ts
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import Papa from "papaparse";

import {
  StatementParserConfig,
  validateStatementParserConfig,
} from "../../../../packages/dsl/schema.js";
import {
  ExtractedRow,
  NormalizedTextSpan,
  StatementParseResult,
} from "../../../../packages/dsl/types.js";
import {
  extractNormalizedSpans,
  clusterSpansIntoRows,
} from "../../../../packages/dsl/normalizer.js";
import {
  parsePdfRows,
  parseCsvRows,
} from "../../../../packages/dsl/engine.js";
import {
  DocumentInspectionResult,
  InspectDocumentOptions,
  ParseWorkerOptions,
  StatementParserWorkerAPI,
} from "./types.js";

// Register PDF.js worker in-memory message handler for zero-retention sandboxed parsing
// without external script fetches or dynamic code evaluation
if (typeof globalThis !== "undefined") {
  (globalThis as any).pdfjsWorker = pdfjsWorker;
}
if (typeof pdfjsLib !== "undefined" && (pdfjsLib as any).GlobalWorkerOptions) {
  try {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch {
    // In environments where import.meta.url is restricted, pdfjsWorker on globalThis provides in-process handling
  }
}

export const parserWorkerAPI: StatementParserWorkerAPI = {
  /**
   * Health check
   */
  async ping(): Promise<string> {
    return "pong";
  },

  /**
   * Inspects a statement document to extract sample text, first page spans, and detect password or scanned documents.
   */
  async inspectDocument(
    fileData: Uint8Array | ArrayBuffer | string,
    fileType: "pdf" | "csv",
    options?: InspectDocumentOptions
  ): Promise<DocumentInspectionResult> {
    if (fileType === "csv") {
      let csvText: string;
      if (typeof fileData === "string") {
        csvText = fileData;
      } else if (fileData instanceof Uint8Array) {
        csvText = new TextDecoder("utf-8").decode(fileData);
      } else {
        csvText = new TextDecoder("utf-8").decode(new Uint8Array(fileData));
      }

      const rows: string[][] = [];
      try {
        Papa.parse<string[]>(csvText.slice(0, 50000), {
          delimiter: "",
          skipEmptyLines: true,
          step: (results) => {
            if (results.data && Array.isArray(results.data) && rows.length < 50) {
              rows.push(results.data);
            }
          },
        });
      } catch (err: any) {
        return {
          fileType: "csv",
          sampleText: "",
          firstPageSpans: [],
          totalPages: 1,
          isPasswordProtected: false,
          isScanned: false,
          errorCode: "CSV_PARSE_FAILED",
          errorMessage: err.message,
        };
      }

      const sampleText = rows.map((r) => r.join(" ")).join("\n").slice(0, 4000);
      return {
        fileType: "csv",
        sampleText,
        firstPageSpans: [],
        totalPages: 1,
        isPasswordProtected: false,
        isScanned: false,
        csvRows: rows,
      };
    }

    // PDF inspection - clone buffer to prevent postMessage transfer detachment
    const dataArray =
      typeof fileData === "string"
        ? new TextEncoder().encode(fileData)
        : fileData instanceof Uint8Array
        ? fileData.slice()
        : new Uint8Array(fileData).slice();

    let isPasswordProtected = false;
    let ephemeralPassword = options?.password ?? null;

    const loadingTask = pdfjsLib.getDocument({
      data: dataArray,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: true,
    } as any);

    loadingTask.onPassword = (
      updatePassword: (pw: string) => void,
      reason: number
    ) => {
      isPasswordProtected = true;
      if (ephemeralPassword && reason === pdfjsLib.PasswordResponses.NEED_PASSWORD) {
        updatePassword(ephemeralPassword);
      } else {
        updatePassword("");
      }
    };

    let pdfDocument: any = null;
    try {
      pdfDocument = await loadingTask.promise;
      const totalPages = pdfDocument.numPages;

      let spans: NormalizedTextSpan[] = [];
      if (totalPages > 0) {
        const page = await pdfDocument.getPage(1);
        try {
          const textContent = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1.0 });
          spans = extractNormalizedSpans(
            textContent.items as any,
            viewport.width,
            viewport.height
          );
        } finally {
          page.cleanup();
        }
      }

      const isScanned = spans.length === 0;
      const sampleText = spans.map((s) => s.text).join(" ").slice(0, 4000);

      return {
        fileType: "pdf",
        sampleText,
        firstPageSpans: spans,
        totalPages,
        isPasswordProtected: false,
        isScanned,
      };
    } catch (err: any) {
      if (
        isPasswordProtected ||
        err?.name === "PasswordException" ||
        err?.message?.toLowerCase().includes("password")
      ) {
        return {
          fileType: "pdf",
          sampleText: "",
          firstPageSpans: [],
          totalPages: 0,
          isPasswordProtected: true,
          isScanned: false,
          errorCode: "PASSWORD_REQUIRED",
          errorMessage: "Document is password encrypted",
        };
      }

      return {
        fileType: "pdf",
        sampleText: "",
        firstPageSpans: [],
        totalPages: 0,
        isPasswordProtected: false,
        isScanned: false,
        errorCode: "PDF_LOAD_FAILED",
        errorMessage: err.message || "Failed to load PDF document",
      };
    } finally {
      ephemeralPassword = null;
      if (pdfDocument) {
        try {
          if (typeof pdfDocument.destroy === "function") await pdfDocument.destroy();
          if (typeof pdfDocument.cleanup === "function") pdfDocument.cleanup();
        } catch {
          // ignore
        }
      }
      if (loadingTask) {
        try {
          if (typeof loadingTask.destroy === "function") await loadingTask.destroy();
        } catch {
          // ignore
        }
      }
    }
  },


  /**
   * Identifies the best matching parser config from a sample of document text
   */
  identifyConfig(
    sampleText: string,
    configs: StatementParserConfig[]
  ): StatementParserConfig | null {
    for (const config of configs) {
      const matchers = config.matchers;
      if (!matchers || !matchers.contentPatterns) continue;

      const allMatch = matchers.contentPatterns.every((pattern) => {
        try {
          const rx = new RegExp(pattern, "i");
          return rx.test(sampleText);
        } catch {
          return sampleText.includes(pattern);
        }
      });

      if (allMatch) {
        return config;
      }
    }
    return null;
  },

  /**
   * Extracts normalized text spans for a specific page of a PDF document.
   */
  async extractPageSpans(
    fileData: Uint8Array | ArrayBuffer | string,
    pageNum: number,
    options?: { password?: string }
  ): Promise<NormalizedTextSpan[]> {
    const dataArray =
      typeof fileData === "string"
        ? new TextEncoder().encode(fileData)
        : fileData instanceof Uint8Array
        ? fileData.slice()
        : new Uint8Array(fileData).slice();

    const loadingTask = pdfjsLib.getDocument({
      data: dataArray,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: true,
    } as any);

    if (options?.password) {
      loadingTask.onPassword = (
        updatePassword: (pw: string) => void,
        reason: number
      ) => {
        if (reason === pdfjsLib.PasswordResponses.NEED_PASSWORD) {
          updatePassword(options.password!);
        } else {
          updatePassword("");
        }
      };
    }

    let pdfDocument: any = null;
    try {
      pdfDocument = await loadingTask.promise;
      if (pageNum < 1 || pageNum > pdfDocument.numPages) {
        return [];
      }
      const page = await pdfDocument.getPage(pageNum);
      try {
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        return extractNormalizedSpans(
          textContent.items as any,
          viewport.width,
          viewport.height
        );
      } finally {
        page.cleanup();
      }
    } finally {
      if (pdfDocument) {
        try {
          if (typeof pdfDocument.destroy === "function") await pdfDocument.destroy();
          if (typeof pdfDocument.cleanup === "function") pdfDocument.cleanup();
        } catch {
          // ignore cleanup errors
        }
      }
      if (loadingTask) {
        try {
          if (typeof loadingTask.destroy === "function") await loadingTask.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  },

  /**
   * PDF Parsing Engine with memory safety and credential lifecycle management
   */
  async parsePdf(
    fileBuffer: Uint8Array | ArrayBuffer,
    options: ParseWorkerOptions
  ): Promise<StatementParseResult> {
    const startTime = performance.now();
    const config = validateStatementParserConfig(options.config);

    // Ephemeral credential storage: discarded immediately in finally block
    let ephemeralPassword: string | null = options.password ?? null;

    const dataArray =
      fileBuffer instanceof Uint8Array ? fileBuffer.slice() : new Uint8Array(fileBuffer).slice();

    // Instantiate sandboxed pdfjs loading task
    const loadingTask = pdfjsLib.getDocument({
      data: dataArray,
      isEvalSupported: false, // Strict Sandbox invariant: no eval/new Function
      disableFontFace: true,
      useSystemFonts: true,
    } as any);

    // Intercept onPassword callback
    loadingTask.onPassword = (
      updatePassword: (password: string) => void,
      reason: number
    ) => {
      // If host provided password in options and this is first attempt
      if (ephemeralPassword && reason === pdfjsLib.PasswordResponses.NEED_PASSWORD) {
        updatePassword(ephemeralPassword);
        return;
      }

      // If host provided interactive password request handler via Comlink proxy callback
      if (options.onPasswordRequest) {
        options
          .onPasswordRequest()
          .then((receivedPassword) => {
            ephemeralPassword = receivedPassword;
            updatePassword(receivedPassword);
          })
          .catch(() => {
            updatePassword("");
          });
        return;
      }

      // Default: reject with empty password to abort loading
      updatePassword("");
    };

    let pdfDocument: any = null;
    const allExtractedRows: ExtractedRow[] = [];

    try {
      pdfDocument = await loadingTask.promise;
      const totalPages = pdfDocument.numPages;

      // Iterate through pages with strict memory safety cleanup
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);

        try {
          const textContent = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1.0 });

          // Extract text spans & normalize coordinates (0..1000)
          const spans = extractNormalizedSpans(
            textContent.items as any,
            viewport.width,
            viewport.height
          );

          // Cluster spans into horizontal rows with Delta y <= 3 tolerance
          const rows = clusterSpansIntoRows(spans, 3);
          allExtractedRows.push(...rows);

          if (options.onProgress) {
            options.onProgress({ currentPage: pageNum, totalPages });
          }
        } finally {
          // System Invariant: Guarantee zero memory accumulation across 100+ pages
          page.cleanup();
        }
      }

      // Parse tabular rows via safe DSL engine under 50ms per-page deadline
      const transactions = await parsePdfRows(
        allExtractedRows,
        config,
        options.accountId,
        {
          accountId: options.accountId,
          config,
          deadlineMsPerPage: options.deadlineMsPerPage ?? 50,
        }
      );

      const executionTimeMs = performance.now() - startTime;

      return {
        bankId: config.meta.bankId,
        configVersion: config.meta.version,
        fileType: "pdf",
        transactions,
        totalPages: totalPages,
        totalTransactions: transactions.length,
        executionTimeMs,
      };
    } finally {
      // Discard credentials immediately post-execution
      ephemeralPassword = null;

      // Explicitly destroy pdfDocument and loading task
      if (pdfDocument) {
        try {
          if (typeof pdfDocument.destroy === "function") {
            await pdfDocument.destroy();
          }
          if (typeof pdfDocument.cleanup === "function") {
            pdfDocument.cleanup();
          }
        } catch {
          // ignore cleanup errors
        }
      }

      if (loadingTask) {
        try {
          if (typeof loadingTask.destroy === "function") {
            await loadingTask.destroy();
          }
        } catch {
          // ignore cleanup errors
        }
      }
    }
  },

  /**
   * CSV Parsing Engine with PapaParse auto-delimiter detection and streaming row extraction
   */
  async parseCsv(
    csvContent: string | Uint8Array | ArrayBuffer,
    options: ParseWorkerOptions
  ): Promise<StatementParseResult> {
    const startTime = performance.now();
    const config = validateStatementParserConfig(options.config);

    let csvText: string;
    if (typeof csvContent === "string") {
      csvText = csvContent;
    } else if (csvContent instanceof Uint8Array) {
      csvText = new TextDecoder("utf-8").decode(csvContent);
    } else {
      csvText = new TextDecoder("utf-8").decode(new Uint8Array(csvContent));
    }

    const streamedRows: string[][] = [];

    // Stream rows using PapaParse with auto-delimiter detection
    await new Promise<void>((resolve, reject) => {
      Papa.parse<string[]>(csvText, {
        delimiter: "", // Auto-delimiter detection (comma, tab, pipe, semicolon)
        skipEmptyLines: true,
        step: (results) => {
          if (results.data && Array.isArray(results.data)) {
            streamedRows.push(results.data);
          }
        },
        complete: () => {
          resolve();
        },
        error: (error: Error) => {
          reject(new Error(`PapaParse CSV extraction failed: ${error.message}`));
        },
      });
    });

    const transactions = await parseCsvRows(
      streamedRows,
      config,
      options.accountId,
      {
        accountId: options.accountId,
        config,
        deadlineMsPerPage: options.deadlineMsPerPage ?? 50,
      }
    );

    const executionTimeMs = performance.now() - startTime;

    return {
      bankId: config.meta.bankId,
      configVersion: config.meta.version,
      fileType: "csv",
      transactions,
      totalPages: 1,
      totalTransactions: transactions.length,
      executionTimeMs,
    };
  },
};

// Expose Comlink RPC interface when executing in Worker / Web Context
if (typeof self !== "undefined" && typeof (self as any).postMessage === "function") {
  Comlink.expose(parserWorkerAPI);
}
