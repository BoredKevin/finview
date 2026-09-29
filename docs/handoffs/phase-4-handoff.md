# Phase 4 Engineering Handoff: Decentralized Parser Marketplace & Automated Ingestion Gatekeeper

## 1. Scope & Modules Delivered

Phase 4 delivers the decentralized marketplace backend, automated ingestion gatekeeper, offline Dexie registry, reputation demotion system, and interactive marketplace UI:

| Module | Path | Description |
| :--- | :--- | :--- |
| **Convex Marketplace Schema** | `apps/web/convex/schema.ts` | Database schema for `parsers`, `parser_versions`, and `parser_reports` with indexes and search definitions. |
| **Ingestion Gatekeeper Action** | `apps/web/convex/actions/validateSubmission.ts` | Isolated Node action enforcing prototype pollution defense, strict Zod validation, static ReDoS watchdog, sandbox execution against fixtures, ledger parity, and 200ms execution budget. |
| **Marketplace API Endpoints** | `apps/web/convex/marketplace.ts` | Public queries (`listVerifiedParsers`, `getParserBySlug`, `getMatchingParser`, `checkForUpdates`, `getParserReputation`) and mutations (`submitParser`, `reportParser`, `recordDownload`). |
| **Convex Root Exports** | `convex/marketplace.ts`, `convex/actions/validateSubmission.ts` | Seamless re-exports for Convex CLI and monorepo tooling. |
| **Dexie Offline Registry** | `apps/web/src/db/installedParsers.ts` | Local client persistence in `installedParsers` table, 100% offline statement matching, and semver update checking. |
| **Marketplace UI Component** | `apps/web/src/marketplace/ParserMarketplace.tsx` | Pitch-dark sci-fi HUD marketplace interface with search, filtering, offline installation toggles, updates banner, and moderation report modal. |
| **Marketplace React Hook** | `apps/web/src/marketplace/useMarketplace.ts` | State management hook orchestrating Dexie local cache, remote catalog sync, installation, and defect reporting. |
| **Comprehensive Test Suite** | `tests/marketplace-sandbox.test.ts` | 22 unit & integration tests covering security, sandbox execution, automated demotion, offline Dexie registry, and Convex queries. |
| **Architecture Specification** | `docs/architecture/marketplace-security.md` | Formal threat model, audit checklist, CI verification boundaries, and moderation flows. |

---

## 2. Registry Query APIs

### 2.1 Statement Auto-Detection: `getMatchingParser`

Used by statement ingestion pipelines to auto-resolve matching parser configurations from statement sample text and metadata:

```typescript
import { api } from "../convex/_generated/api";
import { useQuery } from "convex/react";

// Signature:
// convex.query(api.marketplace.getMatchingParser, {
//   sampleText?: string;
//   fileType?: "pdf" | "csv";
//   country?: string;
//   bankName?: string;
// })

const matchedParser = await convex.query(api.marketplace.getMatchingParser, {
  sampleText: "PT BANK CENTRAL ASIA REKENING KORAN TANGGAL KETERANGAN",
  fileType: "pdf",
  country: "ID",
});

if (matchedParser) {
  console.log(`Matched ${matchedParser.bankName} v${matchedParser.currentVersion} (Score: ${matchedParser.matchScore}%)`);
  const config = JSON.parse(matchedParser.dslConfig);
}
```

#### Return Type Contract
```typescript
interface MatchedParserResult {
  _id: Id<"parsers">;
  slug: string;              // e.g. "id-bca-individual-pdf"
  bankName: string;          // e.g. "Bank Central Asia"
  country: string;           // ISO 3166-1 alpha-2 e.g. "ID"
  fileType: "pdf" | "csv";
  currentVersion: string;    // semver e.g. "1.0.0"
  dslConfig: string;         // Stringified validated StatementParserConfig JSON
  matchScore: number;        // Match confidence percentage (0..100)
}
```

### 2.2 Public Discovery: `listVerifiedParsers`

Retrieves all verified, active configurations. Automatically excludes `flagged`, `rejected`, and `pending` listings:

```typescript
const parsers = await convex.query(api.marketplace.listVerifiedParsers, {
  country: "ID",
  fileType: "pdf",
  search: "BCA",
  limit: 20,
});
```

### 2.3 Version Updates Telemetry: `checkForUpdates`

Checks a list of locally installed parser slugs and versions against the latest verified listings:

```typescript
const updateNotices = await convex.query(api.marketplace.checkForUpdates, {
  installed: [
    { slug: "id-bca-individual-pdf", version: "1.0.0" },
    { slug: "id-cimb-niaga-pdf", version: "1.0.0" },
  ],
});
// => Array<{ slug, installedVersion, latestVersion, hasUpdate, changelog, dslConfig }>
```

### 2.4 Defect Reporting & Moderation: `reportParser`

Submits a defect or abuse report. Enforces the **Automated Demotion Policy** ($\ge 3$ reports within 7 days automatically sets status to `"flagged"`):

