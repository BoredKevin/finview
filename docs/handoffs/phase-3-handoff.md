# Phase 3 Engineering Handoff: Parser Studio Workspace & Verified Fixture Bundle

## 1. Scope & Modules Delivered

Phase 3 delivers **Parser Studio** (`apps/web/src/studio/`), an interactive visual workspace allowing users to visually author, calibrate, and sanitize declarative statement parser configurations without code generation.

| Module | Path | Description |
| :--- | :--- | :--- |
| **Interactive Canvas** | `apps/web/src/studio/canvas/DocumentCanvas.tsx` | HTML5 Canvas page renderer overlaid with an interactive SVG surface synchronized to the $0 \to 1000$ coordinate grid. |
| **Draggable Column Guides** | `apps/web/src/studio/canvas/DraggableGuide.tsx` | Vertical guides marking column bounds (`xStart` to `xEnd`) with real-time text highlight confirmation. |
| **Page Bounds Guides** | `apps/web/src/studio/canvas/PageBoundsGuide.tsx` | Draggable horizontal margins defining top and bottom table cutoffs with exclusion zone shading. |
| **Canvas Toolbar** | `apps/web/src/studio/canvas/CanvasToolbar.tsx` | Zoom (50% to 150%, Fit), page navigation, layer toggles, and zero-retention invariant badge. |
| **Configuration Wizard** | `apps/web/src/studio/wizard/ConfigWizard.tsx` | Master multi-section wizard orchestrating columns, amounts, dates, and bank metadata. |
| **Debit/Credit Rule Builder** | `apps/web/src/studio/wizard/DebitCreditRuleBuilder.tsx` | Visual builder for single-column sign markers (e.g. trailing "DB") and split-column assignments with real-time arithmetic sandbox. |
| **Date Format Builder** | `apps/web/src/studio/wizard/DateFormatBuilder.tsx` | Preset and custom format selector with live evaluation against active document rows. |
| **Field Mapping Form** | `apps/web/src/studio/wizard/FieldMappingForm.tsx` | Canonical targets assignment (`Date`, `Description`, `Debit`, `Credit`, `Amount`, `Balance`). |
| **Row Continuation Form** | `apps/web/src/studio/wizard/RowContinuationForm.tsx` | Multi-line assembly setup with static ReDoS watchdog validation. |
| **Math Reconciliation Engine** | `apps/web/src/studio/reconciliation/ReconciliationEngine.ts` | Mathematical consistency checker enforcing `Opening + Credits - Debits == Closing` with row error tracking. |
| **Ledger Reconciliation View** | `apps/web/src/studio/reconciliation/ReconciliationView.tsx` | Split-view live ledger table with continuity error flags, search filter, and balance summary cards. |
| **Debounced Worker Hook** | `apps/web/src/studio/reconciliation/useDebouncedParse.ts` | 150ms debounced background re-parse hook consuming Phase 2 Web Worker bridges. |
| **PII Redaction Engine** | `apps/web/src/studio/sanitizer/RedactionEngine.ts` | Format-preserving masking (account numbers, IBANs, credit cards), header anonymization, narrative obfuscation, and proportional amount scaling. |
| **Fixture Generator** | `apps/web/src/studio/sanitizer/FixtureGenerator.tsx` | Visual redaction controls, sanitization parity report card, and 1-click bundle export. |
| **Studio Root Workspace** | `apps/web/src/studio/ParserStudio.tsx` | Master split-screen layout with zero-retention memory management and pre-packaged samples. |
| **Pre-packaged Samples** | `apps/web/src/studio/samples/sampleStatements.ts` | Embedded reference statements for BCA (PDF), CIMB Niaga (PDF Split), and Blu BCA (CSV). |
| **Automated Test Suite** | `tests/studio-sanitizer.test.ts` | 15 unit tests covering redaction, proportional scaling, parity verification, bundle signatures, and math checks. |
| **User Guide** | `docs/user-guides/creating-parsers.md` | Illustrated workflow for single-column, multi-column, and multi-line bank formats. |

