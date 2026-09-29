/**
 * Safe DSL Execution Engine
 * 
 * Invariants:
 * 1. Sandboxed declarative execution - zero eval/new Function.
 * 2. Static ReDoS prevention with 50ms per-page execution deadline.
 * 3. Exact minor unit integer arithmetic (bigint) - zero float inaccuracies.
 * 4. Deterministic transaction hash matching Phase 1:
 *    sha256(accountId + ":" + date + ":" + amountInMinorUnits + ":" + runningBalanceMinorUnits + ":" + sequenceIndex)
 */

import {
  StatementParserConfig,
  SingleColumnAmountStrategy,
  SplitColumnAmountStrategy,
  PdfColumn,
  CsvColumn,
} from "./schema.js";
import {
  ExtractedRow,
  ParsedTransaction,
  StatementParseOptions,
} from "./types.js";
import {
  assertSafeRegex,
  compileSafeRegex,
  DeadlineWatchdog,
  safeRegexMatch,
  validateConfigRegexes,
} from "./redos.js";
import { projectRowToColumns } from "./normalizer.js";

/**
 * Computes deterministic SHA-256 transaction hash matching Phase 1 spec:
 * sha256(accountId + ":" + date + ":" + amountInMinorUnits + ":" + runningBalanceMinorUnits + ":" + sequenceIndex)
 */
