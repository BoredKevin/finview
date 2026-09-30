/**
 * Reactive Dashboard Analytics Hook
 * 
 * Uses `dexie-react-hooks` (`useLiveQuery`) to reactively update
 * financial metrics and cash flow as Dexie tables mutate.
 */

import { useState, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDatabase } from "../../db/database.js";
import { Account, Transaction } from "../../db/types.js";
import { DateRange } from "../utils/date.js";
import {
  FinancialMetrics,
  CashFlowPoint,
} from "./analyticsEngine.js";
import { RecurringPattern } from "./recurringEngine.js";
import { runAnalyticsAggregation } from "./analyticsService.js";

export interface UseDashboardAnalyticsResult {
  accounts: Account[];
  transactions: Transaction[];
  metrics: FinancialMetrics | null;
  cashFlow: CashFlowPoint[];
  recurring: RecurringPattern[];
  isLoading: boolean;
  delegatedToWorker: boolean;
  executionTimeMs: number;
  totalTransactionCount: number;
}

export function useDashboardAnalytics(
  range: DateRange = "30D",
  primaryCurrency = "IDR",
  accountIdFilter?: string
): UseDashboardAnalyticsResult {
  const db = useMemo(() => getDatabase(), []);

  // Reactive Dexie queries
  const liveAccounts = useLiveQuery(
    () => db.accounts.filter((a) => a.deletedAt === null).toArray(),
    [db]
  );

  const liveTransactions = useLiveQuery(
    () => {
      let query = db.transactions.filter((t) => t.deletedAt === null);
      if (accountIdFilter) {
        query = db.transactions.where("accountId").equals(accountIdFilter).filter((t) => t.deletedAt === null);
      }
      return query.toArray();
    },
    [db, accountIdFilter]
  );

  const accounts = useMemo(() => liveAccounts ?? [], [liveAccounts]);
  const transactions = useMemo(() => liveTransactions ?? [], [liveTransactions]);

  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowPoint[]>([]);
  const [recurring, setRecurring] = useState<RecurringPattern[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [delegatedToWorker, setDelegatedToWorker] = useState<boolean>(false);
  const [executionTimeMs, setExecutionTimeMs] = useState<number>(0);

  useEffect(() => {
    let isCancelled = false;

    async function executeAggregation() {
      setIsLoading(true);
      try {
        const result = await runAnalyticsAggregation(
          accounts,
          transactions,
          range,
          primaryCurrency
        );

        if (!isCancelled) {
          setMetrics(result.metrics);
          setCashFlow(result.cashFlow);
          setRecurring(result.recurring);
          setDelegatedToWorker(result.delegatedToWorker);
          setExecutionTimeMs(result.executionTimeMs);
        }
      } catch (err) {
        console.error("Dashboard analytics calculation failed:", err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    executeAggregation();

    return () => {
      isCancelled = true;
    };
  }, [accounts, transactions, range, primaryCurrency]);

  return {
    accounts,
    transactions,
    metrics,
    cashFlow,
    recurring,
    isLoading,
    delegatedToWorker,
    executionTimeMs,
    totalTransactionCount: transactions.length,
  };
}