---

## 2. System Invariants Verification

### Invariant 1: Zero Local Retention
- Uploaded raw statements remain strictly in transient React component state (`useState` / `useRef`).
- The studio makes **no calls** to Dexie, IndexedDB, CacheStorage, localStorage, sessionStorage, or remote backend endpoints.
- Clicking **Purge Buffer** replaces active document state with empty arrays, allowing immediate garbage collection.

### Invariant 2: Sanitization Parity
- **Character Count Parity**: Masked digit sequences and anonymized customer names match the original string byte-for-byte:
  $$\text{length}(\text{sanitized}) \equiv \text{length}(\text{original})$$
- **Geometry Parity**: Text span $(x, y, \text{width}, \text{height})$ bounding boxes in the $0 \to 1000$ normalized space are preserved without alteration.
- **Balance Integrity**: Applying a proportional scalar $k$ updates components such that:
  $$\text{Opening}' + \sum \text{Credits}' - \sum \text{Debits}' \equiv \text{Closing}'$$
  with zero minor unit discrepancy.

---

## 3. Export Bundle Specification (`StudioExportBundle`)

The Studio generates a standalone, verified JSON bundle conforming to the schema `{ config, fixture, signature }`.

### 3.1 TypeScript Type Contract

```typescript
export interface StudioExportBundle {
  /** Specification version */
  version: "1.0.0";

  /** ISO 8601 generation timestamp */
  generatedAt: string;

  /** Validated StatementParserConfig JSON DSL conforming to packages/dsl/schema.ts */
  config: StatementParserConfig;

  /** Shareable extraction fixture verifying parser accuracy */
  fixture: SanitizedFixture;

  /** Deterministic SHA-256 cryptographic signature */
  signature: string;
}

export interface SanitizedFixture {
  bankId: string;
  bankName: string;
  fileType: "pdf" | "csv";
  totalPages: number;
  totalTransactions: number;

  /** Sanitized text spans with 100% preserved bounding-box geometry */
  anonymizedTextSpans?: NormalizedTextSpan[];

  /** Sanitized CSV tabular rows */
  anonymizedCsvRows?: string[][];

  /** Extracted transaction records with anonymized descriptions and scaled minor units */
  sanitizedTransactions: SanitizedTransactionRecord[];

  /** Mathematical verification summary */
  reconciliation: {
    openingBalanceMinorUnits: string; // BigInt serialized as decimal string
    totalCreditsMinorUnits: string;
    totalDebitsMinorUnits: string;
    closingBalanceMinorUnits: string;
    isBalanced: boolean;
  };

  /** Proof of sanitization parity */
  parityVerification: {
    characterCountPreserved: boolean;
    geometryPreserved: boolean;
    mathematicalParityPreserved: boolean;
  };
}

export interface SanitizedTransactionRecord {
  date: string;                     // ISO 8601 YYYY-MM-DD
  rawDate: string;                  // Original statement date string
  description: string;              // Obfuscated description preserving structural markers
  debitMinorUnits: string;          // String-serialized bigint minor units
  creditMinorUnits: string;         // String-serialized bigint minor units
  amountMinorUnits: string;         // Signed net minor units
  runningBalanceMinorUnits?: string | null;
  hash: string;                     // Deduplication SHA-256 hash
  sequenceIndex: number;            // 0-indexed row position
}
```

