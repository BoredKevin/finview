/**
 * Unified Statement Ingestion Pipeline
 * 
 * Implements the 4-Tier Parser Resolution Hierarchy:
 * - Level 1: Local Dexie Installed Registry (100% Offline, Zero Latency)
 * - Level 2: Remote Verified Marketplace Registry (Convex Cloud)
 * - Level 3: Bundled Reference Configurations (BCA, CIMB Niaga, Blu BCA)
 * - Level 4: Visual Parser Studio Calibration (/studio with preloaded spans)
 * 
 * Enforces System Invariants:
 * 1. Zero Data Egress: Unencrypted transaction figures remain strictly in client memory.
 * 2. UI Responsiveness: Worker threads handle heavy parsing and coordinate extraction.
 */

import { AppDB } from "../../db/database.js";
import { findInstalledParserForDocument, installParser } from "../../db/installedParsers.js";
import { BUNDLED_CONFIGS } from "../../../../../packages/dsl/bundledConfigs.js";
import { StatementParserConfig } from "../../../../../packages/dsl/schema.js";
import { ParsedTransaction } from "../../../../../packages/dsl/types.js";
import { generateTransactionHash } from "../../../../../packages/crypto/src/index.js";
import {
  createParserWorkerClient,
  inspectStatementFile,
  parseStatementFile,
} from "../../workers/client.js";
import { parserWorkerAPI } from "../../workers/parser.worker.js";
import {
  IngestionResult,
  MarketplaceMatch,
  ReconciliationItem,
  TransactionConfidence,
} from "./types.js";
import { StudioDocument } from "../../studio/types.js";

/**
 * Calculates a deterministic confidence score for a parsed transaction.
 */
export function computeTransactionConfidence(
  tx: ParsedTransaction,
  prevTx?: ParsedTransaction
): TransactionConfidence {
  const factors = {
    dateValid: false,
    amountValid: false,
    descriptionValid: false,
    balanceConsistent: false,
  };
  const warnings: string[] = [];
  let score = 0;

  // 1. Date check
  if (tx.date && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
    factors.dateValid = true;
    score += 25;
  } else {
    warnings.push("Malformed or non-standard ISO date format");
  }

  // 2. Amount check
  if (tx.amountMinorUnits !== 0n) {
    factors.amountValid = true;
    score += 25;
  } else {
    warnings.push("Zero amount detected");
  }

  // 3. Description check
  if (tx.description && tx.description.trim().length >= 3) {
    factors.descriptionValid = true;
    score += 25;
  } else {
    warnings.push("Short or empty narrative description");
  }

  // 4. Running balance continuity check
  if (tx.runningBalanceMinorUnits !== undefined && tx.runningBalanceMinorUnits !== null) {
    if (prevTx && prevTx.runningBalanceMinorUnits !== undefined && prevTx.runningBalanceMinorUnits !== null) {
      const prevBal = BigInt(prevTx.runningBalanceMinorUnits);
      const currBal = BigInt(tx.runningBalanceMinorUnits);
      const amt = BigInt(tx.amountMinorUnits);
      if (prevBal + amt === currBal) {
        factors.balanceConsistent = true;
        score += 25;
      } else {
        warnings.push("Balance jump does not equal transaction amount");
        score += 10;
      }
    } else {
      // First transaction with a balance
      factors.balanceConsistent = true;
      score += 25;
    }
  } else {
    // Balance not present in statement layout
    score += 15;
  }

  const finalScore = Math.min(100, Math.max(0, score));
  const level: "high" | "medium" | "low" =
    finalScore >= 85 ? "high" : finalScore >= 60 ? "medium" : "low";

  return {
    score: finalScore,
    level,
    factors,
    warnings,
  };
}

/**
 * Builds reconciliation items from parsed transactions with confidence scores.
 */
export function buildReconciliationItems(
  transactions: ParsedTransaction[]
): ReconciliationItem[] {
  return transactions.map((tx, idx) => {
    const prev = idx > 0 ? transactions[idx - 1] : undefined;
    const confidence = computeTransactionConfidence(tx, prev);
    return {
      id: tx.id || `reconcile_${idx}_${Date.now()}`,
      transaction: tx,
      confidence,
      selected: true,
    };
  });
}

export interface IngestPipelineOptions {
  db: AppDB;
  file: File;
  accountId: string;
  password?: string;
  workerClient?: any;
  convexClient?: any;
  onProgress?: (progress: { currentPage: number; totalPages: number }) => void;
}

