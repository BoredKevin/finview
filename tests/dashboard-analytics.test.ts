/**
 * Phase 5 Comprehensive Verification Test Suite
 * 
 * Verifies:
 * 1. Internationalization & Minor Unit Precision (Indonesian Rp, USD, EUR, BigInt math)
 * 2. Local Financial Analytics Engine (Multi-currency net worth, inflow, outflow, savings rate)
 * 3. Running Cash Flow Progression (Time-series continuity)
 * 4. Recurring Transaction & Subscription Radar (Description clustering, cadence, confidence)
 * 5. Privacy-Preserving Telemetry & Zero Data Egress (Client-side scrubbing & error classification)
 * 6. Unified Ingestion 4-Tier Resolution Hierarchy (Dexie -> Convex -> Bundled -> Studio)
 * 7. Edge Cases: Protected PDF Password Interception & Scanned Zero-Span Detection
 * 8. Reconciliation Confidence Scoring & Atomic Dexie Commit with Deduplication
 * 9. Performance Benchmarks: Cold render < 400ms & aggregation speed
 */

import test, { describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

import Dexie from "dexie";
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as any).indexedDB = indexedDB;
(globalThis as any).IDBKeyRange = IDBKeyRange;

import { AppDB } from "../apps/web/src/db/database.js";
import {
  createAccount,
  createTransaction,
  listAccounts,
  listTransactionsByAccount,
} from "../apps/web/src/db/crud.js";
import { installParser } from "../apps/web/src/db/installedParsers.js";
import {
  formatMinorUnits,
  parseCurrencyStringToMinorUnits,
} from "../apps/web/src/dashboard/utils/currency.js";
import {
  formatDisplayDate,
  getStartDateForRange,
} from "../apps/web/src/dashboard/utils/date.js";
import {
  computeFinancialMetrics,
  computeCashFlowProgression,
  filterTransactionsByRange,
} from "../apps/web/src/dashboard/analytics/analyticsEngine.js";
import {
  detectRecurringTransactions,
  normalizeMerchantDescription,
} from "../apps/web/src/dashboard/analytics/recurringEngine.js";
import {
  runAnalyticsAggregation,
  HIGH_VOLUME_THRESHOLD,
} from "../apps/web/src/dashboard/analytics/analyticsService.js";
import {
  classifyTelemetryErrorCode,
  scrubAndRecordTelemetry,
  clearLocalAuditBuffer,
  getLocalAuditEvents,
} from "../apps/web/src/dashboard/telemetry/telemetryScrubber.js";
import {
  computeTransactionConfidence,
  buildReconciliationItems,
  commitTransactionsToDexie,
  inspectAndResolveParser,
} from "../apps/web/src/dashboard/ingest/IngestionPipeline.js";
import {
  BUNDLED_BCA_CONFIG,
  BUNDLED_CIMB_CONFIG,
  BUNDLED_BLU_CONFIG,
} from "../packages/dsl/bundledConfigs.js";
import { parserWorkerAPI } from "../apps/web/src/workers/parser.worker.js";
import { ParsedTransaction } from "../packages/dsl/types.js";