```typescript
const result = await convex.mutation(api.marketplace.reportParser, {
  parserId: "parsers_123" as Id<"parsers">,
  reason: "broken_parser", // "broken_parser" | "malicious_attempt" | "spam"
  details: "October 2026 update introduced new QRIS format causing unparsed rows",
});

console.log(`Status: ${result.status}, 7-day reports: ${result.reportsInLast7Days}, Demoted: ${result.demoted}`);
```

---

## 3. Fallback Orchestration Architecture for Phase 5

When a user imports a statement (drag-and-drop PDF or CSV), Phase 5 must resolve the appropriate parser configuration according to a **4-tier fallback hierarchy**:

```
+--------------------------------------------------------------------------------------------------+
| PHASE 5 PARSER RESOLUTION HIERARCHY                                                             |
|                                                                                                  |
| [Incoming Statement File (PDF / CSV)]                                                           |
|       |                                                                                          |
|       v                                                                                          |
| +---------------------------------------------------------------------------------------------+  |
| | LEVEL 1: Local Dexie Installed Registry (100% Offline, Zero Latency)                         |  |
| |  - Query `findInstalledParserForDocument(db, { sampleText, fileType })`                     |  |
| |  - Fast local IndexedDB lookup without network request                                      |  |
| +---------------------------------------------------------------------------------------------+  |
|       |                                                                                          |
|       +---> [Match Found?] ===> YES ===> Execute Sandboxed Worker Parsing                        |
|       |                                                                                          |
|       v NO                                                                                       |
| +---------------------------------------------------------------------------------------------+  |
| | LEVEL 2: Remote Verified Marketplace Registry (Convex Cloud)                                |  |
| |  - Query `getMatchingParser({ sampleText, fileType, country })`                              |  |
| |  - If online and verified match found: prompt user to 1-click install offline               |  |
| +---------------------------------------------------------------------------------------------+  |
|       |                                                                                          |
|       +---> [Match Found?] ===> YES ===> Install to Dexie + Execute Sandboxed Worker Parsing      |
|       |                                                                                          |
|       v NO                                                                                       |
| +---------------------------------------------------------------------------------------------+  |
| | LEVEL 3: Bundled Reference Configurations (`@finview/dsl/configs/`)                          |  |
| |  - Test against bundled static definitions (BCA, CIMB Niaga, Blu BCA)                        |  |
| +---------------------------------------------------------------------------------------------+  |
|       |                                                                                          |
|       +---> [Match Found?] ===> YES ===> Ingest Config into Dexie + Execute Worker               |
|       |                                                                                          |
|       v NO                                                                                       |
| +---------------------------------------------------------------------------------------------+  |
| | LEVEL 4: Visual Parser Studio Calibration (`/studio`)                                       |  |
| |  - Launch Parser Studio with raw statement loaded in transient memory                       |  |
| |  - Guide user through visual column alignment, rule builder, and fixture generation          |  |
| +---------------------------------------------------------------------------------------------+  |
+--------------------------------------------------------------------------------------------------+
```

### 3.1 Orchestration Implementation Example for Phase 5

```typescript
import { getDatabase, findInstalledParserForDocument, installParser } from "@/db";
import { useConvex } from "convex/react";
import { api } from "../convex/_generated/api";
import { createParserWorkerClient, parseStatementFile } from "@/workers";
import { BUNDLED_CONFIGS } from "@finview/dsl";

export async function orchestrateStatementParsing(
  file: File,
  accountId: string,
  convexClient?: any
) {
  const db = getDatabase();
  const workerClient = createParserWorkerClient();
  const fileType = file.name.endsWith(".csv") ? "csv" : "pdf";
  const fileBuffer = await file.arrayBuffer();

  // Extract initial header sample (first 2KB)
  const sampleText = await extractHeaderSample(fileBuffer, fileType);

  // LEVEL 1: Local Dexie Installed Registry (Offline-First)
  let activeParser = await findInstalledParserForDocument(db, {
    sampleText,
    fileType,
  });

  // LEVEL 2: Remote Marketplace Registry (if online and Level 1 missed)
  if (!activeParser && convexClient && navigator.onLine) {
    try {
      const remoteMatch = await convexClient.query(api.marketplace.getMatchingParser, {
        sampleText,
        fileType,
      });

      if (remoteMatch) {
        // Auto-install to local Dexie for future offline use
        activeParser = await installParser(db, {
          slug: remoteMatch.slug,
          bankName: remoteMatch.bankName,
          country: remoteMatch.country,
          fileType: remoteMatch.fileType,
          version: remoteMatch.currentVersion,
          dslConfig: JSON.parse(remoteMatch.dslConfig),
        });
      }
    } catch (err) {
      console.warn("Marketplace query failed or offline, falling back:", err);
    }
  }

  // LEVEL 3: Bundled Static Reference Configurations
  if (!activeParser) {
    const matchedBundled = workerClient.identifyConfig(sampleText, BUNDLED_CONFIGS);
    if (matchedBundled) {
      activeParser = await installParser(db, {
        slug: matchedBundled.meta.bankId,
        bankName: matchedBundled.meta.name,
        country: "ID",
        fileType: matchedBundled.meta.fileType,
        version: matchedBundled.meta.version,
        dslConfig: matchedBundled,
      });
    }
  }

  // LEVEL 4: Parser Studio Fallback
  if (!activeParser) {
    return {
      status: "unrecognized_format",
      redirectToStudio: true,
      file,
      sampleText,
    };
  }

  // Execute Sandboxed Worker Parsing
  const result = await parseStatementFile(workerClient, fileBuffer, fileType, {
    accountId,
    config: activeParser.dslConfig,
  });

  return {
    status: "success",
    transactions: result.transactions,
    parser: activeParser,
  };
}
```

