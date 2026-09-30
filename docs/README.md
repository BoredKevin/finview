# FinView System Architecture & Engineering Handbook

FinView is a zero-knowledge, local-first financial intelligence platform and statement ingestion pipeline. It allows users to parse proprietary PDF and CSV bank statements, reconcile ledgers with exact mathematical integrity, visualize cash flow trajectories, and discover or share declarative parser layouts without ever exposing unencrypted financial figures to external cloud servers.

---

## 1. System Invariants

Every subsystem and component in FinView strictly obeys two non-negotiable architectural invariants:

### Invariant 1: Zero Data Egress
- **Client-Side Boundary**: Unencrypted transaction amounts, merchant narratives, bank account numbers, credentials, and ledger balances never leave client memory or unencrypted network packets.
- **Envelope Encryption**: Data persisted to remote synchronization backends (Convex) is encrypted client-side using **AES-GCM-256** keys derived via **PBKDF2 (600,000 iterations)** and wrapped in a BIP-39 recovery hierarchy.
- **Privacy-Preserving Telemetry**: Client error boundaries scrub all URLs, numbers, amounts, narratives, and user identifiers. Telemetry is constrained strictly to whitelisted coarse error codes (e.g. `PARSER_FAIL_NO_LAYOUT_MATCH`, `WORKER_TIMEOUT_EXCEEDED`, `PASSWORD_REQUIRED`).

### Invariant 2: Guaranteed UI Responsiveness
- **Main Thread Isolation**: Coordinate normalization, regex matching, PapaParse streaming, and PDF rendering execute in isolated sandboxed Web Workers (`parser.worker.ts`).
- **High-Volume Analytics Delegation**: For ledgers exceeding **10,000 transactions**, analytics aggregation and recurring pattern detection automatically offload to a dedicated background analytics Web Worker (`analytics.worker.ts`), preventing UI stutter and frame drops.
- **Cold Render Budget**: Cold dashboard retrieval and initial metric computation execute directly from IndexedDB in **< 400ms**.

---

## 2. Architecture Map

```
+----------------------------------------------------------------------------------------------------+
|                                    PRESENTATION LAYER (REACT 19)                                   |
|                                                                                                    |
|  +---------------------------+  +-------------------------------+  +----------------------------+  |
|  |     Cockpit Dashboard     |  |       Parser Marketplace      |  |        Parser Studio       |  |
|  |  - Ingestion Dropzone     |  |  - Verified Catalog Browser   |  |  - SVG Coordinate Canvas   |  |
|  |  - Metric Cards (KPIs)    |  |  - 1-Click Offline Installer  |  |  - Visual Column Wizard    |  |
|  |  - Cash Flow SVG Chart    |  |  - Moderation & Abuse Reports |  |  - PII Masking & Fixtures  |  |
|  |  - Accounts & Vaults      |  |  - Semver Update Notifier     |  |  - Math Parity Reconciler  |  |
|  |  - Subscriptions Radar    |  +-------------------------------+  +----------------------------+  |
|  |  - Transaction Ledger     |                                                                     |
|  +---------------------------+                                                                     |
+----------------------------------------------------------------------------------------------------+
                                 |                                 |
                                 v                                 v
+------------------------------------------------+ +-------------------------------------------------+
|          LOCAL STORAGE & CLIENT ENGINE         | |             WEB WORKER PIPELINES                |
|                                                | |                                                 |
|  +------------------------------------------+  | |  +-------------------------------------------+  |
|  | Dexie.js (IndexedDB Local Vault)         |  | |  | Statement Parser Worker (Comlink RPC)     |  |
|  |  - accounts                              |  | |  |  - pdfjs-dist (isEvalSupported: false)   |  |
|  |  - transactions (SHA-256 deduplicated)   |  | |  |  - extractNormalizedSpans (0..1000 grid)  |  |
|  |  - installedParsers (100% offline DSL)   |  | |  |  - PapaParse CSV streaming engine         |  |
|  |  - cryptoKeys (PBKDF2 / Salt / IV)       |  | |  |  - Ephemeral password memory lifecycle   |  |
|  |  - syncQueue (Outbound mutation buffer)  |  | |  +-------------------------------------------+  |
|  +------------------------------------------+  | |                                                 |
|                                                | |  +-------------------------------------------+  |
|  +------------------------------------------+  | |  | Analytics Web Worker (>10k tx delegation) |  |
|  | SyncCoordinator                          |  | |  |  - Inflow, outflow, savings rate         |  |
|  |  - Echo suppression context               |  | |  |  - Cash flow progression time series      |  |
|  |  - AES-GCM-256 batch encryption           |  | |  |  - Recurring subscription radar          |  |
|  |  - LWW conflict resolution               |  | |  +-------------------------------------------+  |
|  +------------------------------------------+  | +-------------------------------------------------+
+------------------------------------------------+
                                 |
                                 v (AES-GCM-256 Encrypted Envelopes Only)
+----------------------------------------------------------------------------------------------------+
|                                    REMOTE CLOUD BACKEND (CONVEX)                                   |
|                                                                                                    |
|  +------------------------------------------+  +------------------------------------------------+  |
|  | Zero-Knowledge Storage Engine            |  | Decentralized Parser Marketplace Registry      |  |
|  |  - encrypted_records (Blob ciphertexts)  |  |  - parsers (Verified DSL configurations)       |  |
|  |  - sync_cursors (Version vector track)   |  |  - parser_versions (Immutable semver releases) |  |
|  |  - Strict user boundary isolation        |  |  - Automated Gatekeeper (Sandbox verifier)     |  |
|  +------------------------------------------+  +------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Unified Ingestion 4-Tier Resolution Hierarchy

When a user drops a statement file (`.pdf` or `.csv`) into the Ingestion Dropzone, the system extracts the first-page spans and resolves the parser using a 4-tier fallback:

```
[Statement File Dropped] 
      │
      ▼
