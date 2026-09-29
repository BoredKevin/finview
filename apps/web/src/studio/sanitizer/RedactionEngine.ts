/**
 * PII Redaction & Sanitization Engine
 * 
 * Implements System Invariant 2:
 * "Sanitization Parity: Redaction pipelines must alter text values while
 * retaining character counts, bounding-box geometry, and balance integrity."
 */

import { NormalizedTextSpan, ParsedTransaction } from "../../../../../packages/dsl/types.js";
import { StatementParserConfig } from "../../../../../packages/dsl/schema.js";
import {
  SanitizationRuleConfig,
  SanitizedFixture,
  SanitizedTransactionRecord,
  StudioExportBundle,
} from "../types.js";

export const DEFAULT_PRESERVED_TOKENS = [
  "TRANSFER",
  "TRSF",
  "DB",
  "CR",
  "BIF",
  "BI-FAST",
  "ATM",
  "SALDO",
  "BUNGA",
  "PAJAK",
  "SETORAN",
  "TARIKAN",
  "QRIS",
  "PEMBELIAN",
  "PEMBAYARAN",
  "KARTU",
  "DEBIT",
  "KREDIT",
  "M-BANKING",
  "INTERNET BANKING",
  "VA",
  "VIRTUAL ACCOUNT",
  "EDC",
  "TOPUP",
  "REKENING",
  "AWAL",
  "AKHIR",
  "MUTASI",
  "TANGGAL",
  "CB",
  "VALUTA",
  "KORAN",
  "INFLOW",
  "OUTFLOW",
  "FEE",
  "BIAYA",
  "ADM",
  "ADMIN",
];

/**
 * Deterministic pseudo-random number generator for reproducible redaction test fixtures.
 */
function createPrng(seed = 1337) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Masks numeric sequences (account numbers, IBANs, credit cards) with randomized digits
 * while strictly retaining character length and separator formatting.
 */
export function maskNumericSequences(text: string, rng = Math.random): string {
  // 1. Credit Cards: 16 digits (grouped or contiguous)
  let result = text.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, (match) => {
    return match
      .split("")
      .map((ch) => (/\d/.test(ch) ? Math.floor(rng() * 10).toString() : ch))
      .join("");
  });

  // 2. IBANs: 2 country letters + 2 check digits + 11-30 alphanumeric
  result = result.replace(/\b([A-Z]{2})(\d{2})([A-Z0-9]{11,30})\b/g, (_match, cc, checkDigits, bban) => {
    const maskedCheck = Math.floor(rng() * 90 + 10).toString();
    const maskedBban = bban
      .split("")
      .map((ch: string) => (/\d/.test(ch) ? Math.floor(rng() * 10).toString() : String.fromCharCode(65 + Math.floor(rng() * 26))))
      .join("");
    return `${cc}${maskedCheck}${maskedBban}`;
  });

  // 3. Bank Account Numbers: 6 to 14 consecutive digits
  result = result.replace(/\b\d{6,14}\b/g, (match) => {
    return match
      .split("")
      .map(() => Math.floor(rng() * 10).toString())
      .join("");
  });

  // 4. Formatted Account Numbers (e.g. 123-45678-90 or 123.456.789)
  result = result.replace(/\b\d{3}[-.]\d{4,8}[-.]\d{1,4}\b/g, (match) => {
    return match
      .split("")
      .map((ch) => (/\d/.test(ch) ? Math.floor(rng() * 10).toString() : ch))
      .join("");
  });

  return result;
}

/**
 * Anonymizes customer names and addresses within metadata header lines.
 * Retains exact character counts by substituting alphabet characters with matching casing.
 */