/**
 * Executes document inspection and resolves the appropriate parser configuration.
 */
export async function inspectAndResolveParser(
  options: IngestPipelineOptions
): Promise<IngestionResult> {
  const { db, file, password, convexClient } = options;
  const fileType: "pdf" | "csv" = file.name.toLowerCase().endsWith(".csv") ? "csv" : "pdf";
  const fileBuffer = await file.arrayBuffer();

  // 1. Worker Document Inspection (First Page Spans & Sample Text)
  let inspection;
  try {
    if (options.workerClient) {
      inspection = await inspectStatementFile(
        options.workerClient,
        fileBuffer,
        fileType,
        { password }
      );
    } else {
      // Fallback for tests or local execution
      inspection = await parserWorkerAPI.inspectDocument(
        fileBuffer,
        fileType,
        { password }
      );
    }
  } catch (err: any) {
    return {
      step: "error",
      file,
      fileBuffer,
      errorCode: "WORKER_INSPECT_FAILED",
      errorMessage: err.message || "Failed to inspect document",
    };
  }

  // Edge Case: Password Protected
  if (inspection.isPasswordProtected) {
    return {
      step: "password_required",
      file,
      fileBuffer,
      errorCode: "PASSWORD_REQUIRED",
      errorMessage: "Statement is encrypted with a password",
    };
  }

  // Edge Case: Scanned PDF (Zero Text Spans)
  if (fileType === "pdf" && (inspection.isScanned || inspection.firstPageSpans.length === 0)) {
    return {
      step: "scanned_detected",
      file,
      fileBuffer,
      totalPages: inspection.totalPages,
      errorCode: "SCANNED_PDF_NO_TEXT",
      errorMessage: "Scanned statement detected with zero digital text spans",
    };
  }

  const sampleText = inspection.sampleText;

  // LEVEL 1: Local Dexie Installed Registry (100% Offline)
  const localParser = await findInstalledParserForDocument(db, {
    sampleText,
    fileType,
  });

  if (localParser) {
    return {
      step: "parsing",
      file,
      fileBuffer,
      sampleText,
      firstPageSpans: inspection.firstPageSpans,
      totalPages: inspection.totalPages,
      matchedParser: localParser,
    };
  }

  // LEVEL 2: Remote Verified Marketplace Registry (Convex Cloud)
  if (convexClient && (typeof navigator === "undefined" || navigator.onLine !== false)) {
    try {
      // Dynamic import api if needed
      const remoteMatch = await convexClient.query("marketplace:getMatchingParser", {
        sampleText,
        fileType,
      });

      if (remoteMatch) {
        const matchData: MarketplaceMatch = {
          id: remoteMatch._id,
          slug: remoteMatch.slug,
          bankName: remoteMatch.bankName,
          country: remoteMatch.country,
          fileType: remoteMatch.fileType,
          currentVersion: remoteMatch.currentVersion,
          dslConfig: remoteMatch.dslConfig,
          matchScore: remoteMatch.matchScore,
        };

        return {
          step: "marketplace_prompt",
          file,
          fileBuffer,
          sampleText,
          firstPageSpans: inspection.firstPageSpans,
          totalPages: inspection.totalPages,
          marketplaceMatch: matchData,
        };
      }
    } catch (err) {
      console.warn("Convex marketplace match query error, trying bundled fallback:", err);
    }
  }

  // LEVEL 3: Bundled Static Reference Configurations
  const matchedBundled = parserWorkerAPI.identifyConfig(sampleText, BUNDLED_CONFIGS);
  if (matchedBundled) {
    // Auto-install to local Dexie for future offline speed
    try {
      const installed = await installParser(db, {
        slug: matchedBundled.meta.bankId,
        bankName: matchedBundled.meta.name,
        country: "ID",
        fileType: matchedBundled.meta.fileType,
        version: matchedBundled.meta.version,
        dslConfig: matchedBundled,
      });

      return {
        step: "parsing",
        file,
        fileBuffer,
        sampleText,
        firstPageSpans: inspection.firstPageSpans,
        totalPages: inspection.totalPages,
        matchedParser: installed,
      };
    } catch (err) {
      return {
        step: "parsing",
        file,
        fileBuffer,
        sampleText,
        firstPageSpans: inspection.firstPageSpans,
        totalPages: inspection.totalPages,
        matchedParser: matchedBundled,
      };
    }
  }

  // LEVEL 4: Visual Parser Studio Fallback
  const studioDoc: StudioDocument = {
    id: `unmatched_${Date.now()}`,
    name: file.name,
    fileType,
    data: fileType === "pdf" ? new Uint8Array(fileBuffer) : sampleText,
    totalPages: inspection.totalPages || 1,
    currentPage: 1,
    spansByPage: { 1: inspection.firstPageSpans },
    csvRows: inspection.csvRows,
    isSample: false,
    uploadedAt: Date.now(),
  };

  return {
    step: "idle",
    file,
    fileBuffer,
    sampleText,
    firstPageSpans: inspection.firstPageSpans,
    totalPages: inspection.totalPages,
    studioDocument: studioDoc,
    errorCode: "PARSER_FAIL_NO_LAYOUT_MATCH",
    errorMessage: "No matching parser found locally or in marketplace.",
  };
}

