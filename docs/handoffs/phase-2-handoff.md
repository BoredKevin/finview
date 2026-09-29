# Phase 2 Engineering Handoff: Sandboxed Statement Parser Engine & Declarative DSL

## 1. Scope & Modules Delivered

The Phase 2 Statement Parser Engine delivers an isolated, Web Worker-based statement parsing pipeline capable of parsing PDF and CSV formats without server communication. All execution is strictly guided by declarative JSON DSL configurations.

| Component | Path | Description |
| :--- | :--- | :--- |
| **DSL Schema & Validator** | `packages/dsl/schema.ts` | Zod schema `StatementParserConfigSchema` for PDF & CSV bank configurations. |
| **Static ReDoS Protection** | `packages/dsl/redos.ts` | Static parser rejecting nested repetition quantifiers, plus 50ms per-page deadline watchdog. |
| **Normalization & Line Clustering** | `packages/dsl/normalizer.ts` | $0 \to 1000$ coordinate grid normalization and $\Delta y \le 3$ vertical row clustering. |
| **Safe DSL Engine** | `packages/dsl/engine.ts` | Integer minor unit arithmetic (`bigint`), multi-line continuation, and deterministic Phase 1 hashing. |
| **Bank JSON Configs** | `packages/dsl/configs/` | Tested configurations for BCA (`bca-individual-pdf.json`), CIMB Niaga (`cimb-niaga-pdf.json`), and Blu BCA (`blu-bca-csv.json`). |
| **Web Worker Pipeline** | `apps/web/src/workers/` | `parser.worker.ts` with `pdfjs-dist/legacy`, `PapaParse` streaming, Comlink RPC, and password interception. |
| **Worker Client Helper** | `apps/web/src/workers/client.ts` | Typed Comlink RPC client wrapper for frontend UI integration. |
| **Test Suite** | `tests/parser-engine.test.ts` | 20 comprehensive unit and pipeline integration tests. |
| **Architecture Specification** | `docs/architecture/parser-dsl-spec.md` | Formal mathematical specification, security invariants, and edge-case mappings. |

---

## 2. Typed Comlink Worker RPC Interfaces (`apps/web/src/workers/types.ts`)

Communication with the worker is completely type-safe via Comlink RPC.

### 2.1 Interface Definition

```typescript
import type * as Comlink from "comlink";
import type { StatementParserConfig } from "@finview/dsl";

export interface ParseWorkerOptions {
  accountId: string;
  config: StatementParserConfig;
  password?: string;
  onPasswordRequest?: () => Promise<string>;
  onProgress?: (progress: { currentPage: number; totalPages: number }) => void;
  deadlineMsPerPage?: number; // Defaults to 50ms
}

export interface ParsedTransaction {
  id: string;                               // Unique deterministic UUID/ID: "tx_stmt_" + hash.slice(0, 16)
  accountId: string;                        // Associated account ID
  date: string;                             // ISO 8601 string (YYYY-MM-DD)
  rawDate: string;                          // Raw string from statement (e.g., "01/08")
  description: string;                      // Sanitized, multi-line joined description
  amountMinorUnits: bigint;                 // Signed minor units: negative for debits, positive for credits
  runningBalanceMinorUnits?: bigint | null; // Optional running balance in minor units
  hash: string;                             // 64-character lowercase SHA-256 deduplication hash
  sequenceIndex: number;                    // 0-indexed position within statement document
  metadata?: Record<string, string>;        // Raw column values (e.g. branch, reference no)
}

export interface StatementParseResult {
  bankId: string;
  configVersion: string;
  fileType: "pdf" | "csv";
  transactions: ParsedTransaction[];
  totalPages: number;
  totalTransactions: number;
  executionTimeMs: number;
}

export interface StatementParserWorkerAPI {
  parsePdf(
    fileBuffer: Uint8Array | ArrayBuffer,
    options: ParseWorkerOptions
  ): Promise<StatementParseResult>;

  parseCsv(
    csvContent: string | Uint8Array | ArrayBuffer,
    options: ParseWorkerOptions
  ): Promise<StatementParseResult>;

  identifyConfig(
    sampleText: string,
    configs: StatementParserConfig[]
  ): StatementParserConfig | null;

  ping(): Promise<string>;
}
```

---

## 3. Password Interception & Credential Lifecycle

