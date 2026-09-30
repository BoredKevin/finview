/**
 * Financial Analytics Web Worker
 * 
 * Offloads compute-heavy aggregation and recurring pattern detection
 * away from the main thread for ledgers exceeding 10,000 transactions.
 * 
 * System Invariant 2: UI Responsiveness
 * The main thread is never blocked during analytics computation.
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

export interface AnalyticsWorkerPayload {
  accounts: Account[];
  transactions: Transaction[];
  range: DateRange;
  primaryCurrency?: string;
}

export interface AnalyticsWorkerResult {
  metrics: FinancialMetrics;
  cashFlow: CashFlowPoint[];
  recurring: RecurringPattern[];
  executionTimeMs: number;
}

export const analyticsWorkerAPI = {
  aggregate(payload: AnalyticsWorkerPayload): AnalyticsWorkerResult {
    const startTime = performance.now();

    const metrics = computeFinancialMetrics(
      payload.accounts,
      payload.transactions,
      payload.range,
      payload.primaryCurrency || "IDR"
    );

    const cashFlow = computeCashFlowProgression(
      payload.transactions,
      payload.range
    );

    const recurring = detectRecurringTransactions(payload.transactions);

    const executionTimeMs = performance.now() - startTime;

    return {
      metrics,
      cashFlow,
      recurring,
      executionTimeMs,
    };
  },
};

// Expose via Comlink if worker context
if (typeof self !== "undefined" && typeof (self as any).postMessage === "function") {
  Comlink.expose(analyticsWorkerAPI);
}