[Parser Worker: inspectDocument] ──► Password Protected? ──► [Password Modal (RAM only)]
      │                          ──► Zero Text Spans?    ──► [Scanned PDF Guidance Alert]
      ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: Local Dexie Installed Registry (100% Offline, Zero Latency)   │
│ Query: findInstalledParserForDocument(db, { sampleText, fileType })   │
└────────────────────────────────────────────────────────────────────────┘
      │
      ├─► [Match Found] ───────────► Execute Worker Parsing Immediately
      │
      ▼ [No Local Match]
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 2: Remote Verified Marketplace Registry (Convex Cloud)           │
│ Query: getMatchingParser({ sampleText, fileType, country })            │
└────────────────────────────────────────────────────────────────────────┘
      │
      ├─► [Match Found] ───────────► Prompt 1-Click Offline Install & Parse
      │
      ▼ [No Remote Match]
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 3: Bundled Reference Configurations (@finview/dsl)               │
│ Compare against bundled reference configs (BCA, CIMB Niaga, Blu BCA)   │
└────────────────────────────────────────────────────────────────────────┘
      │
      ├─► [Match Found] ───────────► Auto-install to Dexie & Parse
      │
      ▼ [Unrecognized Layout]
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 4: Visual Parser Studio Fallback (/studio)                       │
│ Seamless handoff with raw statement + normalized spans preloaded       │
└────────────────────────────────────────────────────────────────────────┘
```

### Pre-Commit Reconciliation Screen
Extracted statement rows are passed to the **Reconciliation Screen** before writing to IndexedDB:
1. **Mathematical Ledger Verification**: Confirms $OpeningBalance + Credits - Debits == ClosingBalance$.
2. **Confidence Scoring**: Each transaction is evaluated against 4 deterministic factors (Date Format, Non-Zero Amount, Narrative Completeness, and Balance Jump Continuity) and assigned a confidence rating (`High`, `Medium`, `Warning`).
3. **Atomic Commit**: Writes approved transactions to Dexie inside a single atomic transaction (`db.transaction('rw', ...)`), skipping duplicate records via deterministic SHA-256 hashing.

---

## 4. Financial Analytics Engine

### 4.1 Minor Units & Integer Arithmetic
To eliminate floating-point rounding errors (e.g. `0.1 + 0.2 = 0.30000000000000004`), all balances and amounts are stored and calculated as signed **`bigint`** minor units (e.g. cents).
- **IDR**: Supports standard Indonesian formatting (`Rp 25.000.000` with `.` thousand separator and `,` decimal separator).
- **USD / EUR / SGD / GBP**: Standard international currencies supported with currency-specific decimal positioning.

### 4.2 Metrics & Savings Rate
For any selectable date window (`30D`, `90D`, `1Y`, `ALL`):
$$\text{Net Cash Flow} = \text{Inflow} - \text{Outflow}$$
$$\text{Savings Rate} = \frac{\text{Net Cash Flow}}{\text{Inflow}} \times 100\% \quad (\text{if Inflow} > 0)$$

### 4.3 Recurring Subscriptions & Utility Radar
The recurring engine (`recurringEngine.ts`) clusters transactions by normalized merchant narrative, determines payment periodicity from day intervals ($\Delta \text{days}$), calculates standard deviation, and predicts the next billing date. High-confidence monthly recurring outflows are classified as **Subscriptions**.

---

## 5. Security & Threat Model

| Threat Vector | Mitigation Strategy | Location |
| :--- | :--- | :--- |
| **Cloud Provider Eavesdropping** | AES-GCM-256 envelope encryption. Plaintext never leaves client RAM. | `packages/crypto/` |
| **Malicious Parser Submission** | Ingestion Gatekeeper verifies submissions in an isolated Node sandbox; prohibits `eval`, prototype tampering, and enforces 200ms deadline. | `apps/web/convex/actions/validateSubmission.ts` |
| **Regular Expression DoS (ReDoS)** | Static AST analysis rejects nested repetition patterns before execution; runtime watchdog interrupts any regex execution exceeding 50ms per page. | `packages/dsl/redos.ts` |
| **Telemetry Leakage** | Client-side error boundaries scrub all numbers, merchant strings, emails, and URLs. Telemetry payloads contain only whitelisted coarse codes. | `apps/web/src/dashboard/telemetry/` |
| **Credential Interception** | PDF decryption passwords are held strictly in ephemeral React state, transmitted directly to worker memory, and discarded immediately. | `apps/web/src/workers/parser.worker.ts` |

---

## 6. Local Development Workflow

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation
```bash
# 1. Clone repository
git clone https://github.com/BoredKevin/finview.git
cd finview

