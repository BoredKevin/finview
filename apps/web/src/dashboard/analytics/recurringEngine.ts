/**
 * Recurring Transaction & Subscription Identification Engine
 * 
 * Detects periodic patterns (monthly bills, streaming subscriptions, utility payments)
 * using client-side statistical analysis and description clustering.
 */

import { Transaction } from "../../db/types.js";

export type RecurringFrequency = "weekly" | "bi-weekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringPattern {
  id: string;
  merchantName: string;
  rawSampleDescription: string;
  frequency: RecurringFrequency;
  averageAmountMinorUnits: bigint;
  currency?: string;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  predictedNextDate: string;
  isSubscription: boolean; // Flagged if fixed recurring expense
  confidence: number; // 0..100
}

/**
 * Normalizes transaction narrative into clean merchant/counterparty name.
 * Strips dates, reference codes, card suffixes, and punctuation.
 */
export function normalizeMerchantDescription(description: string): string {
  if (!description) return "UNKNOWN";

  let cleaned = description.toUpperCase().trim();

  // Remove common banking transaction prefix markers
  cleaned = cleaned.replace(/^(TRANSFER\s+(KE|DARI|KEPADA)|BIF\s+TRSF\s+(DR|KE)|DB|CR|QRIS|ATM\s+TARIK|AUTO\s+DEBIT)\s+/i, "");

  // Strip dates (DD/MM, DD/MM/YYYY, YYYY-MM-DD)
  cleaned = cleaned.replace(/\b\d{1,2}[\/\.-]\d{1,2}([\/\.-]\d{2,4})?\b/g, "");
  cleaned = cleaned.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");

  // Strip phone numbers or account numbers / invoice refs
  cleaned = cleaned.replace(/\b\d{6,}\b/g, "");
  cleaned = cleaned.replace(/#\w+/g, "");

  // Collapse extra spaces & strip non-alphanumeric except period and dash
  cleaned = cleaned.replace(/[^A-Z0-9\s\.\-]/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned.slice(0, 40) || description.slice(0, 40);
}

/**
 * Determines frequency from average intervals between consecutive events in days.
 */
function determineFrequency(avgDays: number): RecurringFrequency {
  if (avgDays >= 5 && avgDays <= 9) return "weekly";
  if (avgDays >= 10 && avgDays <= 18) return "bi-weekly";
  if (avgDays >= 25 && avgDays <= 38) return "monthly";
  if (avgDays >= 75 && avgDays <= 105) return "quarterly";
  return "yearly";
}

/**
 * Known subscription merchant keywords
 */
const SUBSCRIPTION_KEYWORDS = [
  "NETFLIX",
  "SPOTIFY",
  "YOUTUBE",
  "APPLE",
  "GOOGLE",
  "ICLOUD",
  "AMAZON",
  "PRIME",
  "DISNEY",
  "GITHUB",
  "OPENAI",
  "CHATGPT",
  "HEROKU",
  "VERCEL",
  "AWS",
  "SUBSCRIPTION",
  "MEMBERSHIP",
  "GYM",
  "FITNESS",
  "PLN",
  "TELKOM",
  "INDIHOME",
  "BIZNET",
];

/**
 * Identify recurring transactions and subscriptions across the transaction history.
 */
export function detectRecurringTransactions(
  transactions: Transaction[],
  minOccurrences = 2
): RecurringPattern[] {
  const active = transactions.filter((tx) => tx.deletedAt === null && tx.date);

  // Group by normalized merchant
  const groups = new Map<string, Transaction[]>();

  for (const tx of active) {
    const merchant = normalizeMerchantDescription(tx.description);
    if (!merchant || merchant.length < 3) continue;

    const list = groups.get(merchant) || [];
    list.push(tx);
    groups.set(merchant, list);
  }

  const recurring: RecurringPattern[] = [];

  for (const [merchant, txs] of groups.entries()) {
    if (txs.length < minOccurrences) continue;

    // Sort chronologically ascending
    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate intervals in days
    const intervals: number[] = [];
    for (let i = 1; i < txs.length; i++) {
      const t1 = new Date(txs[i - 1].date).getTime();
      const t2 = new Date(txs[i].date).getTime();
      const diffDays = Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        intervals.push(diffDays);
      }
    }

    if (intervals.length === 0) continue;

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Reject erratic intervals (e.g. daily grocery shopping or randomly spaced events)
    if (avgInterval < 5 || avgInterval > 400) continue;

    // Calculate interval variance
    const variance =
      intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) /
      intervals.length;
    const stdDev = Math.sqrt(variance);

    // Confidence decreases with interval variation
    const intervalScore = Math.max(0, 100 - (stdDev / avgInterval) * 80);

    // Calculate average amount
    const amounts = txs.map((t) => BigInt(t.amountMinorUnits ?? 0n));
    const totalAmount = amounts.reduce((a, b) => a + b, 0n);
    const avgAmount = totalAmount / BigInt(amounts.length);

    // Amount consistency score (100 if all amounts are identical)
    const identicalCount = amounts.filter((a) => a === amounts[0]).length;
    const amountScore = (identicalCount / amounts.length) * 100;

    const frequency = determineFrequency(avgInterval);

    // Overall confidence
    const confidence = Math.round(intervalScore * 0.6 + amountScore * 0.4);

    // Only accept patterns with confidence >= 50%
    if (confidence < 50) continue;

    const lastTx = txs[txs.length - 1];
    const firstTx = txs[0];

    // Predict next date: last date + avgInterval
    const lastDateObj = new Date(lastTx.date);
    lastDateObj.setDate(lastDateObj.getDate() + Math.round(avgInterval));
    const predictedNextDate = lastDateObj.toISOString().split("T")[0];

    // Flag subscription if: amount is expense (<0), high amount consistency, or matches known keyword
    const isKeywordMatch = SUBSCRIPTION_KEYWORDS.some((kw) => merchant.includes(kw));
    const isFixedExpense = avgAmount < 0n && amountScore >= 80;
    const isSubscription = isKeywordMatch || (isFixedExpense && frequency === "monthly");

    recurring.push({
      id: `rec_${merchant.replace(/\s+/g, "_").toLowerCase()}`,
      merchantName: merchant,
      rawSampleDescription: lastTx.description,
      frequency,
      averageAmountMinorUnits: avgAmount,
      occurrences: txs.length,
      firstDate: firstTx.date,
      lastDate: lastTx.date,
      predictedNextDate,
      isSubscription,
      confidence,
    });
  }

  // Sort by occurrences descending, then confidence descending
  return recurring.sort((a, b) => b.occurrences - a.occurrences || b.confidence - a.confidence);
}