---

## 4. Local Database Client APIs (`apps/web/src/db/installedParsers.ts`)

All local registry interactions operate through typed, transactional Dexie functions:

```typescript
import {
  installParser,
  uninstallParser,
  getInstalledParser,
  listInstalledParsers,
  findInstalledParserForDocument,
  checkForParserUpdates,
  upgradeInstalledParser,
} from "@/db";

// 1. Install a verified parser locally
const parser = await installParser(db, {
  slug: "id-bca-individual-pdf",
  bankName: "Bank Central Asia",
  country: "ID",
  fileType: "pdf",
  version: "1.0.0",
  dslConfig: bcaConfig,
});

// 2. Query offline installed parsers
const allInstalled = await listInstalledParsers(db);

// 3. Match document against installed parsers (100% offline)
const matched = await findInstalledParserForDocument(db, {
  sampleText: "REKENING KORAN PT BANK CENTRAL ASIA",
  fileType: "pdf",
});

// 4. Check for updates against remote catalog
const updates = await checkForParserUpdates(db, [
  { slug: "id-bca-individual-pdf", latestVersion: "1.1.0" },
]);

// 5. Upgrade installed parser to new version
if (updates.length > 0) {
  await upgradeInstalledParser(db, updates[0].slug, updates[0].latestVersion, newConfig);
}

// 6. Uninstall parser
await uninstallParser(db, "id-bca-individual-pdf");
```

---

## 5. Verification Test Suite Execution

All 72 tests (15 Phase 1 + 20 Phase 2 + 15 Phase 3 + 22 Phase 4) execute via the Node.js native test runner:

```bash
npm test
```

Expected output:
```
▶ 1. Cryptographic Architecture (packages/crypto) (5 tests passed)
▶ 2. Local Database Engine & Echo Suppression (apps/web/src/db) (4 tests passed)
▶ 3. Sync Coordinator & Remote Storage (apps/web/src/db/syncCoordinator & apps/web/convex) (4 tests passed)
▶ 4. Remote Storage Engine Handlers (apps/web/convex) (2 tests passed)
▶ 1. Automated Ingestion Gatekeeper & Schema Validation (4 tests passed)
▶ 2. Isolated Sandbox Execution & Deterministic Verification (4 tests passed)
▶ 3. Moderation & Automated Demotion Policy (2 tests passed)
▶ 4. Client Installation & Offline Dexie Registry (6 tests passed)
▶ 5. Convex Marketplace Queries, Matching Engine & Telemetry (6 tests passed)
▶ 1. Declarative DSL Schema Validation (packages/dsl/schema.ts) (5 tests passed)
▶ 2. Static ReDoS Protection & Deadline Watchdog (packages/dsl/redos.ts) (3 tests passed)
▶ 3. Coordinate Normalization & Line Reconstruction (packages/dsl/normalizer.ts) (4 tests passed)
▶ 4. Minor Unit Integer Parsing & Amount Strategies (packages/dsl/engine.ts) (2 tests passed)
▶ 5. Deterministic Transaction Hashing (Phase 1 Matching) (1 test passed)
▶ 6. Reference Configurations & Statement Parsing Pipelines (3 tests passed)
▶ 7. Worker API & Lifecycle Management (apps/web/src/workers/parser.worker.ts) (2 tests passed)
▶ 1. PII Redaction & Format-Preserving Masking (apps/web/src/studio/sanitizer) (3 tests passed)
▶ 2. Header Customer Metadata Anonymization (2 tests passed)
▶ 3. Transaction Narrative Obfuscation & Structural Preservation (2 tests passed)
▶ 4. Proportional Amount Scaling & Mathematical Parity (2 tests passed)
▶ 5. Sanitization Parity & Geometry Verification (1 test passed)
▶ 6. Export Bundle Generation & SHA-256 Cryptographic Signature (1 test passed)
▶ 7. Mathematical Reconciliation Engine & Discrepancy Detection (4 tests passed)

ℹ tests 72
ℹ suites 23
ℹ pass 72
ℹ fail 0
```