export async function calculateStatementTransactionHash(params: {
  accountId: string;
  date: string;
  amountInMinorUnits: bigint;
  runningBalanceMinorUnits?: bigint | null;
  sequenceIndex: number;
}): Promise<string> {
  const accountId = params.accountId.trim();
  const date = params.date.trim();
  const amountStr = params.amountInMinorUnits.toString();
  const balanceStr =
    params.runningBalanceMinorUnits !== undefined && params.runningBalanceMinorUnits !== null
      ? params.runningBalanceMinorUnits.toString()
      : "0";
  const sequenceStr = params.sequenceIndex.toString();

  const canonicalString = `${accountId}:${date}:${amountStr}:${balanceStr}:${sequenceStr}`;

  // Use Web Crypto API (supported in Browsers, Web Workers, Node 19+)
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const dataBytes = new TextEncoder().encode(canonicalString);
    const digestBuffer = await globalThis.crypto.subtle.digest("SHA-256", dataBytes);
    const hashBytes = new Uint8Array(digestBuffer);
    let hex = "";
    for (let i = 0; i < hashBytes.length; i++) {
      hex += hashBytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  // Fallback for Node environments without global subtle
  try {
    const cryptoModule = await import("node:crypto");
    return cryptoModule.createHash("sha256").update(canonicalString).digest("hex");
  } catch {
    throw new Error("Crypto subtle or node:crypto required for sha256 calculation");
  }
}

/**
 * Converts a raw decimal amount string into integer minor units (bigint)
 * strictly without floating-point math.
 */
export function parseDecimalToMinorUnits(
  raw: string,
  decimalSep: "," | ".",
  thousandSep: "." | ",",
  isDebit: boolean
): bigint {
  const trimmed = raw.trim();
  if (!trimmed) return 0n;

  // Clean all characters except digits and the decimal separator
  // First, strip thousand separators
  const withoutThousands = trimmed.split(thousandSep).join("");

  // Find decimal separator position
  const decimalIdx = withoutThousands.lastIndexOf(decimalSep);

  let intStr = "";
  let fracStr = "";

  if (decimalIdx !== -1) {
    intStr = withoutThousands.slice(0, decimalIdx).replace(/\D/g, "");
    fracStr = withoutThousands.slice(decimalIdx + 1).replace(/\D/g, "");
  } else {
    intStr = withoutThousands.replace(/\D/g, "");
    fracStr = "";
  }

  if (!intStr && !fracStr) return 0n;

  // Standardize fractional part to 2 digits (cents/minor units)
  const normalizedFrac = (fracStr + "00").slice(0, 2);

  const intBig = BigInt(intStr || "0");
  const fracBig = BigInt(normalizedFrac);

  let minorUnits = intBig * 100n + fracBig;

  if (isDebit && minorUnits > 0n) {
    minorUnits = -minorUnits;
  }

  return minorUnits;
}

/**
 * Parses single column amount with prefix/suffix debit indicator.
 */
export function parseSingleColumnAmount(
  raw: string,
  strategy: SingleColumnAmountStrategy
): bigint {
  const upper = raw.trim().toUpperCase();
  const pattern = strategy.debitIndicator.pattern.toUpperCase();

  let isDebit = false;

  if (strategy.debitIndicator.position === "suffix") {
    if (upper.endsWith(pattern)) {
      isDebit = true;
    }
  } else {
    if (upper.startsWith(pattern)) {
      isDebit = true;
    }
  }

  // Also handle standard negative prefix/suffix
  if (upper.startsWith("-") || upper.endsWith("-") || upper.endsWith("DR")) {
    isDebit = true;
  }

  return parseDecimalToMinorUnits(
    raw,
    strategy.decimalSep,
    strategy.thousandSep,
    isDebit
  );
}

/**
 * Parses split column layout (separate debit and credit columns).
 */
export function parseSplitColumnAmount(
  debitRaw: string,
  creditRaw: string,
  strategy: SplitColumnAmountStrategy
): bigint {
  const cleanDebit = debitRaw.trim().replace(/[^0-9]/g, "");
  const cleanCredit = creditRaw.trim().replace(/[^0-9]/g, "");

  const hasDebit = cleanDebit.length > 0 && BigInt(cleanDebit) > 0n;
  const hasCredit = cleanCredit.length > 0 && BigInt(cleanCredit) > 0n;

  if (hasDebit) {
    return parseDecimalToMinorUnits(
      debitRaw,
      strategy.decimalSep,
      strategy.thousandSep,
      true // debit is negative
    );
  }

  if (hasCredit) {
    return parseDecimalToMinorUnits(
      creditRaw,
      strategy.decimalSep,
      strategy.thousandSep,
      false // credit is positive
    );
  }

  return 0n;
}

/**
 * Parses balance column string into bigint minor units.
 */
export function parseBalanceToMinorUnits(
  raw: string | undefined,
  decimalSep: "," | ".",
  thousandSep: "." | ","
): bigint | null {
  if (!raw || !raw.trim()) return null;
  const isNegative = raw.includes("-") || raw.toUpperCase().includes("DB");
  return parseDecimalToMinorUnits(raw, decimalSep, thousandSep, isNegative);
}

/**
 * Normalizes statement date to ISO 8601 YYYY-MM-DD string.
 */
export function normalizeDate(
  rawDate: string,
  format: string,
  fallbackYear = new Date().getFullYear()
): string {
  const trimmed = rawDate.trim();
  if (!trimmed) return "";

  // Common date formats:
  // "DD/MM/YYYY", "DD/MM", "YYYY-MM-DD", "DD-MM-YYYY", "DD-MMM-YYYY", "DD MMM YYYY"
  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    januari: "01", februari: "02", maret: "03", april: "04", mei: "05",
    juni: "06", juli: "07", agustus: "08", september: "09", oktober: "10",
    nopember: "11", november: "11", desember: "12",
  };

  if (format === "YYYY-MM-DD") {
    const match = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  if (format === "DD/MM/YYYY" || format === "DD-MM-YYYY") {
    const match = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  }

  if (format === "DD/MM") {
    const match = trimmed.match(/^(\d{2})[-/](\d{2})$/);
    if (match) {
      const month = match[2];
      const day = match[1];
      return `${fallbackYear}-${month}-${day}`;
    }
  }

  // Alpha month e.g. "15 Jan 2026" or "15-JAN-2026"
  const alphaMatch = trimmed.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{4})$/);
  if (alphaMatch) {
    const day = alphaMatch[1].padStart(2, "0");
    const mStr = alphaMatch[2].toLowerCase();
    const month = monthMap[mStr] ?? "01";
    const year = alphaMatch[3];
    return `${year}-${month}-${day}`;
  }

  return trimmed;
}