### 3.2 Canonical JSON Schema Definition

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "StudioExportBundle",
  "type": "object",
  "required": ["version", "generatedAt", "config", "fixture", "signature"],
  "properties": {
    "version": { "type": "string", "enum": ["1.0.0"] },
    "generatedAt": { "type": "string", "format": "date-time" },
    "config": {
      "type": "object",
      "required": ["meta", "matchers", "pageBounds", "columns", "rowContinuation", "fields"],
      "properties": {
        "meta": {
          "type": "object",
          "required": ["bankId", "name", "fileType", "version"],
          "properties": {
            "bankId": { "type": "string" },
            "name": { "type": "string" },
            "fileType": { "type": "string", "enum": ["pdf", "csv"] },
            "version": { "type": "string" }
          }
        },
        "matchers": {
          "type": "object",
          "required": ["fileType", "contentPatterns"],
          "properties": {
            "fileType": { "type": "string", "enum": ["pdf", "csv"] },
            "contentPatterns": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
          }
        },
        "pageBounds": {
          "type": "object",
          "required": ["topMargin", "bottomMargin"],
          "properties": {
            "topMargin": { "type": "number", "minimum": 0, "maximum": 1000 },
            "bottomMargin": { "type": "number", "minimum": 0, "maximum": 1000 },
            "headerPattern": { "type": "string" },
            "footerPattern": { "type": "string" }
          }
        },
        "columns": { "type": "array" },
        "rowContinuation": {
          "type": "object",
          "required": ["dateRequired", "dateRegex", "descriptionJoiner"],
          "properties": {
            "dateRequired": { "type": "boolean" },
            "dateRegex": { "type": "string" },
            "descriptionJoiner": { "type": "string", "enum": ["\n", " "] }
          }
        },
        "fields": { "type": "object" }
      }
    },
    "fixture": {
      "type": "object",
      "required": ["bankId", "fileType", "totalTransactions", "sanitizedTransactions", "reconciliation", "parityVerification"],
      "properties": {
        "bankId": { "type": "string" },
        "fileType": { "type": "string", "enum": ["pdf", "csv"] },
        "totalTransactions": { "type": "integer", "minimum": 0 },
        "sanitizedTransactions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["date", "rawDate", "description", "debitMinorUnits", "creditMinorUnits", "amountMinorUnits", "hash", "sequenceIndex"],
            "properties": {
              "date": { "type": "string" },
              "rawDate": { "type": "string" },
              "description": { "type": "string" },
              "debitMinorUnits": { "type": "string" },
              "creditMinorUnits": { "type": "string" },
              "amountMinorUnits": { "type": "string" },
              "runningBalanceMinorUnits": { "type": ["string", "null"] },
              "hash": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
              "sequenceIndex": { "type": "integer", "minimum": 0 }
            }
          }
        },
        "reconciliation": {
          "type": "object",
          "required": ["openingBalanceMinorUnits", "totalCreditsMinorUnits", "totalDebitsMinorUnits", "closingBalanceMinorUnits", "isBalanced"],
          "properties": {
            "openingBalanceMinorUnits": { "type": "string" },
            "totalCreditsMinorUnits": { "type": "string" },
            "totalDebitsMinorUnits": { "type": "string" },
            "closingBalanceMinorUnits": { "type": "string" },
            "isBalanced": { "type": "boolean" }
          }
        },
        "parityVerification": {
          "type": "object",
          "required": ["characterCountPreserved", "geometryPreserved", "mathematicalParityPreserved"],
          "properties": {
            "characterCountPreserved": { "type": "boolean" },
            "geometryPreserved": { "type": "boolean" },
            "mathematicalParityPreserved": { "type": "boolean" }
          }
        }
      }
    },
    "signature": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$",
      "description": "SHA-256 hexadecimal digest of canonical bundle payload"
    }
  }
}
```

---

## 4. Cryptographic Signature Verification Procedure

To verify the authenticity and integrity of a shared export bundle:

```typescript
import { computeBundleSignature } from "apps/web/src/studio/sanitizer/RedactionEngine.js";

const isAuthentic = (await computeBundleSignature(bundle.config, bundle.fixture)) === bundle.signature;
```

The signature computation canonicalizes the `config` and core `fixture` fields into a UTF-8 JSON buffer and digests it via `crypto.subtle.digest("SHA-256", data)`. Any unauthorized tampering with parser boundaries or transaction values invalidates the signature.