# 2. Install dependencies
npm install
```

### Building & Compilation
```bash
# Compile TypeScript packages and web application into dist/
npm run build
```

### Running the Test Suite
The complete test suite runs natively using the Node.js test runner across all 5 project phases:
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
▶ 1. Internationalization & Minor Unit Financial Precision (4 tests passed)
▶ 2. Local Financial Analytics Engine (Multi-Currency & Ranges) (3 tests passed)
▶ 3. Recurring Transaction & Subscription Identification Engine (3 tests passed)
▶ 4. Privacy-Preserving Telemetry & Client-Side Scrubbing (Zero Data Egress) (2 tests passed)
▶ 5. Ingestion Pipeline & 4-Tier Parser Resolution (4 tests passed)
▶ 6. Reconciliation Confidence Scoring & Atomic Dexie Commit (2 tests passed)
▶ 7. Performance Targets & Cold Render Benchmarks (2 tests passed)

ℹ tests 92
ℹ suites 30
ℹ pass 92
ℹ fail 0
```

### Running Convex Backend
```bash
npx convex dev
```

---

## 7. Security Audit Protocol

Before deploying new configurations or code changes to production:

1. **Verify Sandbox Boundary**:
   Assert that `isEvalSupported: false` remains enabled in `parser.worker.ts` and no instances of dynamic code execution (`eval`, `new Function`, `importScripts` with remote URLs) exist in the client build.

2. **Verify Cryptographic Invariants**:
   Run `tests/e2ee-sync.test.ts` to confirm that PBKDF2 iterations are pinned at 600,000, envelope encryption seals all fields, and no plaintext records appear in the sync queue.

3. **Verify Gatekeeper & Sandbox Defense**:
   Run `tests/marketplace-sandbox.test.ts` to confirm that prototype pollution payloads (`__proto__`, `constructor`), nested repetition ReDoS expressions, and mathematically unbalanced fixture statements are rejected automatically.

4. **Verify Telemetry Scrubbing**:
   Run `tests/dashboard-analytics.test.ts` to confirm that mock errors containing real banking amounts, account numbers, and merchant strings are sanitized leaving only whitelisted enum codes in local memory.
