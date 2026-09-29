# Decentralized Marketplace Security Architecture & Automated Ingestion Gatekeeper

## 1. Executive Summary & Threat Model

Finview's decentralized parser marketplace allows community authors to publish, verify, discover, and install bank statement configurations across global financial institutions. Because statement parsing handles sensitive user financial documents, the marketplace enforces a **zero-trust, sandboxed ingestion model**.

Configurations submitted to the registry are **strictly non-executable data objects** (inert JSON ASTs). Dynamic code execution (`eval`, `new Function`, `importScripts`, or arbitrary regex extensions) is strictly rejected at the schema gate.

```
+--------------------------------------------------------------------------------------------------+
| INGESTION PIPELINE & SECURITY BOUNDARIES                                                        |
|                                                                                                  |
|  [Community Author Submission: { config, fixture }]                                             |
|        |                                                                                         |
|        v                                                                                         |
|  +--------------------------------------------------------------------------------------------+  |
|  | STEP 1: Prototype Pollution Gatekeeper                                                     |  |
|  |  - Deep-scan payload for `__proto__`, `constructor`, and `prototype` keys                  |  |
|  |  - Reject and abort if pollution attempt is detected                                      |  |
|  +--------------------------------------------------------------------------------------------+  |
|        |                                                                                         |
|        v                                                                                         |
|  +--------------------------------------------------------------------------------------------+  |
|  | STEP 2: Strict Zod Schema Gate (`packages/dsl/schema.ts`)                                  |  |
|  |  - Validate against StatementParserConfigSchema                                            |  |
|  |  - Reject unmapped columns, out-of-bounds coordinates, or malformed field mappings          |  |
|  +--------------------------------------------------------------------------------------------+  |
|        |                                                                                         |
|        v                                                                                         |
|  +--------------------------------------------------------------------------------------------+  |
|  | STEP 3: Static ReDoS Watchdog (`packages/dsl/redos.ts`)                                     |  |
|  |  - Statically analyze all regex patterns for nested repetition quantifiers:                |  |
|  |    e.g., `(a+)+`, `([a-zA-Z]+)*`                                                           |  |
|  |  - Reject vulnerable configurations before execution                                        |  |
|  +--------------------------------------------------------------------------------------------+  |
|        |                                                                                         |
|        v                                                                                         |
|  +--------------------------------------------------------------------------------------------+  |
|  | STEP 4: Isolated Node Sandbox Execution (`apps/web/convex/actions/validateSubmission.ts`)  |  |
|  |  - Run declarative DSL engine against sanitized fixture text spans / CSV rows              |  |
|  |  - Enforce 200ms strict execution budget (terminate if runtime > 200ms)                    |  |
|  +--------------------------------------------------------------------------------------------+  |
|        |                                                                                         |
|        v                                                                                         |
|  +--------------------------------------------------------------------------------------------+  |
|  | STEP 5: Deterministic Verification & Mathematical Parity Check                             |  |
|  |  - Confirm 100% extraction precision against fixture transaction records                    |  |
|  |  - Verify ledger invariant: Opening + Sum(Credits) - Sum(Debits) == Closing                |  |
|  |  - Confirm zero running balance discrepancy and zero malformed dates                        |  |
|  +--------------------------------------------------------------------------------------------+  |
|        |                                                                                         |
|        +-----------------------------------+----------------------------------+                  |
|        | (Pass 100%)                       | (Fail)                           |                  |
|        v                                   v                                                     |
|  [Status: "verified"]               [Status: "rejected"]                                         |
|  - Listed in public search indices  - Detailed failure logs recorded                             |
|  - Available for offline install    - Quarantined from search indices                            |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. System Invariants

### Invariant 1: Non-Executable Registry
* Market listings consist strictly of validated, inert JSON schemas.
* No executable code, functions, or external binary dependencies are stored or transmitted.
* Schema validators reject unexpected properties and strip prototype pollution vectors (`__proto__`, `constructor`, `prototype`).
* Regex patterns are audited statically to prohibit catastrophic exponential backtracking (ReDoS).

### Invariant 2: Deterministic Verification
* A parser cannot transition to `"verified"` status unless the automated Convex action confirms **100% extraction precision** against its accompanying sanitized fixture.
* Every transaction date, amount, description, and running balance extracted by the DSL engine must match the fixture byte-for-byte and minor-unit-for-minor-unit.
* The mathematical ledger equation:
  $$\text{OpeningBalance} + \sum \text{Credits} - \sum \text{Debits} \equiv \text{ClosingBalance}$$
  must evaluate with zero minor unit discrepancy.

---

## 3. Threat Model & Mitigations

| Threat | Attack Vector | Security Mitigation |
| :--- | :--- | :--- |
| **Prototype Pollution** | Malicious JSON payloads with `__proto__` or `constructor` altering JavaScript base object prototypes. | 1. Pre-parsing regex check on raw JSON strings for `"(?:__proto__\|constructor\|prototype)"\s*:`.<br>2. Deep recursive traversal stripping forbidden keys before feeding objects to the engine.<br>3. Immediate rejection of submissions containing malicious keys. |
| **Regular Expression Denial of Service (ReDoS)** | Nested repetition quantifiers (`(a+)+`, `(x+x+)+y`) causing catastrophic exponential backtracking. | 1. Static AST parsing of regexes in `packages/dsl/redos.ts`.<br>2. Rejection of nested repetition patterns at submission.<br>3. 50ms per-page watchdog and 200ms overall execution budget. |
| **Resource Exhaustion** | Large or complex fixtures designed to pin server CPU during validation. | 1. Strict 200ms execution budget monitored via `performance.now()`.<br>2. Action aborts and marks submission as `"rejected"` if the budget is exceeded. |
| **PII Data Leakage** | Community authors accidentally including live customer account numbers, names, or balances. | 1. Phase 3 Format-Preserving Masking enforces random tokenization.<br>2. Customer names and addresses anonymized byte-for-byte.<br>3. Proportional amount scaling obscures true balances while preserving arithmetic parity. |
| **Malicious or Broken Parsers** | Authors submitting parsers that extract wrong balances or skip transactions. | 1. Automated sandbox gatekeeper verifies extraction against fixture.<br>2. Ledger balance reconciliation check (`verifyLedgerParity`).<br>3. Automated Demotion Policy flags and delists parsers receiving $\ge 3$ defect reports in 7 days. |

---

## 4. Verification CI & Ingestion Pipeline

### 4.1 Schema Gate (`StatementParserConfigSchema`)
Submissions must strictly validate against `StatementParserConfigSchema`:
- `meta`: `bankId`, `name`, `fileType` (`pdf` | `csv`), `version` (semver).
- `matchers`: `fileType`, `contentPatterns` (min 1 required string).
- `pageBounds`: `topMargin`, `bottomMargin` ($0 \le y \le 1000$).
- `columns`: coordinates normalized to $0 \le x \le 1000$ for PDF, integer column indices for CSV.
- `rowContinuation`: `dateRequired`, `dateRegex`, `descriptionJoiner` (`\n` | ` `).
- `fields`: canonical targets (`date`, `description`, `amountStrategy`, `balance`).

### 4.2 Sandboxed Execution Boundary
Verification actions run inside Convex Node runtime actions (`"use node";`). Execution isolation guarantees:
1. DSL engine runs in-memory with isolated transient state (`validation_sandbox_acc`).
2. No network requests are permitted during parser execution.
3. No local filesystem access is granted.
4. Total execution time must not exceed 200ms.

### 4.3 Mathematical Parity Check
The verification engine executes `verifyLedgerParity(extracted, config)`:
- `isBalanced === true`
- `discrepancyMinorUnits === 0n`
- `unbalancedRowIndices.length === 0`
- `malformedDateRowIndices.length === 0`
- `missingBalanceRowIndices.length === 0`

If any test fails, the submission is rejected and failure reasons are logged into `parser_versions.verificationLog`.

---

## 5. Moderation Flows & Reputation System

### 5.1 Defect Reporting Interface
Users can report defect or suspicious parser configurations via `reportParser`:
- Reasons:
  * `broken_parser`: Statement format changes, layout shifts, or extraction errors.
  * `malicious_attempt`: Obfuscated patterns or suspicious matchers.
  * `spam`: Duplicate or low-quality listings.
- Reports are persisted to `parser_reports` with caller identity (`reporterId`) and timestamp (`createdAt`).

### 5.2 Automated Demotion Policy
To safeguard users from broken or hijacked parsers:
$$\text{Defect Reports in Last 7 Days} \ge 3 \implies \text{Status} \leftarrow \text{"flagged"}$$

When a parser is marked `"flagged"`:
1. It is **immediately excluded** from all public discovery queries (`listVerifiedParsers`).
2. It cannot be returned by the auto-detection matcher (`getMatchingParser`).
3. Existing users with the parser installed receive warning indicators in their client UI.
4. Reports older than 7 days age out of the demotion calculation window.

---

## 6. Security Audit Checklist

Before deploying updates to the marketplace or ingestion gatekeeper, complete this audit checklist:

- [x] **Inert Schema Invariant**: Verify that `StatementParserConfigSchema` rejects any keys containing functions, scripts, or non-primitive attributes.
- [x] **Prototype Pollution**: Verify that `sanitizePrototypeProperties` strips `__proto__`, `constructor`, and `prototype`, and that `validateSubmission` rejects submissions containing pollution payloads.
- [x] **Static ReDoS Check**: Verify that nested repetition quantifiers are rejected before regex compilation.
- [x] **Sandbox Execution Budget**: Verify that execution budget interrupts operations taking longer than 200ms.
- [x] **Ledger Parity Enforcement**: Verify that any ledger discrepancy ($\ne 0$) rejects the submission.
- [x] **Demotion Gatekeeper**: Verify that $\ge 3$ reports in 7 days transitions parser to `"flagged"` and delists from public queries.
- [x] **Offline Registry Independence**: Verify that `installedParsers` in Dexie operates 100% offline without remote network requests.
