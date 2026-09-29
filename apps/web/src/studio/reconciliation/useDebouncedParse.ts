/**
 * useDebouncedParse Hook
 * 
 * Invariant Requirement 3:
 * "Debounced Worker Execution: Re-parse the active document on every
 * configuration change via the Web Worker (150ms debounce)."
 */

import { useState, useEffect, useRef } from "react";
import { StatementParserConfig } from "../../../../../packages/dsl/schema.js";
import { StatementParseResult } from "../../../../../packages/dsl/types.js";
import { parserWorkerAPI } from "../../workers/parser.worker.js";
import { StudioDocument, MathematicalReconciliation } from "../types.js";
import { verifyLedgerParity } from "./ReconciliationEngine.js";

export interface DebouncedParseState {
  result: StatementParseResult | null;
  reconciliation: MathematicalReconciliation | null;
  isParsing: boolean;
  error: string | null;
  lastParsedAt: number | null;
  executionTimeMs: number;
}

export function useDebouncedParse(
  document: StudioDocument | null,
  config: StatementParserConfig | null,
  debounceMs = 150
): DebouncedParseState {
  const [state, setState] = useState<DebouncedParseState>({
    result: null,
    reconciliation: null,
    isParsing: false,
    error: null,
    lastParsedAt: null,
    executionTimeMs: 0,
  });

  const abortControllerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!document || !config) {
      setState({
        result: null,
        reconciliation: null,
        isParsing: false,
        error: null,
        lastParsedAt: null,
        executionTimeMs: 0,
      });
      return;
    }

    if (abortControllerRef.current !== null) {
      window.clearTimeout(abortControllerRef.current);
    }

    setState((prev) => ({ ...prev, isParsing: true, error: null }));

    abortControllerRef.current = window.setTimeout(async () => {
      const startTime = performance.now();
      try {
        let parseResult: StatementParseResult;

        if (document.fileType === "pdf") {
          const currentPageSpans = document.spansByPage[document.currentPage] || [];
          if (currentPageSpans.length > 0) {
            // Instantaneous clustering from in-memory spans
            const { clusterSpansIntoRows } = await import("../../../../../packages/dsl/normalizer.js");
            const { parsePdfRows } = await import("../../../../../packages/dsl/engine.js");
            const rows = clusterSpansIntoRows(currentPageSpans);
            const transactions = await parsePdfRows(rows, config, "studio-preview-account");
            parseResult = {
              bankId: config.meta.bankId,
              configVersion: config.meta.version,
              fileType: "pdf",
              transactions,
              totalPages: document.totalPages,
              totalTransactions: transactions.length,
              executionTimeMs: 0,
            };
          } else {
            const buffer =
              typeof document.data === "string"
                ? new TextEncoder().encode(document.data)
                : document.data;

            parseResult = await parserWorkerAPI.parsePdf(buffer, {
              accountId: "studio-preview-account",
              config,
              deadlineMsPerPage: 100,
            });
          }
        } else {
          parseResult = await parserWorkerAPI.parseCsv(document.data, {
            accountId: "studio-preview-account",
            config,
          });
        }

        const reconciliation = verifyLedgerParity(parseResult.transactions, config);
        const elapsed = performance.now() - startTime;

        setState({
          result: parseResult,
          reconciliation,
          isParsing: false,
          error: null,
          lastParsedAt: Date.now(),
          executionTimeMs: Math.round(elapsed),
        });
      } catch (err: any) {
        setState({
          result: null,
          reconciliation: null,
          isParsing: false,
          error: err?.message || "Parsing execution failed",
          lastParsedAt: Date.now(),
          executionTimeMs: Math.round(performance.now() - startTime),
        });
      }
    }, debounceMs);

    return () => {
      if (abortControllerRef.current !== null) {
        window.clearTimeout(abortControllerRef.current);
      }
    };
  }, [document, config, debounceMs]);

  return state;
}