/**
 * Sanitizes a description string using optional regex pattern and whitespace normalization.
 */
export function sanitizeDescription(desc: string, sanitizePattern?: string): string {
  let cleaned = desc;
  if (sanitizePattern) {
    assertSafeRegex(sanitizePattern);
    const regex = compileSafeRegex(sanitizePattern, "g");
    cleaned = cleaned.replace(regex, " ");
  }
  return cleaned.replace(/[ \t]+/g, " ").trim();
}

interface PendingTransaction {
  date: string;
  rawDate: string;
  descriptionParts: string[];
  amountMinorUnits: bigint;
  runningBalanceMinorUnits?: bigint | null;
  metadata: Record<string, string>;
}

/**
 * Parses tabular rows extracted from PDF pages into fully structured, deduplicated transactions.
 */
export async function parsePdfRows(
  rows: ExtractedRow[],
  config: StatementParserConfig,
  accountId: string,
  options?: StatementParseOptions
): Promise<ParsedTransaction[]> {
  validateConfigRegexes(config);

  const watchdog = new DeadlineWatchdog(options?.deadlineMsPerPage ?? 50);

  // Filter rows by pageBounds
  const bounds = config.pageBounds;
  let inTransactionSection = !bounds.headerPattern;

  const headerRegex = bounds.headerPattern
    ? compileSafeRegex(bounds.headerPattern, "i")
    : null;
  const footerRegex = bounds.footerPattern
    ? compileSafeRegex(bounds.footerPattern, "i")
    : null;

  const dateRegex = compileSafeRegex(config.rowContinuation.dateRegex);

  const pdfColumns: PdfColumn[] = [];
  for (const c of config.columns) {
    if (typeof c === "object" && c !== null && "xStart" in c && "xEnd" in c) {
      pdfColumns.push(c as PdfColumn);
    }
  }

  const pendingTransactions: PendingTransaction[] = [];
  let currentTx: PendingTransaction | null = null;

  for (const row of rows) {
    watchdog.check();

    // Check vertical bounds
    if (row.y < bounds.topMargin) continue;
    if (row.y > bounds.bottomMargin) continue;

    // Header pattern check: ignore everything until header line
    if (!inTransactionSection && headerRegex) {
      if (headerRegex.test(row.rawText)) {
        inTransactionSection = true;
      }
      continue;
    }

    // Footer pattern check: stop when footer line reached
    if (footerRegex && footerRegex.test(row.rawText)) {
      break;
    }

    // Project spans into configured columns
    const colData = projectRowToColumns(row, pdfColumns);

    const dateVal = colData[config.fields.date.columnId]?.trim() ?? "";
    const isNewTx = safeRegexMatch(dateRegex, dateVal, watchdog) !== null;

    if (isNewTx) {
      // Finalize previous transaction if exists
      if (currentTx) {
        pendingTransactions.push(currentTx);
      }

      // Compute description parts from row
      const descParts = config.fields.description.columnIds
        .map((id) => colData[id]?.trim() ?? "")
        .filter(Boolean);

      // Compute amount based on strategy
      let amountMinor = 0n;
      if ("columnId" in config.fields.amountStrategy) {
        const rawAmt = colData[config.fields.amountStrategy.columnId] ?? "";
        amountMinor = parseSingleColumnAmount(rawAmt, config.fields.amountStrategy);
      } else {
        const rawDebit = colData[config.fields.amountStrategy.debitColumnId] ?? "";
        const rawCredit = colData[config.fields.amountStrategy.creditColumnId] ?? "";
        amountMinor = parseSplitColumnAmount(rawDebit, rawCredit, config.fields.amountStrategy);
      }

      // Compute balance
      const rawBal = colData[config.fields.balance.columnId];
      const decSep =
        "decimalSep" in config.fields.amountStrategy
          ? config.fields.amountStrategy.decimalSep
          : ",";
      const thouSep =
        "thousandSep" in config.fields.amountStrategy
          ? config.fields.amountStrategy.thousandSep
          : ".";
      const balanceMinor = parseBalanceToMinorUnits(rawBal, decSep, thouSep);

      currentTx = {
        date: normalizeDate(dateVal, config.fields.date.format),
        rawDate: dateVal,
        descriptionParts: descParts,
        amountMinorUnits: amountMinor,
        runningBalanceMinorUnits: balanceMinor,
        metadata: { ...colData },
      };
    } else {
      // Continuation line or extraneous row
      if (currentTx && config.rowContinuation.dateRequired) {
        const continuationDesc = config.fields.description.columnIds
          .map((id) => colData[id]?.trim() ?? "")
          .filter(Boolean);

        if (continuationDesc.length > 0) {
          currentTx.descriptionParts.push(...continuationDesc);
        }
      }
    }
  }

  // Push final transaction
  if (currentTx) {
    pendingTransactions.push(currentTx);
  }

  // Build final ParsedTransaction array with deterministic hashes
  const results: ParsedTransaction[] = [];
  const joiner = config.rowContinuation.descriptionJoiner;
  const sanitizeRegex = config.fields.description.sanitizeRegex;

  for (let idx = 0; idx < pendingTransactions.length; idx++) {
    const tx = pendingTransactions[idx];
    const joinedDesc = tx.descriptionParts.join(joiner);
    const sanitizedDesc = sanitizeDescription(joinedDesc, sanitizeRegex);

    const hash = await calculateStatementTransactionHash({
      accountId,
      date: tx.date,
      amountInMinorUnits: tx.amountMinorUnits,
      runningBalanceMinorUnits: tx.runningBalanceMinorUnits,
      sequenceIndex: idx,
    });

    results.push({
      id: `tx_stmt_${hash.slice(0, 16)}`,
      accountId,
      date: tx.date,
      rawDate: tx.rawDate,
      description: sanitizedDesc,
      amountMinorUnits: tx.amountMinorUnits,
      runningBalanceMinorUnits: tx.runningBalanceMinorUnits,
      hash,
      sequenceIndex: idx,
      metadata: tx.metadata,
    });
  }

  return results;
}