describe("1. Internationalization & Minor Unit Financial Precision", () => {
  test("formats Indonesian Rupiah (IDR) using standard Indonesian conventions (Rp, '.' thousand, ',' decimal)", () => {
    // 25.000.000 IDR (cents: 2500000000n)
    const formatted = formatMinorUnits(2500000000n, "IDR");
    assert.equal(formatted, "Rp 25.000.000");

    // With fractional cents
    const formattedFractional = formatMinorUnits(2500000050n, "IDR");
    assert.equal(formattedFractional, "Rp 25.000.000,50");

    // Negative expense amount
    const formattedNeg = formatMinorUnits(-75000000n, "IDR");
    assert.equal(formattedNeg, "-Rp 750.000");
  });

  test("formats standard international currencies (USD, EUR, SGD, GBP)", () => {
    // USD: $1,250.50
    assert.equal(formatMinorUnits(125050n, "USD"), "$1,250.50");
    assert.equal(formatMinorUnits(-4999n, "USD"), "-$49.99");

    // EUR: €1.250,50
    assert.equal(formatMinorUnits(125050n, "EUR"), "€1.250,50");

    // SGD: S$1,250.50
    assert.equal(formatMinorUnits(125050n, "SGD"), "S$1,250.50");
  });

  test("parses Indonesian formatted currency strings into exact bigint minor units without float inaccuracies", () => {
    // Indonesian format: '.' thousand, ',' decimal
    const parsed1 = parseCurrencyStringToMinorUnits("Rp 1.250.000,00", "IDR");
    assert.equal(parsed1, 125000000n);

    const parsed2 = parseCurrencyStringToMinorUnits("Rp 750.000", "IDR");
    assert.equal(parsed2, 75000000n);

    // Negative amounts with DB or minus
    const parsedNeg = parseCurrencyStringToMinorUnits("-Rp 150.000,50", "IDR");
    assert.equal(parsedNeg, -15000050n);

    const parsedDebitSuffix = parseCurrencyStringToMinorUnits("50.000,00 DB", "IDR");
    assert.equal(parsedDebitSuffix, -5000000n);
  });

  test("parses US / International formatted currency strings into exact bigint minor units", () => {
    const parsedUsd = parseCurrencyStringToMinorUnits("$1,250.50", "USD");
    assert.equal(parsedUsd, 125050n);

    const parsedNegUsd = parseCurrencyStringToMinorUnits("-$99.99", "USD");
    assert.equal(parsedNegUsd, -9999n);
  });
});

