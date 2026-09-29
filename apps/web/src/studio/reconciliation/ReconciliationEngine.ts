/**
 * Mathematical Verification & Reconciliation Engine
 * 
 * Verifies statement ledger consistency across pages:
 * OpeningBalance + Sum(Credits) - Sum(Debits) == ClosingBalance
 * 
 * Tracks row-level continuity errors, malformed dates, and missing balances.
 */

import { ParsedTransaction } from "../../../../../packages/dsl/types.js";
import { StatementParserConfig } from "../../../../../packages/dsl/schema.js";
import { MathematicalReconciliation } from "../types.js";

/**
 * Executes a full mathematical reconciliation check over parsed transactions.
 */
export function verifyLedgerParity(
  transactions: ParsedTransaction[],
  config?: StatementParserConfig
): MathematicalReconciliation {
  if (transactions.length === 0) {
    return {
      openingBalanceMinorUnits: 0n,
      closingBalanceMinorUnits: 0n,
      totalCreditsMinorUnits: 0n,
      totalDebitsMinorUnits: 0n,
      netMutationMinorUnits: 0n,
      calculatedClosingBalanceMinorUnits: 0n,
      discrepancyMinorUnits: 0n,
      isBalanced: true,
      creditCount: 0,
      debitCount: 0,
      totalTransactions: 0,
      unbalancedRowIndices: [],
      malformedDateRowIndices: [],
      missingBalanceRowIndices: [],
    };
  }

  let totalCredits = 0n;
  let totalDebits = 0n;
  let creditCount = 0;
  let debitCount = 0;

  const unbalancedRowIndices: number[] = [];
  const malformedDateRowIndices: number[] = [];
  const missingBalanceRowIndices: number[] = [];

  const balanceRequired = config ? !config.fields.balance.optional : true;

  // 1. Determine Opening Balance
  const firstTx = transactions[0]!;
  let openingBalance: bigint | null = null;

  if (firstTx.runningBalanceMinorUnits !== undefined && firstTx.runningBalanceMinorUnits !== null) {
    openingBalance = firstTx.runningBalanceMinorUnits - firstTx.amountMinorUnits;
  }

  // 2. Track Running Balances & Errors
  let previousBalance: bigint | null = openingBalance;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]!;

    // Check Credits & Debits
    if (tx.amountMinorUnits > 0n) {
      totalCredits += tx.amountMinorUnits;
      creditCount++;
    } else if (tx.amountMinorUnits < 0n) {
      totalDebits += -tx.amountMinorUnits;
      debitCount++;
    }

    // Check Date Validity
    const parsedTimestamp = Date.parse(tx.date);
    if (isNaN(parsedTimestamp) || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
      malformedDateRowIndices.push(i);
    }

    // Check Balance Presence
    if (balanceRequired && (tx.runningBalanceMinorUnits === undefined || tx.runningBalanceMinorUnits === null)) {
      missingBalanceRowIndices.push(i);
    }

    // Check Row-by-Row Running Balance Continuity
    if (previousBalance !== null && tx.runningBalanceMinorUnits !== undefined && tx.runningBalanceMinorUnits !== null) {
      const expectedBalance = previousBalance + tx.amountMinorUnits;
      if (tx.runningBalanceMinorUnits !== expectedBalance) {
        unbalancedRowIndices.push(i);
      }
      previousBalance = tx.runningBalanceMinorUnits;
    } else if (tx.runningBalanceMinorUnits !== undefined && tx.runningBalanceMinorUnits !== null) {
      previousBalance = tx.runningBalanceMinorUnits;
    }
  }

  // 3. Determine Closing Balance
  const lastTx = transactions[transactions.length - 1]!;
  const closingBalance = lastTx.runningBalanceMinorUnits ?? null;

  // 4. Verify Global Balance Equation: Opening + Credits - Debits == Closing
  const netMutation = totalCredits - totalDebits;
  let calculatedClosingBalance: bigint | null = null;
  let discrepancy = 0n;
  let isBalanced = true;

  if (openingBalance !== null && closingBalance !== null) {
    calculatedClosingBalance = openingBalance + netMutation;
    discrepancy = closingBalance - calculatedClosingBalance;
    isBalanced = discrepancy === 0n && unbalancedRowIndices.length === 0;
  } else if (closingBalance === null && !balanceRequired) {
    // If balance is optional and omitted, no discrepancy
    isBalanced = true;
  }

  return {
    openingBalanceMinorUnits: openingBalance,
    closingBalanceMinorUnits: closingBalance,
    totalCreditsMinorUnits: totalCredits,
    totalDebitsMinorUnits: totalDebits,
    netMutationMinorUnits: netMutation,
    calculatedClosingBalanceMinorUnits: calculatedClosingBalance,
    discrepancyMinorUnits: discrepancy,
    isBalanced,
    creditCount,
    debitCount,
    totalTransactions: transactions.length,
    unbalancedRowIndices,
    malformedDateRowIndices,
    missingBalanceRowIndices,
  };
}

/**
 * Formats a minor units bigint into standard currency notation with thousand separators.
 */
export function formatMinorUnits(minorUnits: bigint | null | undefined, currency = "IDR"): string {
  if (minorUnits === null || minorUnits === undefined) {
    return "—";
  }

  const isNegative = minorUnits < 0n;
  const absUnits = isNegative ? -minorUnits : minorUnits;

  const integerPart = (absUnits / 100n).toString();
  const fractionalPart = (absUnits % 100n).toString().padStart(2, "0");

  // Format integer with dot separator for IDR
  const formattedInt = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = isNegative ? "-" : "";

  return `${sign}${currency} ${formattedInt},${fractionalPart}`;
}