/**
 * Parses raw CSV rows into fully structured, deduplicated transactions.
 */
export async function parseCsvRows(
  csvRows: string[][],
  config: StatementParserConfig,
  accountId: string,
  options?: StatementParseOptions
): Promise<ParsedTransaction[]> {
  validateConfigRegexes(config);

  const watchdog = new DeadlineWatchdog(options?.deadlineMsPerPage ?? 50);

  const csvColumns: CsvColumn[] = [];
  for (const c of config.columns) {
    if (typeof c === "object" && c !== null && "columnIndex" in c) {
      csvColumns.push(c as CsvColumn);
    }
  }
  const colIndexMap = new Map<string, number>();
  for (const c of csvColumns) {
    colIndexMap.set(c.id, c.columnIndex);
  }

  const dateRegex = compileSafeRegex(config.rowContinuation.dateRegex);
  const headerRegex = config.pageBounds.headerPattern
    ? compileSafeRegex(config.pageBounds.headerPattern, "i")
    : null;

  let inTransactionSection = !headerRegex;
  const pendingTransactions: PendingTransaction[] = [];
  let currentTx: PendingTransaction | null = null;

  for (const row of csvRows) {
    watchdog.check();
    if (!row || row.length === 0) continue;

    const rowRawText = row.join(" ");

    // Check header pattern
    if (!inTransactionSection && headerRegex) {
      if (headerRegex.test(rowRawText)) {
        inTransactionSection = true;
      }
      continue;
    }

    const dateColIdx = colIndexMap.get(config.fields.date.columnId);
    const dateVal = dateColIdx !== undefined ? (row[dateColIdx]?.trim() ?? "") : "";

    const isNewTx = safeRegexMatch(dateRegex, dateVal, watchdog) !== null;

    if (isNewTx) {
      if (currentTx) {
        pendingTransactions.push(currentTx);
      }

      const descParts = config.fields.description.columnIds
        .map((id) => {
          const idx = colIndexMap.get(id);
          return idx !== undefined ? row[idx]?.trim() ?? "" : "";
        })
        .filter(Boolean);

      let amountMinor = 0n;
      if ("columnId" in config.fields.amountStrategy) {
        const amtIdx = colIndexMap.get(config.fields.amountStrategy.columnId);
        const rawAmt = amtIdx !== undefined ? row[amtIdx] ?? "" : "";
        amountMinor = parseSingleColumnAmount(rawAmt, config.fields.amountStrategy);
      } else {
        const debitIdx = colIndexMap.get(config.fields.amountStrategy.debitColumnId);
        const creditIdx = colIndexMap.get(config.fields.amountStrategy.creditColumnId);
        const rawDebit = debitIdx !== undefined ? row[debitIdx] ?? "" : "";
        const rawCredit = creditIdx !== undefined ? row[creditIdx] ?? "" : "";
        amountMinor = parseSplitColumnAmount(rawDebit, rawCredit, config.fields.amountStrategy);
      }

      const balIdx = colIndexMap.get(config.fields.balance.columnId);
      const rawBal = balIdx !== undefined ? row[balIdx] : undefined;
      const decSep =
        "decimalSep" in config.fields.amountStrategy
          ? config.fields.amountStrategy.decimalSep
          : ",";
      const thouSep =
        "thousandSep" in config.fields.amountStrategy
          ? config.fields.amountStrategy.thousandSep
          : ".";
      const balanceMinor = parseBalanceToMinorUnits(rawBal, decSep, thouSep);

      currentTx = {
        date: normalizeDate(dateVal, config.fields.date.format),
        rawDate: dateVal,
        descriptionParts: descParts,
        amountMinorUnits: amountMinor,
        runningBalanceMinorUnits: balanceMinor,
        metadata: { rowData: row.join(",") },
      };
    } else {
      if (currentTx && config.rowContinuation.dateRequired) {
        const continuationDesc = config.fields.description.columnIds
          .map((id) => {
            const idx = colIndexMap.get(id);
            return idx !== undefined ? row[idx]?.trim() ?? "" : "";
          })
          .filter(Boolean);

        if (continuationDesc.length > 0) {
          currentTx.descriptionParts.push(...continuationDesc);
        }
      }
    }
  }

  if (currentTx) {
    pendingTransactions.push(currentTx);
  }

  const results: ParsedTransaction[] = [];
  const joiner = config.rowContinuation.descriptionJoiner;
  const sanitizeRegex = config.fields.description.sanitizeRegex;

  for (let idx = 0; idx < pendingTransactions.length; idx++) {
    const tx = pendingTransactions[idx];
    const joinedDesc = tx.descriptionParts.join(joiner);
    const sanitizedDesc = sanitizeDescription(joinedDesc, sanitizeRegex);

    const hash = await calculateStatementTransactionHash({
      accountId,
      date: tx.date,
      amountInMinorUnits: tx.amountMinorUnits,
      runningBalanceMinorUnits: tx.runningBalanceMinorUnits,
      sequenceIndex: idx,
    });

    results.push({
      id: `tx_stmt_${hash.slice(0, 16)}`,
      accountId,
      date: tx.date,
      rawDate: tx.rawDate,
      description: sanitizedDesc,
      amountMinorUnits: tx.amountMinorUnits,
      runningBalanceMinorUnits: tx.runningBalanceMinorUnits,
      hash,
      sequenceIndex: idx,
      metadata: tx.metadata,
    });
  }

  return results;
}
