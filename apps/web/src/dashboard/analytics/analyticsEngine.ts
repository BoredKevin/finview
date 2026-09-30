/**
 * Local Financial Analytics Calculation Engine
 * 
 * Computes financial metrics strictly using integer minor units (bigint)
 * to guarantee zero floating-point arithmetic errors.
 * 
 * Invariant 1: Zero Data Egress (Computed client-side in RAM).
 * Invariant 2: UI Responsiveness (Fast local passes; delegates to worker when >10,000 txs).
 */

import { Account, Transaction } from "../../db/types.js";
import { DateRange, getStartDateForRange } from "../utils/date.js";

export interface CurrencyBalance {
  currency: string;
  totalMinorUnits: bigint;
  accountCount: number;
}

export interface FinancialMetrics {
  primaryCurrency: string;
  netWorthByCurrency: Record<string, bigint>;
  currencyBreakdown: CurrencyBalance[];
  inflowMinorUnits: bigint;
  outflowMinorUnits: bigint;
  netCashFlowMinorUnits: bigint;
  savingsRatePercentage: number;
  transactionCount: number;
  dateRange: DateRange;
}

export interface CashFlowPoint {
  date: string; // YYYY-MM-DD
  inflowMinorUnits: bigint;
  outflowMinorUnits: bigint;
  netMinorUnits: bigint;
  cumulativeMinorUnits: bigint;
}

/**
 * Filter transactions by date range and active status (deletedAt === null).
 */
export function filterTransactionsByRange(
  transactions: Transaction[],
  range: DateRange,
  referenceDate = new Date()
): Transaction[] {
  const startTimestamp = getStartDateForRange(range, referenceDate);

  return transactions.filter((tx) => {
    if (tx.deletedAt !== null) return false;
    if (!startTimestamp) return true;

    // tx.date is ISO "YYYY-MM-DD"
    const txTime = new Date(tx.date).getTime();
    return !isNaN(txTime) && txTime >= startTimestamp;
  });
}

/**
 * Compute core financial metrics from accounts and transactions.
 */
export function computeFinancialMetrics(
  accounts: Account[],
  transactions: Transaction[],
  range: DateRange,
  primaryCurrency = "IDR",
  referenceDate = new Date()
): FinancialMetrics {
  // 1. Account Balances & Net Worth Grouped by Currency
  const activeAccounts = accounts.filter((a) => a.deletedAt === null);
  const netWorthByCurrency: Record<string, bigint> = {};
  const accountCountByCurrency: Record<string, number> = {};

  for (const acc of activeAccounts) {
    const curr = (acc.currency || primaryCurrency).toUpperCase();
    const bal = BigInt(acc.balanceMinorUnits ?? 0n);

    netWorthByCurrency[curr] = (netWorthByCurrency[curr] || 0n) + bal;
    accountCountByCurrency[curr] = (accountCountByCurrency[curr] || 0) + 1;
  }

  const currencyBreakdown: CurrencyBalance[] = Object.keys(netWorthByCurrency).map(
    (currency) => ({
      currency,
      totalMinorUnits: netWorthByCurrency[currency],
      accountCount: accountCountByCurrency[currency] || 0,
    })
  );

  // 2. Inflow, Outflow, and Savings Rates over date range
  const filteredTx = filterTransactionsByRange(transactions, range, referenceDate);

  let inflowMinorUnits = 0n;
  let outflowMinorUnits = 0n;

  for (const tx of filteredTx) {
    const amt = BigInt(tx.amountMinorUnits ?? 0n);
    if (amt > 0n) {
      inflowMinorUnits += amt;
    } else if (amt < 0n) {
      outflowMinorUnits += -amt; // Outflow as positive magnitude
    }
  }

  const netCashFlowMinorUnits = inflowMinorUnits - outflowMinorUnits;

  // Savings rate = (Net Cash Flow / Inflow) * 100
  let savingsRatePercentage = 0;
  if (inflowMinorUnits > 0n) {
    // High precision calculation using bigint basis points (1/10000)
    const rateBps = (netCashFlowMinorUnits * 10000n) / inflowMinorUnits;
    savingsRatePercentage = Number(rateBps) / 100;
  }

  return {
    primaryCurrency,
    netWorthByCurrency,
    currencyBreakdown,
    inflowMinorUnits,
    outflowMinorUnits,
    netCashFlowMinorUnits,
    savingsRatePercentage,
    transactionCount: filteredTx.length,
    dateRange: range,
  };
}

/**
 * Compute running cash flow progression points over time for visualization.
 */
export function computeCashFlowProgression(
  transactions: Transaction[],
  range: DateRange,
  referenceDate = new Date()
): CashFlowPoint[] {
  const filtered = filterTransactionsByRange(transactions, range, referenceDate);

  if (filtered.length === 0) return [];

  // Group by date (YYYY-MM-DD)
  const dateMap = new Map<
    string,
    { inflow: bigint; outflow: bigint; net: bigint }
  >();

  for (const tx of filtered) {
    const d = tx.date || "Unknown";
    const existing = dateMap.get(d) || { inflow: 0n, outflow: 0n, net: 0n };

    const amt = BigInt(tx.amountMinorUnits ?? 0n);
    if (amt > 0n) {
      existing.inflow += amt;
    } else if (amt < 0n) {
      existing.outflow += -amt;
    }
    existing.net += amt;

    dateMap.set(d, existing);
  }

  // Sort dates chronologically ascending
  const sortedDates = Array.from(dateMap.keys()).sort();

  let cumulative = 0n;
  const points: CashFlowPoint[] = [];

  for (const d of sortedDates) {
    const data = dateMap.get(d)!;
    cumulative += data.net;

    points.push({
      date: d,
      inflowMinorUnits: data.inflow,
      outflowMinorUnits: data.outflow,
      netMinorUnits: data.net,
      cumulativeMinorUnits: cumulative,
    });
  }

  return points;
}