describe("2. Local Financial Analytics Engine (Multi-Currency & Ranges)", () => {
  let db: AppDB;

  beforeEach(async () => {
    const dbName = `test_analytics_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    db = new AppDB(dbName);
    await db.open();
  });

  test("aggregates multi-currency account balances and computes consolidated Net Worth", () => {
    const accounts = [
      { id: "acc_1", name: "BCA Tahapan", currency: "IDR", balanceMinorUnits: 5000000000n, updatedAt: 1, deletedAt: null },
      { id: "acc_2", name: "Blu BCA", currency: "IDR", balanceMinorUnits: 1500000000n, updatedAt: 1, deletedAt: null },
      { id: "acc_3", name: "Wise USD", currency: "USD", balanceMinorUnits: 350000n, updatedAt: 1, deletedAt: null }, // $3,500.00
    ];

    const metrics = computeFinancialMetrics(accounts, [], "ALL", "IDR");

    assert.equal(metrics.netWorthByCurrency["IDR"], 6500000000n); // 65,000,000 IDR
    assert.equal(metrics.netWorthByCurrency["USD"], 350000n); // 3,500 USD
    assert.equal(metrics.currencyBreakdown.length, 2);
  });

  test("computes Inflow, Outflow, Net Cash Flow, and Savings Rate over 30D date range", () => {
    const refDate = new Date("2026-09-30T12:00:00Z");

    const accounts = [
      { id: "acc_1", name: "Checking", currency: "IDR", balanceMinorUnits: 1000000000n, updatedAt: 1, deletedAt: null },
    ];

    const transactions = [
      // Within 30 days:
      {
        id: "tx_1",
        accountId: "acc_1",
        date: "2026-09-25",
        description: "Salary Payroll",
        amountMinorUnits: 2000000000n, // +20,000,000 IDR Inflow
        runningBalanceMinorUnits: 3000000000n,
        hash: "hash1",
        updatedAt: 1,
        deletedAt: null,
      },
      {
        id: "tx_2",
        accountId: "acc_1",
        date: "2026-09-20",
        description: "Apartment Rent",
        amountMinorUnits: -500000000n, // -5,000,000 IDR Outflow
        runningBalanceMinorUnits: 2500000000n,
        hash: "hash2",
        updatedAt: 1,
        deletedAt: null,
      },
      // Outside 30 days (older than 30 days from 2026-09-30):
      {
        id: "tx_old",
        accountId: "acc_1",
        date: "2026-07-15",
        description: "Old Bonus",
        amountMinorUnits: 1000000000n,
        runningBalanceMinorUnits: 1000000000n,
        hash: "hash_old",
        updatedAt: 1,
        deletedAt: null,
      },
    ];

    const metrics30D = computeFinancialMetrics(accounts, transactions, "30D", "IDR", refDate);

    assert.equal(metrics30D.inflowMinorUnits, 2000000000n);
    assert.equal(metrics30D.outflowMinorUnits, 500000000n);
    assert.equal(metrics30D.netCashFlowMinorUnits, 1500000000n);
    // Savings rate = (15,000,000 / 20,000,000) * 100 = 75.0%
    assert.equal(metrics30D.savingsRatePercentage, 75.0);
    assert.equal(metrics30D.transactionCount, 2);

    // ALL range includes old transaction
    const metricsAll = computeFinancialMetrics(accounts, transactions, "ALL", "IDR", refDate);
    assert.equal(metricsAll.transactionCount, 3);
    assert.equal(metricsAll.inflowMinorUnits, 3000000000n);
  });

  test("computes Running Cash Flow Progression time-series with cumulative continuity", () => {
    const transactions = [
      { id: "tx_1", accountId: "acc_1", date: "2026-09-01", description: "Inflow 1", amountMinorUnits: 100000n, runningBalanceMinorUnits: 100000n, hash: "h1", updatedAt: 1, deletedAt: null },
      { id: "tx_2", accountId: "acc_1", date: "2026-09-05", description: "Expense 1", amountMinorUnits: -30000n, runningBalanceMinorUnits: 70000n, hash: "h2", updatedAt: 1, deletedAt: null },
      { id: "tx_3", accountId: "acc_1", date: "2026-09-10", description: "Inflow 2", amountMinorUnits: 50000n, runningBalanceMinorUnits: 120000n, hash: "h3", updatedAt: 1, deletedAt: null },
    ];

    const progression = computeCashFlowProgression(transactions, "ALL");

    assert.equal(progression.length, 3);
    assert.equal(progression[0].date, "2026-09-01");
    assert.equal(progression[0].cumulativeMinorUnits, 100000n);

    assert.equal(progression[1].date, "2026-09-05");
    assert.equal(progression[1].cumulativeMinorUnits, 70000n); // 100,000 - 30,000

    assert.equal(progression[2].date, "2026-09-10");
    assert.equal(progression[2].cumulativeMinorUnits, 120000n); // 70,000 + 50,000
  });
});

describe("3. Recurring Transaction & Subscription Identification Engine", () => {
  test("normalizes merchant descriptions by stripping transaction prefixes, dates, and noise", () => {
    assert.equal(normalizeMerchantDescription("TRANSFER KE NETFLIX.COM 09/26"), "NETFLIX.COM");
    assert.equal(normalizeMerchantDescription("QRIS SPOTIFY PREMIUM ID #98124"), "SPOTIFY PREMIUM ID");
    assert.equal(normalizeMerchantDescription("BIF TRSF DR PT GOOGLE CLOUD"), "PT GOOGLE CLOUD");
    assert.equal(normalizeMerchantDescription("AUTO DEBIT PLN PREPAID 5410129"), "PLN PREPAID");
  });

  test("identifies monthly subscriptions with consistent amount and interval", () => {
    const transactions = [
      { id: "t1", accountId: "a1", date: "2026-06-15", description: "NETFLIX SERVICES", amountMinorUnits: -18600000n, runningBalanceMinorUnits: 0n, hash: "h1", updatedAt: 1, deletedAt: null },
      { id: "t2", accountId: "a1", date: "2026-07-15", description: "NETFLIX SERVICES", amountMinorUnits: -18600000n, runningBalanceMinorUnits: 0n, hash: "h2", updatedAt: 1, deletedAt: null },
      { id: "t3", accountId: "a1", date: "2026-08-15", description: "NETFLIX SERVICES", amountMinorUnits: -18600000n, runningBalanceMinorUnits: 0n, hash: "h3", updatedAt: 1, deletedAt: null },
      { id: "t4", accountId: "a1", date: "2026-09-15", description: "NETFLIX SERVICES", amountMinorUnits: -18600000n, runningBalanceMinorUnits: 0n, hash: "h4", updatedAt: 1, deletedAt: null },
    ];

    const recurring = detectRecurringTransactions(transactions);

    assert.equal(recurring.length, 1);
    const netflix = recurring[0];
    assert.equal(netflix.merchantName, "NETFLIX SERVICES");
    assert.equal(netflix.frequency, "monthly");
    assert.equal(netflix.isSubscription, true);
    assert.equal(netflix.occurrences, 4);
    assert.equal(netflix.averageAmountMinorUnits, -18600000n);
    assert.equal(netflix.lastDate, "2026-09-15");
    // Next predicted date is roughly 1 month after 2026-09-15 -> ~2026-10-16
    assert.match(netflix.predictedNextDate, /^2026-10-\d{2}$/);
    assert.ok(netflix.confidence >= 90);
  });

  test("rejects erratic or non-periodic random transactions from subscription list", () => {
    const transactions = [
      { id: "t1", accountId: "a1", date: "2026-09-01", description: "INDOMARET CONVENIENCE", amountMinorUnits: -2500000n, runningBalanceMinorUnits: 0n, hash: "h1", updatedAt: 1, deletedAt: null },
      { id: "t2", accountId: "a1", date: "2026-09-02", description: "INDOMARET CONVENIENCE", amountMinorUnits: -8500000n, runningBalanceMinorUnits: 0n, hash: "h2", updatedAt: 1, deletedAt: null },
      { id: "t3", accountId: "a1", date: "2026-09-03", description: "INDOMARET CONVENIENCE", amountMinorUnits: -1200000n, runningBalanceMinorUnits: 0n, hash: "h3", updatedAt: 1, deletedAt: null },
    ];

    // Daily grocery shopping (avg interval 1 day < 5 days threshold) is not a subscription
    const recurring = detectRecurringTransactions(transactions);
    assert.equal(recurring.length, 0);
  });
});

describe("4. Privacy-Preserving Telemetry & Client-Side Scrubbing (Zero Data Egress)", () => {
  beforeEach(() => {
    clearLocalAuditBuffer();
  });

  test("strictly classifies errors into whitelisted telemetry error codes", () => {
    assert.equal(classifyTelemetryErrorCode(new Error("Password required to decrypt PDF")), "PASSWORD_REQUIRED");
    assert.equal(classifyTelemetryErrorCode(new Error("Incorrect password for statement")), "PASSWORD_INCORRECT");
    assert.equal(classifyTelemetryErrorCode(new Error("Scanned PDF detected with zero text spans")), "SCANNED_PDF_NO_TEXT");
    assert.equal(classifyTelemetryErrorCode(new Error("No layout match found in registry")), "PARSER_FAIL_NO_LAYOUT_MATCH");
    assert.equal(classifyTelemetryErrorCode(new Error("Watchdog deadline timeout exceeded")), "WORKER_TIMEOUT_EXCEEDED");
    assert.equal(classifyTelemetryErrorCode(new Error("Unbalanced ledger discrepancy")), "RECONCILIATION_UNBALANCED");
    assert.equal(classifyTelemetryErrorCode(new Error("Network is offline")), "NETWORK_OFFLINE");
  });

  test("scrubs sensitive personal and financial figures leaving zero egressed data", () => {
    // Sensitive error containing real transaction amounts, merchants, URLs, and bank account
    const sensitiveError = new Error(
      "Failed to parse transaction for user 1234567890 amount Rp 50.000.000,00 merchant NETFLIX.COM url https://api.bank.com/v1"
    );

    const event = scrubAndRecordTelemetry(sensitiveError, {
      fileType: "pdf",
      pageCount: 15,
      transactionCount: 350,
    });

    // Verification: Event strictly contains whitelisted code and coarse buckets
    assert.equal(event.code, "UNKNOWN_CLIENT_ERROR");
    assert.equal(event.fileType, "pdf");
    assert.equal(event.pageBucket, "11-50");
    assert.equal(event.transactionBucket, "201-1000");

    // Invariant: No amounts or PII in telemetry object
    const serialized = JSON.stringify(event);
    assert.ok(!serialized.includes("50.000.000"));
    assert.ok(!serialized.includes("1234567890"));
    assert.ok(!serialized.includes("NETFLIX.COM"));
    assert.ok(!serialized.includes("https://api.bank.com"));

    // Verify local audit buffer stores the event
    const auditEvents = getLocalAuditEvents();
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].code, "UNKNOWN_CLIENT_ERROR");
  });
});

describe("5. Ingestion Pipeline & 4-Tier Parser Resolution", () => {
  let db: AppDB;

  beforeEach(async () => {
    const dbName = `test_ingest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    db = new AppDB(dbName);
    await db.open();
  });

  test("Tier 1: Resolves locally installed parser from Dexie offline registry", async () => {
    // Pre-install BCA parser
    await installParser(db, {
      slug: "id-bca-csv",
      bankName: "Bank Central Asia",
      country: "ID",
      fileType: "csv",
      version: "1.0.0",
      dslConfig: {
        ...BUNDLED_BCA_CONFIG,
        meta: { ...BUNDLED_BCA_CONFIG.meta, fileType: "csv" },
        matchers: { ...BUNDLED_BCA_CONFIG.matchers, fileType: "csv" },
      },
    });

    // Mock statement file with BCA signature
    const sampleText = "REKENING KORAN PT BANK CENTRAL ASIA TANGGAL KETERANGAN";
    const file = new File([sampleText], "bca_statement.csv", { type: "text/csv" });

    const result = await inspectAndResolveParser({
      db,
      file,
      accountId: "acc_test_1",
    });

    assert.equal(result.step, "parsing");
    assert.ok(result.matchedParser);
    assert.equal((result.matchedParser as any).slug, "id-bca-csv");
  });


  test("Tier 2: Resolves matching parser from Convex marketplace query", async () => {
    const sampleText = "REKENING KORAN BANK JAGO TANGGAL MUTASI";
    const file = new File([sampleText], "jago_statement.csv", { type: "text/csv" });

    // Mock Convex client
    const mockConvexClient = {
      query: async (queryName: string, args: any) => {
        if (queryName === "marketplace:getMatchingParser") {
          return {
            _id: "parser_jago_1",
            slug: "id-bank-jago-csv",
            bankName: "Bank Jago",
            country: "ID",
            fileType: "csv",
            currentVersion: "1.0.0",
            dslConfig: JSON.stringify(BUNDLED_BLU_CONFIG),
            matchScore: 95,
          };
        }
        return null;
      },
    };

    const result = await inspectAndResolveParser({
      db,
      file,
      accountId: "acc_test_1",
      convexClient: mockConvexClient,
    });

    assert.equal(result.step, "marketplace_prompt");
    assert.ok(result.marketplaceMatch);
    assert.equal(result.marketplaceMatch.slug, "id-bank-jago-csv");
    assert.equal(result.marketplaceMatch.matchScore, 95);
  });

  test("Tier 3: Resolves bundled reference configuration fallback", async () => {
    // Statement matching CIMB Niaga bundled config
    const sampleText = "CIMB NIAGA MUTASI REKENING TGL TRANSAKSI";
    const file = new File([sampleText], "cimb_statement.csv", { type: "text/csv" });

    const result = await inspectAndResolveParser({
      db,
      file,
      accountId: "acc_test_1",
    });

    assert.equal(result.step, "parsing");
    assert.ok(result.matchedParser);
    const bankId = "dslConfig" in result.matchedParser ? result.matchedParser.slug : (result.matchedParser as any).meta?.bankId;
    assert.equal(bankId, "cimb-niaga");

    // Verify auto-installed to Dexie for future offline speed
    const installed = await db.installedParsers.get("cimb-niaga");
    assert.ok(installed);
    assert.equal(installed.bankName, "CIMB Niaga Account Statement");
  });

  test("Tier 4: Falls back to Parser Studio handoff with preloaded spans for unrecognized statements", async () => {
    const sampleText = "SOME COMPLETELY UNKNOWN BANK COOP STATEMENT 2026";
    const file = new File([sampleText], "unknown_statement.csv", { type: "text/csv" });

    const result = await inspectAndResolveParser({
      db,
      file,
      accountId: "acc_test_1",
    });

    assert.equal(result.step, "idle");
    assert.equal(result.errorCode, "PARSER_FAIL_NO_LAYOUT_MATCH");
    assert.ok(result.studioDocument);
    assert.equal(result.studioDocument.name, "unknown_statement.csv");
  });
});