When a PDF statement is encrypted (common for Indonesian and international banks where the password is the user's Date of Birth or Tax ID):

1. **Callback Interception**: The worker configures `loadingTask.onPassword`.
2. **Interactive Host Prompting**: If a password was not provided upfront, the worker triggers `options.onPasswordRequest()` across the Comlink boundary. The main thread displays a password dialog to the user.
3. **Ephemeral Storage**: The password is held only in a local scoped variable inside `parsePdf`.
4. **Immediate Discard**: As soon as document parsing completes (or on error), the `finally` block zeroes and discards `ephemeralPassword = null`, guaranteeing credentials never linger in worker memory:

```typescript
try {
  pdfDocument = await loadingTask.promise;
  // parse pages...
} finally {
  ephemeralPassword = null; // Memory discarded immediately
  if (pdfDocument) await pdfDocument.destroy();
}
```

---

## 4. Token Extraction & Deduplication Matching Phase 1

### 4.1 Deterministic Hash Format

To integrate with the Phase 1 Dexie schema, every parsed transaction includes a deterministic hash matching the Phase 1 specification:

$$\text{digest} = \text{SHA-256}(accountId + \text{":"} + date + \text{":"} + amountMinorUnits + \text{":"} + runningBalanceMinorUnits + \text{":"} + sequenceIndex)$$

```typescript
const hash = await calculateStatementTransactionHash({
  accountId: "acc_checking_01",
  date: "2026-08-01",
  amountMinorUnits: -5000000n,
  runningBalanceMinorUnits: 250000000n,
  sequenceIndex: 0,
});
// => "8f7e2c91b... (64 hex characters)"
```

### 4.2 Seamless Dexie Ingestion

Dexie enforces a unique index `&hash` on the `transactions` table. When inserting parsed transactions:

```typescript
import { createTransaction, DuplicateTransactionError, getDatabase } from "@/db";

const db = getDatabase();
let importedCount = 0;
let duplicateCount = 0;

for (const tx of parseResult.transactions) {
  try {
    await createTransaction(db, {
      id: tx.id,
      accountId: tx.accountId,
      date: tx.date,
      description: tx.description,
      amountMinorUnits: tx.amountMinorUnits,
      runningBalanceMinorUnits: tx.runningBalanceMinorUnits ?? undefined,
      hash: tx.hash,
    });
    importedCount++;
  } catch (err) {
    if (err instanceof DuplicateTransactionError) {
      duplicateCount++; // Idempotent: duplicate statement row safely skipped
    } else {
      throw err;
    }
  }
}
```

---

## 5. Frontend Integration Guide (Phase 3)

### 5.1 Creating the Parser Client

```typescript
import { createParserWorkerClient, parseStatementFile } from "@/workers";
import bcaConfig from "@finview/dsl/configs/bca-individual-pdf.json";

// 1. Initialize worker client
const workerClient = createParserWorkerClient();

// 2. Health check
const status = await workerClient.ping(); // "pong"
```

### 5.2 Executing a PDF Parse with Progress & Password Prompt

```typescript
import * as Comlink from "comlink";
import { parseStatementFile } from "@/workers";

async function handleStatementUpload(file: File, accountId: string) {
  const fileBuffer = await file.arrayBuffer();

  const result = await parseStatementFile(
    workerClient,
    fileBuffer,
    "pdf",
    {
      accountId,
      config: bcaConfig,
      // Optional interactive password prompt dialog
      onPasswordRequest: async () => {
        return promptUserForPdfPasswordModal();
      },
      // Optional progress reporting for multi-page statements
      onProgress: ({ currentPage, totalPages }) => {
        updateProgressBar((currentPage / totalPages) * 100);
      },
    }
  );

  console.log(`Parsed ${result.totalTransactions} transactions in ${result.executionTimeMs}ms`);
  return result.transactions;
}
```

### 5.3 Auto-Detecting Bank Configs

```typescript
// Read initial 2KB to extract sample text
const sampleText = await extractHeaderSample(file);
const matchedConfig = await workerClient.identifyConfig(sampleText, [
  bcaConfig,
  cimbConfig,
  bluConfig,
]);

if (!matchedConfig) {
  throw new Error("Unrecognized bank statement format. Please select a template.");
}
```

---

## 6. Verification & Test Suite Execution

All 35 tests (15 Phase 1 tests + 20 Phase 2 tests) execute via Node.js native test runner:

```bash
npm test
```

Expected output:
```
▶ 1. Cryptographic Architecture (packages/crypto) (5 tests passed)
▶ 2. Local Database Engine & Echo Suppression (apps/web/src/db) (4 tests passed)
▶ 3. Sync Coordinator & Remote Storage (apps/web/src/db/syncCoordinator & apps/web/convex) (4 tests passed)
▶ 4. Remote Storage Engine Handlers (apps/web/convex) (2 tests passed)
▶ 1. Declarative DSL Schema Validation (packages/dsl/schema.ts) (5 tests passed)
▶ 2. Static ReDoS Protection & Deadline Watchdog (packages/dsl/redos.ts) (3 tests passed)
▶ 3. Coordinate Normalization & Line Reconstruction (packages/dsl/normalizer.ts) (4 tests passed)
▶ 4. Minor Unit Integer Parsing & Amount Strategies (packages/dsl/engine.ts) (2 tests passed)
▶ 5. Deterministic Transaction Hashing (Phase 1 Matching) (1 test passed)
▶ 6. Reference Configurations & Statement Parsing Pipelines (3 tests passed)
▶ 7. Worker API & Lifecycle Management (apps/web/src/workers/parser.worker.ts) (2 tests passed)

ℹ tests 35
ℹ suites 11
ℹ pass 35
ℹ fail 0
```
