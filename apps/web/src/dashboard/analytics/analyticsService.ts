/**
 * Analytics Orchestration Service
 * 
 * Enforces System Invariant 2 (UI Responsiveness):
 * Automatically delegates aggregation passes to analytics.worker.ts
 * whenever the active transaction volume exceeds 10,000 records.
 */

import * as Comlink from "comlink";
import { Account, Transaction } from "../../db/types.js";
import { DateRange } from "../utils/date.js";
import {
  computeFinancialMetrics,
  computeCashFlowProgression,
  FinancialMetrics,
  CashFlowPoint,
} from "./analyticsEngine.js";
import { detectRecurringTransactions, RecurringPattern } from "./recurringEngine.js";
import { analyticsWorkerAPI, AnalyticsWorkerResult } from "./analytics.worker.js";

export const HIGH_VOLUME_THRESHOLD = 10000;

let workerClient: Comlink.Remote<typeof analyticsWorkerAPI> | null = null;

function getAnalyticsWorkerClient(): Comlink.Remote<typeof analyticsWorkerAPI> | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }

  if (!workerClient) {
    try {
      const worker = new Worker(new URL("./analytics.worker.js", import.meta.url), {
        type: "module",
      });
      workerClient = Comlink.wrap<typeof analyticsWorkerAPI>(worker);
    } catch (err) {
      console.warn("Failed to instantiate analytics web worker, falling back to main thread:", err);
      return null;
    }
  }

  return workerClient;
}

export interface AnalyticsAggregateOutput {
  metrics: FinancialMetrics;
  cashFlow: CashFlowPoint[];
  recurring: RecurringPattern[];
  delegatedToWorker: boolean;
  executionTimeMs: number;
}

/**
 * Executes financial analytics aggregation.
 * If transactions.length > 10,000, delegates to worker to prevent main thread frame drops.
 */
export async function runAnalyticsAggregation(
  accounts: Account[],
  transactions: Transaction[],
  range: DateRange,
  primaryCurrency = "IDR",
  forceWorker = false
): Promise<AnalyticsAggregateOutput> {
  const shouldDelegate = forceWorker || transactions.length > HIGH_VOLUME_THRESHOLD;

  if (shouldDelegate) {
    const remote = getAnalyticsWorkerClient();
    if (remote) {
      try {
        const result = await remote.aggregate({
          accounts,
          transactions,
          range,
          primaryCurrency,
        });

        return {
          ...result,
          delegatedToWorker: true,
        };
      } catch (err) {
        console.warn("Worker delegation failed, executing synchronous fallback:", err);
      }
    }
  }

  // Fast client-side synchronous pass (<15ms)
  const startTime = performance.now();
  const metrics = computeFinancialMetrics(accounts, transactions, range, primaryCurrency);
  const cashFlow = computeCashFlowProgression(transactions, range);
  const recurring = detectRecurringTransactions(transactions);
  const executionTimeMs = performance.now() - startTime;

  return {
    metrics,
    cashFlow,
    recurring,
    delegatedToWorker: false,
    executionTimeMs,
  };
}