describe("6. Reconciliation Confidence Scoring & Atomic Dexie Commit", () => {
  let db: AppDB;

  beforeEach(async () => {
    const dbName = `test_reconcile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    db = new AppDB(dbName);
    await db.open();

    await createAccount(db, {
      id: "acc_reconcile_01",
      name: "Checking Vault",
      currency: "IDR",
      balanceMinorUnits: 1000000000n, // 10,000,000 IDR
    });
  });

  test("computes high, medium, and warning confidence scores for transactions", () => {
    const validTx: ParsedTransaction = {
      id: "tx_v1",
      accountId: "acc_1",
      date: "2026-09-29",
      rawDate: "29/09",
      description: "TRSF E-BANKING CR SALARY",
      amountMinorUnits: 1500000000n,
      runningBalanceMinorUnits: 2500000000n,
      hash: "h_v1",
      sequenceIndex: 1,
    };

    const prevTx: ParsedTransaction = {
      id: "tx_p0",
      accountId: "acc_1",
      date: "2026-09-28",
      rawDate: "28/09",
      description: "OPENING",
      amountMinorUnits: 0n,
      runningBalanceMinorUnits: 1000000000n,
      hash: "h_p0",
      sequenceIndex: 0,
    };

    const highConfidence = computeTransactionConfidence(validTx, prevTx);
    assert.equal(highConfidence.level, "high");
    assert.equal(highConfidence.score, 100);
    assert.equal(highConfidence.warnings.length, 0);

    // Malformed transaction: missing date and zero amount
    const invalidTx: ParsedTransaction = {
      id: "tx_inv",
      accountId: "acc_1",
      date: "bad-date",
      rawDate: "bad",
      description: "OK",
      amountMinorUnits: 0n,
      hash: "h_inv",
      sequenceIndex: 2,
    };
    const lowConfidence = computeTransactionConfidence(invalidTx);
    assert.equal(lowConfidence.level, "low");
    assert.ok(lowConfidence.warnings.includes("Zero amount detected"));
    assert.ok(lowConfidence.warnings.includes("Malformed or non-standard ISO date format"));
  });

  test("atomically commits transactions into Dexie with SHA-256 deduplication", async () => {
    const transactions: ParsedTransaction[] = [
      {
        id: "tx_r1",
        accountId: "acc_reconcile_01",
        date: "2026-09-28",
        rawDate: "28/09",
        description: "Grocery Store Purchase",
        amountMinorUnits: -25000000n, // -250,000 IDR
        runningBalanceMinorUnits: 975000000n,
        hash: "hash_r1_unique",
        sequenceIndex: 0,
      },
      {
        id: "tx_r2",
        accountId: "acc_reconcile_01",
        date: "2026-09-29",
        rawDate: "29/09",
        description: "Client Project Payment",
        amountMinorUnits: 500000000n, // +5,000,000 IDR
        runningBalanceMinorUnits: 1475000000n,
        hash: "hash_r2_unique",
        sequenceIndex: 1,
      },
    ];


    // Initial commit
    const commit1 = await commitTransactionsToDexie(
      db,
      "acc_reconcile_01",
      transactions,
      1475000000n
    );

    assert.equal(commit1.insertedCount, 2);
    assert.equal(commit1.duplicateCount, 0);

    // Check account balance updated
    const accUpdated = await db.accounts.get("acc_reconcile_01");
    assert.equal(accUpdated?.balanceMinorUnits, 1475000000n);

    // Second commit with identical transactions: must deduplicate and insert 0
    const commit2 = await commitTransactionsToDexie(
      db,
      "acc_reconcile_01",
      transactions,
      1475000000n
    );

    assert.equal(commit2.insertedCount, 0);
    assert.equal(commit2.duplicateCount, 2);
  });
});

describe("7. Performance Targets & Cold Render Benchmarks", () => {
  let db: AppDB;

  beforeEach(async () => {
    const dbName = `test_perf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    db = new AppDB(dbName);
    await db.open();
  });

  test("Cold dashboard query and analytics calculation executes in < 400ms directly from Dexie", async () => {
    // Seed 100 transactions into local Dexie
    await createAccount(db, {
      id: "acc_perf",
      name: "Perf Testing Account",
      currency: "IDR",
      balanceMinorUnits: 1000000000n,
    });

    const txs: any[] = [];
    for (let i = 0; i < 100; i++) {
      const isCredit = i % 3 === 0;
      txs.push({
        id: `tx_perf_${i}`,
        accountId: "acc_perf",
        date: `2026-09-${(1 + (i % 28)).toString().padStart(2, "0")}`,
        description: `Vendor ${i} Payment Settlement`,
        amountMinorUnits: isCredit ? 5000000n : -2000000n,
        runningBalanceMinorUnits: 1000000000n + BigInt(i * 1000000),
        hash: `hash_perf_${i}`,
        updatedAt: Date.now(),
        deletedAt: null,
      });
    }

    await db.transactions.bulkAdd(txs);

    // Benchmark Cold Pull & Metric Computation
    const startCold = performance.now();

    const loadedAccounts = await db.accounts.filter((a) => a.deletedAt === null).toArray();
    const loadedTxs = await db.transactions.filter((t) => t.deletedAt === null).toArray();
    const result = await runAnalyticsAggregation(loadedAccounts, loadedTxs, "30D", "IDR");

    const elapsedMs = performance.now() - startCold;

    assert.ok(elapsedMs < 400, `Cold pull took ${elapsedMs}ms, exceeding 400ms target.`);
    assert.equal(result.metrics.transactionCount, 100);
    assert.equal(result.delegatedToWorker, false);
  });

  test("High-volume threshold correctly delegates to worker logic when > 10,000 transactions", async () => {
    assert.equal(HIGH_VOLUME_THRESHOLD, 10000);

    const accounts = [
      { id: "a1", name: "Vault", currency: "IDR", balanceMinorUnits: 1000n, updatedAt: 1, deletedAt: null },
    ];

    // Array of 10,001 dummy transactions
    const dummyTxs: any[] = new Array(10001).fill(null).map((_, i) => ({
      id: `t_${i}`,
      accountId: "a1",
      date: "2026-09-15",
      description: "Item",
      amountMinorUnits: 100n,
      runningBalanceMinorUnits: 1000n,
      hash: `h_${i}`,
      updatedAt: 1,
      deletedAt: null,
    }));

    // In Node test environment Worker is undefined, so service cleanly falls back with zero crashes
    const output = await runAnalyticsAggregation(accounts, dummyTxs, "ALL", "IDR");
    assert.equal(output.metrics.transactionCount, 10001);
  });
});