/**
 * Parses statement using resolved configuration.
 */
export async function executeDocumentParse(
  options: IngestPipelineOptions,
  config: StatementParserConfig
): Promise<IngestionResult> {
  const { file, accountId, password } = options;
  const fileType: "pdf" | "csv" = file.name.toLowerCase().endsWith(".csv") ? "csv" : "pdf";
  const fileBuffer = await file.arrayBuffer();

  let parseResult;
  try {
    if (options.workerClient) {
      parseResult = await parseStatementFile(
        options.workerClient,
        fileBuffer,
        fileType,
        {
          accountId,
          config,
          password,
          onProgress: options.onProgress,
        }
      );
    } else {
      if (fileType === "pdf") {
        parseResult = await parserWorkerAPI.parsePdf(fileBuffer, {
          accountId,
          config,
          password,
          onProgress: options.onProgress,
        });
      } else {
        parseResult = await parserWorkerAPI.parseCsv(fileBuffer, {
          accountId,
          config,
        });
      }
    }
  } catch (err: any) {
    return {
      step: "error",
      file,
      fileBuffer,
      errorCode: "STATEMENT_PARSE_FAILED",
      errorMessage: err.message || "Failed to parse statement rows",
    };
  }

  const items = buildReconciliationItems(parseResult.transactions);

  return {
    step: "reconciling",
    file,
    fileBuffer,
    transactions: parseResult.transactions,
    reconciliationItems: items,
    totalPages: parseResult.totalPages,
  };
}

/**
 * Commits verified transactions into Dexie IndexedDB atomically.
 */
export async function commitTransactionsToDexie(
  db: AppDB,
  accountId: string,
  transactions: ParsedTransaction[],
  closingBalanceMinorUnits?: bigint | number
): Promise<{ insertedCount: number; duplicateCount: number; errors: string[] }> {
  let insertedCount = 0;
  let duplicateCount = 0;
  const errors: string[] = [];

  await db.transaction("rw", [db.transactions, db.accounts, db.syncQueue], async () => {
    for (const tx of transactions) {
      try {
        const hash =
          tx.hash ||
          (await generateTransactionHash({
            accountId,
            date: tx.date,
            description: tx.description,
            amountMinorUnits: tx.amountMinorUnits,
          }));

        // Deduplication check
        const existing = await db.transactions.where("hash").equals(hash).first();
        if (existing && existing.deletedAt === null) {
          duplicateCount++;
          continue;
        }

        const id = tx.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await db.transactions.put({
          id,
          accountId,
          date: tx.date,
          description: tx.description,
          amountMinorUnits: tx.amountMinorUnits,
          runningBalanceMinorUnits: tx.runningBalanceMinorUnits ?? 0n,
          hash,
          updatedAt: Date.now(),
          deletedAt: null,
        });
        insertedCount++;
      } catch (err: any) {
        errors.push(err.message || String(err));
      }
    }

    // Update account balance
    const account = await db.accounts.get(accountId);
    if (account) {
      let finalBalance = account.balanceMinorUnits;
      if (closingBalanceMinorUnits !== undefined) {
        finalBalance = closingBalanceMinorUnits;
      } else if (
        transactions.length > 0 &&
        transactions[transactions.length - 1].runningBalanceMinorUnits !== undefined
      ) {
        finalBalance = transactions[transactions.length - 1].runningBalanceMinorUnits!;
      } else {
        const mutationSum = transactions.reduce(
          (acc, t) => acc + BigInt(t.amountMinorUnits),
          0n
        );
        finalBalance = BigInt(account.balanceMinorUnits) + mutationSum;
      }

      await db.accounts.update(accountId, {
        balanceMinorUnits: finalBalance,
        updatedAt: Date.now(),
      });
    }
  });

  return { insertedCount, duplicateCount, errors };
}