export function anonymizeCustomerHeader(text: string, rng = Math.random): string {
  // If line contains header label such as NAMA, PEMILIK, ALAMAT, NPWP
  const headerPatterns = [
    /(?:NAMA|NAME|PEMILIK|NASABAH)[\s:]+([A-Za-z0-9\s.,'-]+)/i,
    /(?:ALAMAT|ADDRESS)[\s:]+([A-Za-z0-9\s.,'-]+)/i,
    /(?:NPWP|NIK|KTP)[\s:]+([0-9.\s-]+)/i,
  ];

  let anonymized = text;
  for (const pattern of headerPatterns) {
    anonymized = anonymized.replace(pattern, (fullMatch, valueGroup) => {
      const prefix = fullMatch.slice(0, fullMatch.indexOf(valueGroup));
      const maskedValue = valueGroup
        .split("")
        .map((ch: string) => {
          if (/[a-z]/.test(ch)) return String.fromCharCode(97 + Math.floor(rng() * 26));
          if (/[A-Z]/.test(ch)) return String.fromCharCode(65 + Math.floor(rng() * 26));
          if (/[0-9]/.test(ch)) return Math.floor(rng() * 10).toString();
          return ch;
        })
        .join("");
      return `${prefix}${maskedValue}`;
    });
  }

  return anonymized;
}

/**
 * Obfuscates transactional narratives while strictly preserving structural markers
 * ("TRANSFER", "DB", "CR", "BIF", etc.) and retaining character counts and spacing.
 */
export function obfuscateNarrativeText(
  narrative: string,
  preservedTokens: string[] = DEFAULT_PRESERVED_TOKENS,
  rng = Math.random
): string {
  const tokenSet = new Set(preservedTokens.map((t) => t.toUpperCase()));

  // Split narrative while capturing dates, whitespace, and delimiters
  const tokens = narrative.split(/(\b\d{1,4}[-/]\d{1,2}(?:[-/]\d{2,4})?\b|\s+|[/:,.-]+)/);

  return tokens
    .map((token) => {
      // If whitespace or delimiter, preserve as-is
      if (/^(\s+|[/:,.-]+)$/.test(token)) {
        return token;
      }

      const upper = token.toUpperCase();
      // If token is a structural banking marker, preserve as-is
      if (tokenSet.has(upper)) {
        return token;
      }

      // If token is a short date format (DD/MM or YYYY), preserve
      if (/^\d{1,4}[-/]\d{1,2}(?:[-/]\d{2,4})?$/.test(token)) {
        return token;
      }

      // If token is purely a transaction reference code or counterparty text,
      // obfuscate characters preserving case, digit type, and exact length
      return token
        .split("")
        .map((ch) => {
          if (/[A-Z]/.test(ch)) return String.fromCharCode(65 + Math.floor(rng() * 26));
          if (/[a-z]/.test(ch)) return String.fromCharCode(97 + Math.floor(rng() * 26));
          if (/[0-9]/.test(ch)) return Math.floor(rng() * 10).toString();
          return ch;
        })
        .join("");
    })
    .join("");
}

/**
 * Applies a proportional scalar across all transaction amounts to preserve
 * the exact mathematical balancing equation:
 * OpeningBalance' + Sum(Credits') - Sum(Debits') == ClosingBalance'
 */
export function applyProportionalScalar(
  transactions: ParsedTransaction[],
  scalar: number
): {
  sanitizedTransactions: SanitizedTransactionRecord[];
  openingBalanceMinorUnits: bigint;
  totalCreditsMinorUnits: bigint;
  totalDebitsMinorUnits: bigint;
  closingBalanceMinorUnits: bigint;
} {
  if (transactions.length === 0) {
    return {
      sanitizedTransactions: [],
      openingBalanceMinorUnits: 0n,
      totalCreditsMinorUnits: 0n,
      totalDebitsMinorUnits: 0n,
      closingBalanceMinorUnits: 0n,
    };
  }

  // Quantize scalar to integer ratio (scaled by 10,000 to eliminate float inaccuracies)
  const safeScalar = Math.max(0.01, scalar);
  const scaleMultiplier = BigInt(Math.round(safeScalar * 10000));
  const scaleDivisor = 10000n;

  // Scale amount helper
  const scaleVal = (val: bigint): bigint => (val * scaleMultiplier) / scaleDivisor;

  // Derive initial opening balance from first transaction running balance
  const firstTx = transactions[0];
  let openingBalanceMinorUnits = 0n;
  if (firstTx && firstTx.runningBalanceMinorUnits !== undefined && firstTx.runningBalanceMinorUnits !== null) {
    const rawOpening = firstTx.runningBalanceMinorUnits - firstTx.amountMinorUnits;
    openingBalanceMinorUnits = scaleVal(rawOpening);
  }

  let runningBalance = openingBalanceMinorUnits;
  let totalCredits = 0n;
  let totalDebits = 0n;

  const sanitizedTransactions: SanitizedTransactionRecord[] = [];

  for (const tx of transactions) {
    const isCredit = tx.amountMinorUnits > 0n;
    const isDebit = tx.amountMinorUnits < 0n;

    let scaledDebit = 0n;
    let scaledCredit = 0n;

    if (isDebit) {
      scaledDebit = scaleVal(-tx.amountMinorUnits);
      totalDebits += scaledDebit;
    } else if (isCredit) {
      scaledCredit = scaleVal(tx.amountMinorUnits);
      totalCredits += scaledCredit;
    }

    const netAmount = scaledCredit - scaledDebit;
    runningBalance += netAmount;

    sanitizedTransactions.push({
      date: tx.date,
      rawDate: tx.rawDate,
      description: tx.description,
      debitMinorUnits: scaledDebit.toString(),
      creditMinorUnits: scaledCredit.toString(),
      amountMinorUnits: netAmount.toString(),
      runningBalanceMinorUnits: runningBalance.toString(),
      hash: tx.hash,
      sequenceIndex: tx.sequenceIndex,
    });
  }

  const closingBalanceMinorUnits = runningBalance;

  return {
    sanitizedTransactions,
    openingBalanceMinorUnits,
    totalCreditsMinorUnits: totalCredits,
    totalDebitsMinorUnits: totalDebits,
    closingBalanceMinorUnits,
  };
}

/**
 * Sanitizes normalized text spans according to rules, strictly retaining
 * character length and spatial bounding-box geometry.
 */
export function sanitizeNormalizedSpans(
  spans: NormalizedTextSpan[],
  rules: SanitizationRuleConfig,
  topMargin = 150,
  bottomMargin = 900,
  rng = Math.random
): NormalizedTextSpan[] {
  return spans.map((span) => {
    let text = span.text;
    const origLen = text.length;

    // 1. Mask numeric sequences (accounts, cards, IBANs)
    if (rules.maskAccountNumbers) {
      text = maskNumericSequences(text, rng);
    }

    // 2. Anonymize customer names in header zone
    if (rules.anonymizeCustomerNames && span.y <= topMargin) {
      text = anonymizeCustomerHeader(text, rng);
    }

    // 3. Obfuscate narrative remarks in transaction zone
    if (rules.obfuscateNarratives && span.y > topMargin && span.y < bottomMargin) {
      text = obfuscateNarrativeText(text, rules.preserveStructuralTokens, rng);
    }

    // SANITIZATION PARITY ASSERTION: character count must remain identical
    if (text.length !== origLen) {
      // Pad or slice if edge-case regex altered length
      if (text.length < origLen) {
        text = text.padEnd(origLen, "X");
      } else {
        text = text.slice(0, origLen);
      }
    }

    return {
      text,
      x: span.x,
      y: span.y,
      width: span.width,
      height: span.height,
    };
  });
}

/**
 * Verifies sanitization parity across text lengths, bounding-box geometry,
 * and mathematical balancing equations.
 */
export function verifySanitizationParity(
  originalSpans: NormalizedTextSpan[],
  sanitizedSpans: NormalizedTextSpan[],
  reconciliation: {
    openingBalanceMinorUnits: bigint | string;
    totalCreditsMinorUnits: bigint | string;
    totalDebitsMinorUnits: bigint | string;
    closingBalanceMinorUnits: bigint | string;
  }
): {
  characterCountPreserved: boolean;
  geometryPreserved: boolean;
  mathematicalParityPreserved: boolean;
} {
  // 1. Character count check
  let characterCountPreserved = true;
  if (originalSpans.length !== sanitizedSpans.length) {
    characterCountPreserved = false;
  } else {
    for (let i = 0; i < originalSpans.length; i++) {
      if (originalSpans[i]!.text.length !== sanitizedSpans[i]!.text.length) {
        characterCountPreserved = false;
        break;
      }
    }
  }

  // 2. Geometry check
  let geometryPreserved = true;
  if (originalSpans.length !== sanitizedSpans.length) {
    geometryPreserved = false;
  } else {
    for (let i = 0; i < originalSpans.length; i++) {
      const orig = originalSpans[i]!;
      const sanit = sanitizedSpans[i]!;
      if (
        orig.x !== sanit.x ||
        orig.y !== sanit.y ||
        orig.width !== sanit.width ||
        orig.height !== sanit.height
      ) {
        geometryPreserved = false;
        break;
      }
    }
  }

  // 3. Mathematical Parity: Opening + Credits - Debits == Closing
  const openBal = BigInt(reconciliation.openingBalanceMinorUnits.toString());
  const cr = BigInt(reconciliation.totalCreditsMinorUnits.toString());
  const db = BigInt(reconciliation.totalDebitsMinorUnits.toString());
  const closeBal = BigInt(reconciliation.closingBalanceMinorUnits.toString());

  const mathematicalParityPreserved = openBal + cr - db === closeBal;

  return {
    characterCountPreserved,
    geometryPreserved,
    mathematicalParityPreserved,
  };
}

/**
 * Computes a deterministic SHA-256 cryptographic signature of the export bundle content.
 */
export async function computeBundleSignature(
  config: StatementParserConfig,
  fixture: SanitizedFixture
): Promise<string> {
  const canonicalPayload = JSON.stringify({
    config,
    fixture: {
      bankId: fixture.bankId,
      fileType: fixture.fileType,
      totalTransactions: fixture.totalTransactions,
      sanitizedTransactions: fixture.sanitizedTransactions,
      reconciliation: fixture.reconciliation,
    },
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalPayload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Builds the complete export bundle conforming to Phase 3 specification.
 */
export async function createStudioExportBundle(
  config: StatementParserConfig,
  fixture: SanitizedFixture
): Promise<StudioExportBundle> {
  const signature = await computeBundleSignature(config, fixture);
  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    config,
    fixture,
    signature,
  };
}
