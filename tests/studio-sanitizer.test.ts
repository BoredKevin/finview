/**
 * Comprehensive Test Suite for Parser Studio, Sanitizer & Reconciliation Engine
 * 
 * Verifies:
 * 1. PII Redaction & Format-Preserving Masking (Accounts, Cards, IBANs)
 * 2. Header Customer Metadata Anonymization with exact character length preservation
 * 3. Narrative Obfuscation with Structural Banking Marker Retention
 * 4. Proportional Amount Scaling with Exact Mathematical Balance Preservation
 * 5. Sanitization Parity Verification (Character Count, Geometry, Math)
 * 6. Export Bundle Generation & SHA-256 Cryptographic Signature
 * 7. Mathematical Reconciliation Engine & Discrepancy Detection
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  maskNumericSequences,
  anonymizeCustomerHeader,
  obfuscateNarrativeText,
  applyProportionalScalar,
  sanitizeNormalizedSpans,
  verifySanitizationParity,
  createStudioExportBundle,
  computeBundleSignature,
  DEFAULT_PRESERVED_TOKENS,
} from "../apps/web/src/studio/sanitizer/RedactionEngine.js";

import {
  verifyLedgerParity,
  formatMinorUnits,
} from "../apps/web/src/studio/reconciliation/ReconciliationEngine.js";

import {
  BCA_SAMPLE_CONFIG,
  BCA_SAMPLE_SPANS,
} from "../apps/web/src/studio/samples/sampleStatements.js";

import { ParsedTransaction, NormalizedTextSpan } from "../packages/dsl/types.js";

describe("1. PII Redaction & Format-Preserving Masking (apps/web/src/studio/sanitizer)", () => {
  test("masks bank account numbers while retaining exact character count and separators", () => {
    const raw1 = "TRANSFER KE REK 0987654321 BCA";
    const masked1 = maskNumericSequences(raw1);
    assert.equal(masked1.length, raw1.length);
    assert.notEqual(masked1, raw1);
    assert.match(masked1, /^TRANSFER KE REK \d{10} BCA$/);

    const raw2 = "NO REK 123-45678-90";
    const masked2 = maskNumericSequences(raw2);
    assert.equal(masked2.length, raw2.length);
    assert.match(masked2, /^NO REK \d{3}-\d{5}-\d{2}$/);
  });

  test("masks credit card sequences preserving 16-digit structure and hyphens", () => {
    const raw = "KARTU KREDIT 4111-2222-3333-4444 EXP 12/28";
    const masked = maskNumericSequences(raw);
    assert.equal(masked.length, raw.length);
    assert.match(masked, /^KARTU KREDIT \d{4}-\d{4}-\d{4}-\d{4} EXP 12\/28$/);
  });

  test("masks IBAN codes retaining country prefix and alphanumeric length", () => {
    const raw = "IBAN GB29XDEF12345678901234";
    const masked = maskNumericSequences(raw);
    assert.equal(masked.length, raw.length);
    assert.match(masked, /^IBAN GB\d{2}[A-Z0-9]{18}$/);
  });
});

describe("2. Header Customer Metadata Anonymization", () => {
  test("anonymizes customer name preserving exact length and casing", () => {
    const headerLine = "NAMA : ALEXANDER MORGAN";
    const anonymized = anonymizeCustomerHeader(headerLine);
    assert.equal(anonymized.length, headerLine.length);
    assert.match(anonymized, /^NAMA : [A-Z\s]+$/);
    assert.notEqual(anonymized, headerLine);
  });

  test("anonymizes customer address preserving exact length", () => {
    const addrLine = "ALAMAT : JL JEND SUDIRMAN NO 45 JAKARTA";
    const anonymized = anonymizeCustomerHeader(addrLine);
    assert.equal(anonymized.length, addrLine.length);
    assert.match(anonymized, /^ALAMAT : [A-Za-z0-9\s]+$/);
    assert.notEqual(anonymized, addrLine);
  });
});

describe("3. Transaction Narrative Obfuscation & Structural Preservation", () => {
  test("strictly preserves structural markers: TRANSFER, DB, CR, BIF, ATM, QRIS", () => {
    const narrative = "TRSF E-BANKING DB BIF TRANSFER KE REK KURNIAWAN DANA DARURAT";
    const obfuscated = obfuscateNarrativeText(narrative, DEFAULT_PRESERVED_TOKENS);

    // Exact length preserved
    assert.equal(obfuscated.length, narrative.length);

    // Structural tokens intact
    assert.ok(obfuscated.includes("TRSF"));
    assert.ok(obfuscated.includes("DB"));
    assert.ok(obfuscated.includes("BIF"));
    assert.ok(obfuscated.includes("TRANSFER"));

    // Merchant / counterparty name scrambled
    assert.ok(!obfuscated.includes("KURNIAWAN"));
  });

  test("preserves transaction date tokens in narrative", () => {
    const narrative = "PEMBAYARAN QRIS TGL 01/10 KEDAI KOPI NIKMAT";
    const obfuscated = obfuscateNarrativeText(narrative, DEFAULT_PRESERVED_TOKENS);
    assert.equal(obfuscated.length, narrative.length);
    assert.ok(obfuscated.includes("QRIS"));
    assert.ok(obfuscated.includes("01/10"));
  });
});

describe("4. Proportional Amount Scaling & Mathematical Parity", () => {
  const sampleTransactions: ParsedTransaction[] = [
    {
      id: "tx-1",
      accountId: "acc-1",
      date: "2024-10-01",
      rawDate: "01/10",
      description: "TRSF E-BANKING DB",
      amountMinorUnits: -150000000n, // -1,500,000.00
      runningBalanceMinorUnits: 1850000000n, // 18,500,000.00 (Opening was 20,000,000.00)
      hash: "hash-1",
      sequenceIndex: 0,
    },
    {
      id: "tx-2",
      accountId: "acc-1",
      date: "2024-10-05",
      rawDate: "05/10",
      description: "SETORAN TUNAI",
      amountMinorUnits: 500000000n, // +5,000,000.00
      runningBalanceMinorUnits: 2350000000n, // 23,500,000.00
      hash: "hash-2",
      sequenceIndex: 1,
    },
    {
      id: "tx-3",
      accountId: "acc-1",
      date: "2024-10-12",
      rawDate: "12/10",
      description: "QRIS PEMBAYARAN DB",
      amountMinorUnits: -25000000n, // -250,000.00
      runningBalanceMinorUnits: 2325000000n, // 23,250,000.00
      hash: "hash-3",
      sequenceIndex: 2,
    },
    {
      id: "tx-4",
      accountId: "acc-1",
      date: "2024-10-31",
      rawDate: "31/10",
      description: "BUNGA",
      amountMinorUnits: 250000n, // +2,500.00
      runningBalanceMinorUnits: 2325250000n, // 23,252,500.00
      hash: "hash-4",
      sequenceIndex: 3,
    },
  ];

  test("scales amounts by scalar and strictly preserves Opening + Credits - Debits == Closing", () => {
    const scalar = 1.35;
    const scaled = applyProportionalScalar(sampleTransactions, scalar);

    assert.equal(scaled.sanitizedTransactions.length, 4);

    const opening = scaled.openingBalanceMinorUnits;
    const credits = scaled.totalCreditsMinorUnits;
    const debits = scaled.totalDebitsMinorUnits;
    const closing = scaled.closingBalanceMinorUnits;

    // Mathematical Parity Assertion: Opening + Credits - Debits == Closing
    assert.equal(opening + credits - debits, closing);

    // Running balance continuity across all rows
    let currentBal = opening;
    for (const tx of scaled.sanitizedTransactions) {
      const net = BigInt(tx.creditMinorUnits) - BigInt(tx.debitMinorUnits);
      currentBal += net;
      assert.equal(BigInt(tx.runningBalanceMinorUnits!), currentBal);
    }
  });

  test("scales with fractional scalar factor (e.g. 0.75) with zero discrepancy", () => {
    const scalar = 0.75;
    const scaled = applyProportionalScalar(sampleTransactions, scalar);
    assert.equal(
      scaled.openingBalanceMinorUnits + scaled.totalCreditsMinorUnits - scaled.totalDebitsMinorUnits,
      scaled.closingBalanceMinorUnits
    );
  });
});

describe("5. Sanitization Parity & Geometry Verification", () => {
  test("sanitizes text spans retaining 100% character count and identical bounding-box geometry", () => {
    const rules = {
      maskAccountNumbers: true,
      anonymizeCustomerNames: true,
      obfuscateNarratives: true,
      amountScalar: 1.25,
      preserveStructuralTokens: DEFAULT_PRESERVED_TOKENS,
    };

    const sanitizedSpans = sanitizeNormalizedSpans(BCA_SAMPLE_SPANS, rules, 150, 920);

    assert.equal(sanitizedSpans.length, BCA_SAMPLE_SPANS.length);

    for (let i = 0; i < BCA_SAMPLE_SPANS.length; i++) {
      const orig = BCA_SAMPLE_SPANS[i]!;
      const sanit = sanitizedSpans[i]!;

      // 1. Invariant 2: Character count parity
      assert.equal(sanit.text.length, orig.text.length, `Character count mismatch at span ${i}`);

      // 2. Invariant 2: Geometry parity (x, y, width, height)
      assert.equal(sanit.x, orig.x, `x coordinate mismatch at span ${i}`);
      assert.equal(sanit.y, orig.y, `y coordinate mismatch at span ${i}`);
      assert.equal(sanit.width, orig.width, `width mismatch at span ${i}`);
      assert.equal(sanit.height, orig.height, `height mismatch at span ${i}`);
    }

    const parityReport = verifySanitizationParity(BCA_SAMPLE_SPANS, sanitizedSpans, {
      openingBalanceMinorUnits: 2000000000n,
      totalCreditsMinorUnits: 500250000n,
      totalDebitsMinorUnits: 176550000n,
      closingBalanceMinorUnits: 2323700000n,
    });

    assert.equal(parityReport.characterCountPreserved, true);
    assert.equal(parityReport.geometryPreserved, true);
    assert.equal(parityReport.mathematicalParityPreserved, true);
  });
});

describe("6. Export Bundle Generation & SHA-256 Cryptographic Signature", () => {
  test("generates export bundle matching Phase 3 schema and validates SHA-256 signature", async () => {
    const fixture = {
      bankId: "bca",
      bankName: "BCA Individual Account Statement",
      fileType: "pdf" as const,
      totalPages: 1,
      totalTransactions: 2,
      sanitizedTransactions: [
        {
          date: "2024-10-01",
          rawDate: "01/10",
          description: "TRSF E-BANKING DB",
          debitMinorUnits: "150000000",
          creditMinorUnits: "0",
          amountMinorUnits: "-150000000",
          runningBalanceMinorUnits: "1850000000",
          hash: "abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          sequenceIndex: 0,
        },
      ],
      reconciliation: {
        openingBalanceMinorUnits: "2000000000",
        totalCreditsMinorUnits: "0",
        totalDebitsMinorUnits: "150000000",
        closingBalanceMinorUnits: "1850000000",
        isBalanced: true,
      },
      parityVerification: {
        characterCountPreserved: true,
        geometryPreserved: true,
        mathematicalParityPreserved: true,
      },
    };

    const bundle = await createStudioExportBundle(BCA_SAMPLE_CONFIG, fixture);

    assert.equal(bundle.version, "1.0.0");
    assert.ok(bundle.generatedAt);
    assert.equal(bundle.config.meta.bankId, "bca");
    assert.equal(bundle.fixture.totalTransactions, 2);

    // Cryptographic signature check: 64-char lowercase hex string
    assert.equal(typeof bundle.signature, "string");
    assert.equal(bundle.signature.length, 64);
    assert.match(bundle.signature, /^[a-f0-9]{64}$/);

    // Recomputing signature independently produces identical digest
    const recomputed = await computeBundleSignature(BCA_SAMPLE_CONFIG, fixture);
    assert.equal(bundle.signature, recomputed);
  });
});

describe("7. Mathematical Reconciliation Engine & Discrepancy Detection", () => {
  const balancedTxs: ParsedTransaction[] = [
    {
      id: "1",
      accountId: "acc-1",
      date: "2024-10-01",
      rawDate: "01/10",
      description: "Transfer",
      amountMinorUnits: -100000n, // -1,000.00
      runningBalanceMinorUnits: 900000n, // 9,000.00 (opening was 10,000.00)
      hash: "h1",
      sequenceIndex: 0,
    },
    {
      id: "2",
      accountId: "acc-1",
      date: "2024-10-02",
      rawDate: "02/10",
      description: "Deposit",
      amountMinorUnits: 500000n, // +5,000.00
      runningBalanceMinorUnits: 1400000n, // 14,000.00
      hash: "h2",
      sequenceIndex: 1,
    },
  ];

  test("confirms balanced ledger with zero discrepancy", () => {
    const res = verifyLedgerParity(balancedTxs);
    assert.equal(res.isBalanced, true);
    assert.equal(res.discrepancyMinorUnits, 0n);
    assert.equal(res.openingBalanceMinorUnits, 1000000n);
    assert.equal(res.closingBalanceMinorUnits, 1400000n);
    assert.equal(res.totalCreditsMinorUnits, 500000n);
    assert.equal(res.totalDebitsMinorUnits, 100000n);
    assert.equal(res.unbalancedRowIndices.length, 0);
  });

  test("detects mathematical discrepancy when row amounts do not tally with closing balance", () => {
    const unbalancedTxs: ParsedTransaction[] = [
      ...balancedTxs,
      {
        id: "3",
        accountId: "acc-1",
        date: "2024-10-03",
        rawDate: "03/10",
        description: "Altered mutation",
        amountMinorUnits: -200000n,
        runningBalanceMinorUnits: 1300000n, // Discrepancy: should be 12,000.00, but says 13,000.00!
        hash: "h3",
        sequenceIndex: 2,
      },
    ];

    const res = verifyLedgerParity(unbalancedTxs);
    assert.equal(res.isBalanced, false);
    assert.equal(res.unbalancedRowIndices.includes(2), true);
    assert.notEqual(res.discrepancyMinorUnits, 0n);
  });

  test("flags malformed dates and missing balances", () => {
    const malformedTxs: ParsedTransaction[] = [
      {
        id: "1",
        accountId: "acc-1",
        date: "INVALID-DATE",
        rawDate: "BAD",
        description: "Bad date row",
        amountMinorUnits: -100000n,
        runningBalanceMinorUnits: null, // missing balance
        hash: "h1",
        sequenceIndex: 0,
      },
    ];

    const res = verifyLedgerParity(malformedTxs, BCA_SAMPLE_CONFIG);
    assert.equal(res.malformedDateRowIndices.length, 1);
    assert.equal(res.missingBalanceRowIndices.length, 1);
  });

  test("formats minor units correctly into IDR currency strings", () => {
    assert.equal(formatMinorUnits(150000000n), "IDR 1.500.000,00");
    assert.equal(formatMinorUnits(-25000000n), "-IDR 250.000,00");
    assert.equal(formatMinorUnits(0n), "IDR 0,00");
    assert.equal(formatMinorUnits(null), "—");
  });
});
