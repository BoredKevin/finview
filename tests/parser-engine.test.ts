/**
 * Comprehensive Test Suite for Statement Parser Engine & DSL
 * 
 * Verifies:
 * 1. Zod DSL Schema validation & rejection
 * 2. Static ReDoS protection & 50ms page deadline watchdog
 * 3. Coordinate normalization (0..1000) & row clustering (Delta y <= 3)
 * 4. Exact bigint minor unit amount parsing (zero float math)
 * 5. Deterministic transaction hashing matching Phase 1 spec
 * 6. Reference definitions (BCA, CIMB, Blu BCA) & multi-line continuation
 * 7. Worker lifecycle and memory cleanup
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  StatementParserConfigSchema,
  validateStatementParserConfig,
  safeValidateStatementParserConfig,
  assertSafeRegex,
  compileSafeRegex,
  ReDoSValidationError,
  DeadlineWatchdog,
  ReDoSTimeoutError,
  normalizeCoordinates,
  clusterSpansIntoRows,
  projectRowToColumns,
  parseDecimalToMinorUnits,
  parseSingleColumnAmount,
  parseSplitColumnAmount,
  calculateStatementTransactionHash,
  parsePdfRows,
  parseCsvRows,
  NormalizedTextSpan,
  ExtractedRow,
} from "../packages/dsl/index.js";

import { parserWorkerAPI } from "../apps/web/src/workers/parser.worker.js";

describe("1. Declarative DSL Schema Validation (packages/dsl/schema.ts)", () => {
  const bcaConfig = JSON.parse(
    fs.readFileSync(path.resolve("packages/dsl/configs/bca-individual-pdf.json"), "utf8")
  );
  const cimbConfig = JSON.parse(
    fs.readFileSync(path.resolve("packages/dsl/configs/cimb-niaga-pdf.json"), "utf8")
  );
  const bluConfig = JSON.parse(
    fs.readFileSync(path.resolve("packages/dsl/configs/blu-bca-csv.json"), "utf8")
  );

  test("validates bca-individual-pdf.json successfully", () => {
    const validated = validateStatementParserConfig(bcaConfig);
    assert.equal(validated.meta.bankId, "bca");
    assert.equal(validated.meta.fileType, "pdf");
    assert.equal(validated.columns.length, 5);
    assert.equal(validated.rowContinuation.dateRequired, true);
    assert.equal(validated.rowContinuation.descriptionJoiner, "\n");
    assert.equal("columnId" in validated.fields.amountStrategy, true);
  });

  test("validates cimb-niaga-pdf.json successfully (split columns)", () => {
    const validated = validateStatementParserConfig(cimbConfig);
    assert.equal(validated.meta.bankId, "cimb-niaga");
    assert.equal(validated.meta.fileType, "pdf");
    assert.equal("debitColumnId" in validated.fields.amountStrategy, true);
  });

  test("validates blu-bca-csv.json successfully (CSV index columns)", () => {
    const validated = validateStatementParserConfig(bluConfig);
    assert.equal(validated.meta.bankId, "blu-bca");
    assert.equal(validated.meta.fileType, "csv");
    assert.equal(validated.columns.length, 5);
  });

  test("rejects configurations with invalid or missing required fields", () => {
    const invalidConfig = { ...bcaConfig, meta: { ...bcaConfig.meta, bankId: "" } };
    const res = safeValidateStatementParserConfig(invalidConfig);
    assert.equal(res.success, false);
    assert.ok(res.error);
  });

  test("rejects invalid pageBounds or column bounds outside 0..1000", () => {
    const badBounds = {
      ...bcaConfig,
      pageBounds: { topMargin: -10, bottomMargin: 1200 },
    };
    const res = safeValidateStatementParserConfig(badBounds);
    assert.equal(res.success, false);
  });
});

describe("2. Static ReDoS Protection & Deadline Watchdog (packages/dsl/redos.ts)", () => {
  test("allows safe regex patterns", () => {
    assert.doesNotThrow(() => assertSafeRegex("^\\d{2}/\\d{2}$"));
    assert.doesNotThrow(() => assertSafeRegex("^\\d{2}/\\d{2}/\\d{4}$"));
    assert.doesNotThrow(() => assertSafeRegex("^[0-9]+$"));
    assert.doesNotThrow(() => assertSafeRegex("^DB$"));
    assert.doesNotThrow(() => assertSafeRegex("[A-Z0-9\\s-]+"));
    assert.doesNotThrow(() => assertSafeRegex("TANGGAL\\s+KETERANGAN\\s+CB"));
  });

  test("statically detects and rejects nested repetition patterns (ReDoS)", () => {
    // (a+)+
    assert.throws(
      () => assertSafeRegex("(a+)+"),
      (err: any) => err instanceof ReDoSValidationError
    );

    // ([a-zA-Z]+)*
    assert.throws(
      () => assertSafeRegex("([a-zA-Z]+)*"),
      (err: any) => err instanceof ReDoSValidationError
    );

    // (\d+)+
    assert.throws(
      () => assertSafeRegex("(\\d+)+"),
      (err: any) => err instanceof ReDoSValidationError
    );

    // ((ab)+)*
    assert.throws(
      () => assertSafeRegex("((ab)+)*"),
      (err: any) => err instanceof ReDoSValidationError
    );

    // (x*)*
    assert.throws(
      () => assertSafeRegex("(x*)*"),
      (err: any) => err instanceof ReDoSValidationError
    );
  });

  test("enforces 50ms deadline watchdog interrupt on timeout", async () => {
    const watchdog = new DeadlineWatchdog(50);
    // Initially within deadline
    assert.doesNotThrow(() => watchdog.check());

    // Artificial delay to exceed 50ms
    await new Promise((r) => setTimeout(r, 60));

    assert.throws(
      () => watchdog.check(),
      (err: any) => err instanceof ReDoSTimeoutError
    );
  });
});

describe("3. Coordinate Normalization & Line Reconstruction (packages/dsl/normalizer.ts)", () => {
  test("accurately normalizes PDF bounding boxes to 0..1000 integer grid", () => {
    const pageWidth = 595;
    const pageHeight = 842;

    // Top-left text at x=59.5, y=757.8, height=12
    // y_norm = round(((842 - 757.8 - 12) / 842) * 1000) = round((72.2 / 842) * 1000) = 86
    const norm1 = normalizeCoordinates(59.5, 757.8, 50, 12, pageWidth, pageHeight);
    assert.equal(norm1.x, Math.round((59.5 / 595) * 1000)); // 100
    assert.equal(norm1.y, Math.round(((842 - 757.8 - 12) / 842) * 1000)); // 86
    assert.ok(norm1.x >= 0 && norm1.x <= 1000);
    assert.ok(norm1.y >= 0 && norm1.y <= 1000);
  });

  test("clusters text spans into vertical rows with Delta y <= 3 tolerance", () => {
    const spans: NormalizedTextSpan[] = [
      { text: "BCA", x: 100, y: 50, width: 30, height: 10 },
      { text: "STATEMENT", x: 200, y: 52, width: 60, height: 10 }, // delta y = 2 (belongs to same row)
      { text: "ACCOUNT", x: 100, y: 90, width: 50, height: 10 },    // delta y = 38 (new row)
      { text: "123456", x: 200, y: 91, width: 40, height: 10 },     // delta y = 1 (belongs to second row)
    ];

    const rows = clusterSpansIntoRows(spans, 3);
    assert.equal(rows.length, 2, "Must cluster into exactly 2 rows");

    // First row
    assert.equal(rows[0].spans.length, 2);
    assert.equal(rows[0].spans[0].text, "BCA");
    assert.equal(rows[0].spans[1].text, "STATEMENT");
    assert.equal(rows[0].rawText, "BCA STATEMENT");

    // Second row
    assert.equal(rows[1].spans.length, 2);
    assert.equal(rows[1].spans[0].text, "ACCOUNT");
    assert.equal(rows[1].spans[1].text, "123456");
  });

  test("sorts row items strictly by x_norm ascending", () => {
    const spans: NormalizedTextSpan[] = [
      { text: "Third", x: 500, y: 100, width: 20, height: 10 },
      { text: "First", x: 50, y: 101, width: 20, height: 10 },
      { text: "Second", x: 250, y: 100, width: 20, height: 10 },
    ];

    const rows = clusterSpansIntoRows(spans, 3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].spans[0].text, "First");
    assert.equal(rows[0].spans[1].text, "Second");
    assert.equal(rows[0].spans[2].text, "Third");
    assert.equal(rows[0].rawText, "First Second Third");
  });

  test("projects row spans into columns based on xStart/xEnd bounds", () => {
    const row: ExtractedRow = {
      y: 200,
      spans: [
        { text: "01/08", x: 40, y: 200, width: 30, height: 10 },
        { text: "TRANSFER", x: 150, y: 200, width: 60, height: 10 },
        { text: "KE REK 123", x: 220, y: 200, width: 80, height: 10 },
        { text: "50.000,00 DB", x: 600, y: 200, width: 70, height: 10 },
        { text: "1.250.000,00", x: 820, y: 200, width: 70, height: 10 },
      ],
      rawText: "01/08 TRANSFER KE REK 123 50.000,00 DB 1.250.000,00",
    };

    const columns = [
      { id: "date", name: "Tanggal", xStart: 30, xEnd: 120 },
      { id: "desc", name: "Keterangan", xStart: 120, xEnd: 500 },
      { id: "amount", name: "Mutasi", xStart: 500, xEnd: 750 },
      { id: "balance", name: "Saldo", xStart: 750, xEnd: 980 },
    ];

    const projected = projectRowToColumns(row, columns);
    assert.equal(projected.date, "01/08");
    assert.equal(projected.desc, "TRANSFER KE REK 123");
    assert.equal(projected.amount, "50.000,00 DB");
    assert.equal(projected.balance, "1.250.000,00");
  });
});

describe("4. Minor Unit Integer Parsing & Amount Strategies (packages/dsl/engine.ts)", () => {
  test("parses decimal amounts to bigint minor units without float inaccuracies", () => {
    // 50.000,00 DB -> -5,000,000 cents
    const bcaDebit = parseSingleColumnAmount("50.000,00 DB", {
      columnId: "amount",
      debitIndicator: { pattern: "DB", position: "suffix" },
      decimalSep: ",",
      thousandSep: ".",
    });
    assert.equal(bcaDebit, -5000000n);

    // 1.250.000,50 -> +125,000,050 cents
    const bcaCredit = parseSingleColumnAmount("1.250.000,50", {
      columnId: "amount",
      debitIndicator: { pattern: "DB", position: "suffix" },
      decimalSep: ",",
      thousandSep: ".",
    });
    assert.equal(bcaCredit, 125000050n);

    // US format: 1,234.56 -> 123,456 cents
    const usCredit = parseSingleColumnAmount("1,234.56", {
      columnId: "amount",
      debitIndicator: { pattern: "-", position: "prefix" },
      decimalSep: ".",
      thousandSep: ",",
    });
    assert.equal(usCredit, 123456n);

    // Negative US format: -1,234.56 -> -123,456 cents
    const usDebit = parseSingleColumnAmount("-1,234.56", {
      columnId: "amount",
      debitIndicator: { pattern: "-", position: "prefix" },
      decimalSep: ".",
      thousandSep: ",",
    });
    assert.equal(usDebit, -123456n);
  });

  test("parses split debit/credit column amounts accurately", () => {
    const splitStrategy = {
      debitColumnId: "debit",
      creditColumnId: "credit",
      decimalSep: "," as const,
      thousandSep: "." as const,
    };

    // Debit transaction
    const debitResult = parseSplitColumnAmount("350.000,00", "", splitStrategy);
    assert.equal(debitResult, -35000000n);

    // Credit transaction
    const creditResult = parseSplitColumnAmount("", "1.500.000,00", splitStrategy);
    assert.equal(creditResult, 150000000n);

    // Zero / empty
    const zeroResult = parseSplitColumnAmount("", "", splitStrategy);
    assert.equal(zeroResult, 0n);
  });
});

describe("5. Deterministic Transaction Hashing (Phase 1 Matching)", () => {
  test("generates deterministic SHA-256 hash matching Phase 1 spec", async () => {
    const hash1 = await calculateStatementTransactionHash({
      accountId: "acc_bca_101",
      date: "2026-08-01",
      amountInMinorUnits: -5000000n,
      runningBalanceMinorUnits: 125000000n,
      sequenceIndex: 0,
    });

    const hash2 = await calculateStatementTransactionHash({
      accountId: "acc_bca_101",
      date: "2026-08-01",
      amountInMinorUnits: -5000000n,
      runningBalanceMinorUnits: 125000000n,
      sequenceIndex: 0,
    });

    // Idempotent
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
    assert.match(hash1, /^[0-9a-f]{64}$/);

    // Sequence index changes hash to disambiguate identical same-day transactions
    const hashSeq1 = await calculateStatementTransactionHash({
      accountId: "acc_bca_101",
      date: "2026-08-01",
      amountInMinorUnits: -5000000n,
      runningBalanceMinorUnits: 125000000n,
      sequenceIndex: 1,
    });
    assert.notEqual(hash1, hashSeq1);
  });
});

describe("6. Reference Configurations & Statement Parsing Pipelines", () => {
  const bcaConfig = JSON.parse(
    fs.readFileSync(path.resolve("packages/dsl/configs/bca-individual-pdf.json"), "utf8")
  );
  const cimbConfig = JSON.parse(
    fs.readFileSync(path.resolve("packages/dsl/configs/cimb-niaga-pdf.json"), "utf8")
  );
  const bluConfig = JSON.parse(
    fs.readFileSync(path.resolve("packages/dsl/configs/blu-bca-csv.json"), "utf8")
  );

  test("parses BCA multi-line continuation statement rows", async () => {
    // Header line, 1 multi-line transaction (3 rows), and 1 single-line transaction
    const rows: ExtractedRow[] = [
      // Header
      {
        y: 160,
        spans: [{ text: "TANGGAL KETERANGAN CB MUTASI SALDO", x: 50, y: 160, width: 400, height: 10 }],
        rawText: "TANGGAL KETERANGAN CB MUTASI SALDO",
      },
      // Tx 1 Row 1: Start
      {
        y: 200,
        spans: [
          { text: "01/08", x: 40, y: 200, width: 30, height: 10 },
          { text: "TRSF E-BANKING CR", x: 140, y: 200, width: 120, height: 10 },
          { text: "0000", x: 490, y: 200, width: 30, height: 10 },
          { text: "500.000,00", x: 600, y: 200, width: 80, height: 10 },
          { text: "2.500.000,00", x: 820, y: 200, width: 80, height: 10 },
        ],
        rawText: "01/08 TRSF E-BANKING CR 0000 500.000,00 2.500.000,00",
      },
      // Tx 1 Row 2: Continuation 1
      {
        y: 220,
        spans: [{ text: "KE REKENING 9876543210", x: 140, y: 220, width: 150, height: 10 }],
        rawText: "KE REKENING 9876543210",
      },
      // Tx 1 Row 3: Continuation 2
      {
        y: 240,
        spans: [{ text: "BERITA: PEMBAYARAN KURSUS", x: 140, y: 240, width: 160, height: 10 }],
        rawText: "BERITA: PEMBAYARAN KURSUS",
      },
      // Tx 2 Row 1: Debit with trailing DB
      {
        y: 280,
        spans: [
          { text: "02/08", x: 40, y: 280, width: 30, height: 10 },
          { text: "TARIK TUNAI ATM", x: 140, y: 280, width: 100, height: 10 },
          { text: "0000", x: 490, y: 280, width: 30, height: 10 },
          { text: "100.000,00 DB", x: 600, y: 280, width: 90, height: 10 },
          { text: "2.400.000,00", x: 820, y: 280, width: 80, height: 10 },
        ],
        rawText: "02/08 TARIK TUNAI ATM 0000 100.000,00 DB 2.400.000,00",
      },
      // Footer
      {
        y: 930,
        spans: [{ text: "SALDO AWAL MUTASI CR MUTASI DB", x: 50, y: 930, width: 300, height: 10 }],
        rawText: "SALDO AWAL MUTASI CR MUTASI DB",
      },
    ];

    const txs = await parsePdfRows(rows, bcaConfig, "acc_bca_test");
    assert.equal(txs.length, 2);

    // Verify multi-line joined description with \n
    assert.equal(
      txs[0].description,
      "TRSF E-BANKING CR\nKE REKENING 9876543210\nBERITA: PEMBAYARAN KURSUS"
    );
    assert.equal(txs[0].amountMinorUnits, 50000000n); // +500,000.00
    assert.equal(txs[0].runningBalanceMinorUnits, 250000000n);

    // Verify trailing DB marker produces negative minor units
    assert.equal(txs[1].description, "TARIK TUNAI ATM");
    assert.equal(txs[1].amountMinorUnits, -10000000n); // -100,000.00
    assert.equal(txs[1].runningBalanceMinorUnits, 240000000n);
  });

  test("parses CIMB Niaga split column layout", async () => {
    const rows: ExtractedRow[] = [
      {
        y: 170,
        spans: [{ text: "TGL TRANSAKSI TGL EFEKTIF URAIAN DEBET KREDIT SALDO", x: 40, y: 170, width: 500, height: 10 }],
        rawText: "TGL TRANSAKSI TGL EFEKTIF URAIAN DEBET KREDIT SALDO",
      },
      {
        y: 210,
        spans: [
          { text: "15/08/2026", x: 40, y: 210, width: 60, height: 10 },
          { text: "15/08/2026", x: 130, y: 210, width: 60, height: 10 },
          { text: "BIAYA ADMINISTRASI BULANAN", x: 220, y: 210, width: 180, height: 10 },
          { text: "17.500,00", x: 530, y: 210, width: 80, height: 10 }, // Debit
          { text: "1.482.500,00", x: 840, y: 210, width: 80, height: 10 }, // Saldo
        ],
        rawText: "15/08/2026 15/08/2026 BIAYA ADMINISTRASI BULANAN 17.500,00 1.482.500,00",
      },
    ];

    const txs = await parsePdfRows(rows, cimbConfig, "acc_cimb_test");
    assert.equal(txs.length, 1);
    assert.equal(txs[0].date, "2026-08-15");
    assert.equal(txs[0].description, "BIAYA ADMINISTRASI BULANAN");
    assert.equal(txs[0].amountMinorUnits, -1750000n); // -17,500.00
    assert.equal(txs[0].runningBalanceMinorUnits, 148250000n);
  });

  test("parses Blu BCA CSV format streaming rows", async () => {
    const csvContent = [
      "Tanggal Transaksi,Tipe Transaksi,Nominal,Saldo,Keterangan",
      "2026-08-10,QRIS Payment,-25000,975000,Kopi Kenangan",
      "2026-08-11,Transfer Masuk,500000,1475000,Topup Saldo",
    ].join("\n");

    const result = await parserWorkerAPI.parseCsv(csvContent, {
      accountId: "acc_blu_test",
      config: {
        ...bluConfig,
        columns: [
          { id: "date", columnIndex: 0 },
          { id: "description", columnIndex: 4 },
          { id: "type", columnIndex: 1 },
          { id: "amount", columnIndex: 2 },
          { id: "balance", columnIndex: 3 },
        ],
      },
    });

    assert.equal(result.totalTransactions, 2);
    assert.equal(result.transactions[0].date, "2026-08-10");
    assert.equal(result.transactions[0].description, "Kopi Kenangan");
    assert.equal(result.transactions[0].amountMinorUnits, -2500000n);

    assert.equal(result.transactions[1].date, "2026-08-11");
    assert.equal(result.transactions[1].description, "Topup Saldo");
    assert.equal(result.transactions[1].amountMinorUnits, 50000000n);
  });
});

describe("7. Worker API & Lifecycle Management (apps/web/src/workers/parser.worker.ts)", () => {
  const bcaConfig = JSON.parse(
    fs.readFileSync(path.resolve("packages/dsl/configs/bca-individual-pdf.json"), "utf8")
  );
  const cimbConfig = JSON.parse(
    fs.readFileSync(path.resolve("packages/dsl/configs/cimb-niaga-pdf.json"), "utf8")
  );

  test("responds to ping liveness probe", async () => {
    const pong = await parserWorkerAPI.ping();
    assert.equal(pong, "pong");
  });

  test("identifies matching config from statement text sample", () => {
    const bcaSample = "PT BANK CENTRAL ASIA (BCA) TBK REKENING KORAN PERIODE AGUSTUS 2026 TANGGAL KETERANGAN";
    const matchedBca = parserWorkerAPI.identifyConfig(bcaSample, [bcaConfig, cimbConfig]);
    assert.ok(matchedBca);
    assert.equal(matchedBca?.meta.bankId, "bca");

    const cimbSample = "PT BANK CIMB NIAGA TBK MUTASI REKENING LAPORAN BULANAN";
    const matchedCimb = parserWorkerAPI.identifyConfig(cimbSample, [bcaConfig, cimbConfig]);
    assert.ok(matchedCimb);
    assert.equal(matchedCimb?.meta.bankId, "cimb-niaga");

    const unknownSample = "COMPLETELY UNRELATED DOCUMENT TEXT WITHOUT ANY BANK PATTERNS";
    const matchedUnknown = parserWorkerAPI.identifyConfig(unknownSample, [bcaConfig, cimbConfig]);
    assert.equal(matchedUnknown, null);
  });
});
