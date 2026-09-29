 # Declarative JSON DSL Statement Parser Engine Specification

## 1. Executive Summary & Sandboxed Architecture

Finview's statement parsing engine is a client-side, zero-knowledge, Web Worker-based pipeline engineered to ingest financial statements in PDF and CSV formats without server communication.

The engine executes statement parsing strictly through **declarative JSON Domain-Specific Language (DSL) configurations**. Arbitrary code execution, dynamic evaluations (`eval`, `new Function`), and untrusted runtime script injections are strictly prohibited by architecture and runtime configuration.

```
+-----------------------------------------------------------------------------------------+
| WEB WORKER THREAD (Sandboxed Parser Realm)                                              |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | Input: Binary PDF / CSV + StatementParserConfig JSON                              |  |
|  +-----------------------------------------------------------------------------------+  |
|         |                                                           |                   |
|         v (PDF Engine)                                              v (CSV Engine)      |
|  +-----------------------------+                             +-----------------------+  |
|  | pdfjs-dist (legacy)         |                             | PapaParse             |  |
|  | - isEvalSupported: false    |                             | - auto-delimiter ("") |  |
|  | - page.cleanup() per sheet  |                             | - streaming rows      |  |
|  | - pdfDocument.destroy()     |                             +-----------------------+  |
|  +-----------------------------+                                        |               |
|         | [Raw Text Spans & Bounding Boxes]                             |               |
|         v                                                               |               |
|  +-------------------------------------------------------------+        |               |
|  | Coordinate Normalization & Line Reconstruction              |        |               |
|  | - x_norm = round((x / pageWidth) * 1000)                    |        |               |
|  | - y_norm = round(((pageHeight - y - height) / pH) * 1000)   |        |               |
|  | - Row Clustering: |y_i - y_j| <= 3 units                    |        |               |
|  | - Sort spans by x_norm ascending                            |        |               |
|  +-------------------------------------------------------------+        |               |
|         | [Reconstructed Tabular Rows]                                  |               |
|         +------------------------------+--------------------------------+               |
|                                        |                                                |
|                                        v                                                |
|  +-----------------------------------------------------------------------------------+  |
|  | Safe DSL Execution Engine (packages/dsl/engine.ts)                                |  |
|  |  - Static ReDoS Validation (rejects nested quantifiers)                           |  |
|  |  - 50ms Per-Page Deadline Watchdog Timeout Interrupt                              |  |
|  |  - Exact Integer Minor Units Conversion (bigint cents, zero float math)          |  |
|  |  - Multi-line Description Continuation Assembler                                  |  |
|  |  - Deterministic Phase 1 SHA-256 Deduplication Hash:                               |  |
|  |    sha256(accountId:date:amountMinorUnits:runningBalanceMinorUnits:sequenceIndex) |  |
|  +-----------------------------------------------------------------------------------+  |
|                                        |                                                |
|                                        v                                                |
|  +-----------------------------------------------------------------------------------+  |
|  | Comlink RPC Interface (apps/web/src/workers/parser.worker.ts)                     |  |
|  +-----------------------------------------------------------------------------------+  |
+----------------------------------------|------------------------------------------------+
                                         | Structured Array of ParsedTransaction
                                         v
+-----------------------------------------------------------------------------------------+
| MAIN BROWSER THREAD (UI / Dexie Local Storage)                                          |
|  - Ingests ParsedTransaction[]                                                          |
|  - Deduplicates via Dexie unique index: transactions.&hash                              |
+-----------------------------------------------------------------------------------------+
```

### System Invariants

1. **Complete Sandbox**: Dynamic code evaluation (`eval`, `new Function`, dynamic import) is strictly forbidden. The PDF worker configuration sets `isEvalSupported: false`.
2. **ReDoS Protection**: Any regular expression containing nested repetitions (e.g., `(a+)+`, `([a-zA-Z]+)*`, `(\d+)+`) is rejected statically before execution. All regex operations run under an active 50ms deadline watchdog per page.
3. **Memory Safety**: `page.cleanup()` is explicitly called on every parsed page, and `pdfDocument.destroy()` is called in a `finally` block upon completion, guaranteeing zero memory accumulation across 100+ page runs.
4. **Financial Arithmetic Integrity**: All decimal values are parsed directly into signed 64-bit integer minor units (`bigint`), eliminating floating-point rounding hazards.

---

## 2. Declarative DSL Specification (`packages/dsl/schema.ts`)

The statement parser is driven by the Zod schema `StatementParserConfigSchema`. Every bank parser configuration must be a valid JSON document conforming to this specification:

### 2.1 Schema Definition

```typescript
import { z } from "zod";

export const StatementParserConfigSchema = z.object({
  meta: z.object({
    bankId: z.string().min(1),
    name: z.string().min(1),
    fileType: z.enum(["pdf", "csv"]),
    version: z.string().min(1),
  }),
  matchers: z.object({
    fileType: z.enum(["pdf", "csv"]),
    contentPatterns: z.array(z.string().min(1)).min(1),
  }),
  pageBounds: z.object({
    topMargin: z.number().min(0).max(1000),
    bottomMargin: z.number().min(0).max(1000),
    headerPattern: z.string().optional(),
    footerPattern: z.string().optional(),
  }),
  columns: z.union([
    z.array(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      xStart: z.number().min(0).max(1000),
      xEnd: z.number().min(0).max(1000),
    })),
    z.array(z.object({
      id: z.string().min(1),
      name: z.string().optional(),
      columnIndex: z.number().int().min(0),
    })),
  ]),
  rowContinuation: z.object({
    dateRequired: z.boolean(),
    dateRegex: z.string().min(1),
    descriptionJoiner: z.enum(["\n", " "]),
  }),
  fields: z.object({
    date: z.object({
      columnId: z.string().min(1),
      format: z.string().min(1),
    }),
    description: z.object({
      columnIds: z.array(z.string().min(1)).min(1),
      sanitizeRegex: z.string().optional(),
    }),
    amountStrategy: z.union([
      // Single Column Mode
      z.object({
        mode: z.literal("single").optional(),
        columnId: z.string().min(1),
        debitIndicator: z.object({
          pattern: z.string().min(1),
          position: z.enum(["prefix", "suffix"]),
        }),
        decimalSep: z.enum([",", "."]),
        thousandSep: z.enum([".", ","]),
      }),
      // Split Column Mode
      z.object({
        mode: z.literal("split").optional(),
        debitColumnId: z.string().min(1),
        creditColumnId: z.string().min(1),
        decimalSep: z.enum([",", "."]),
        thousandSep: z.enum([".", ","]),
      }),
    ]),
    balance: z.object({
      columnId: z.string().min(1),
      optional: z.boolean(),
    }),
  }),
});
```

---

## 3. Coordinate Normalization & Line Reconstruction

PDF user space defines its origin $(0, 0)$ at the bottom-left of the page with dimensions in points ($1/72$ inch). Visual layout and web screen space define origin $(0, 0)$ at the top-left.

### 3.1 Normalization Mathematical Formulas

Every extracted character bounding box $(x, y, \text{width}, \text{height})$ is converted into a normalized integer coordinate grid ranging from $0$ to $1000$:

$$x_{\text{norm}} = \text{clamp}\left(0, 1000, \text{round}\left(\frac{x}{\text{pageWidth}} \times 1000\right)\right)$$

$$y_{\text{norm}} = \text{clamp}\left(0, 1000, \text{round}\left(\frac{\text{pageHeight} - y - \text{height}}{\text{pageHeight}} \times 1000\right)\right)$$

$$w_{\text{norm}} = \text{clamp}\left(0, 1000, \text{round}\left(\frac{\text{width}}{\text{pageWidth}} \times 1000\right)\right)$$

$$h_{\text{norm}} = \text{clamp}\left(0, 1000, \text{round}\left(\frac{\text{height}}{\text{pageHeight}} \times 1000\right)\right)$$

### 3.2 Row Clustering Algorithm ($\Delta y \le 3$)

Extracted spans are partitioned into coherent horizontal lines:
1. Spans are sorted by $y_{\text{norm}}$ ascending (top-to-bottom), then $x_{\text{norm}}$ ascending.
2. A span $S$ is assigned to an existing row $R$ if:
   $$|S.y - R.\text{anchorY}| \le 3$$
3. If no row satisfies the threshold, a new row is initialized with $R.\text{anchorY} = S.y$.
4. Within each row, items are sorted strictly by $x_{\text{norm}}$ ascending.

### 3.3 Column Projection

For each column $C$ defined in `columns` with horizontal boundaries $[C.xStart, C.xEnd]$:
A text span $S$ is mapped to column $C$ if:
$$(S.x \ge C.xStart - 2 \land S.x \le C.xEnd + 2) \lor \left(S.x + \frac{S.width}{2} \in [C.xStart, C.xEnd]\right)$$
Spans within the same column are joined with a single space.

---

## 4. ReDoS Protection & Execution Deadline Watchdog

### 4.1 Static Regex Parser Analysis

Before compiling or executing any pattern from a DSL configuration, the engine executes `assertSafeRegex(pattern)`:
1. **Pre-filter signature checks**:
   Rejects nested repetition quantifiers such as:
   - `\((?:[^()\\]|\\.)*[*+]\s*\)[*+]` (e.g. `(a+)+`, `(a*)*`, `(a+)*`)
   - `\((?:\[(?:[^\]\\]|\\.)*\]|[^()\\]|\\.)*[*+]\s*\)[*+]` (e.g. `([a-zA-Z]+)*`)
   - `\((?:[^()\\]|\\.)*\{\s*\d+\s*,\s*\d*\s*\}[^()]*\)[*+]`
2. **Deep structural scanner**:
   Iterates through tokens, tracking group parenthesis nesting levels while skipping escape sequences and character classes `[...]`.
   If a group contains an inner quantifier and is immediately followed by an outer quantifier (`+`, `*`, `{n,m}`), compilation is rejected immediately with `ReDoSValidationError`.

### 4.2 50ms Per-Page Deadline Watchdog

Each page execution initializes `DeadlineWatchdog(50)`:
```typescript
export class DeadlineWatchdog {
  private startTime = performance.now();
  constructor(private deadlineMs = 50) {}
  check(): void {
    if (performance.now() - this.startTime > this.deadlineMs) {
      throw new ReDoSTimeoutError("50ms execution deadline exceeded");
    }
  }
}
```
Watchdog checks are performed before and after row extraction and regex evaluation. Any runaway execution aborts immediately.

---

## 5. Exact Minor Units Conversion & Deduplication Hashing

### 5.1 Float-Free Integer Arithmetic (`bigint`)

All financial quantities are parsed without floating-point conversion:
1. Strip thousand separators (`.` or `,`).
2. Detect decimal separator position.
3. Extract integer string and fractional string.
4. Normalize fractional string to 2 decimal digits (`cents`).
5. Calculate minor units:
   $$\text{minorUnits} = \text{BigInt}(\text{integerPart}) \times 100n + \text{BigInt}(\text{fractionalPart})$$
6. If debit, $\text{minorUnits} = -\text{minorUnits}$.

### 5.2 Deterministic Statement Deduplication Hash

To prevent duplicate transaction insertions into Dexie, a SHA-256 hash is computed using the canonical format:

$$\text{digest} = \text{SHA-256}(accountId + \text{":"} + date + \text{":"} + amountMinorUnits + \text{":"} + runningBalanceMinorUnits + \text{":"} + sequenceIndex)$$

```typescript
const canonicalString = `${accountId}:${date}:${amountMinorUnits}:${runningBalanceMinorUnits ?? "0"}:${sequenceIndex}`;
const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalString));
```

The resulting 64-character hex string maps directly to `transactions.hash`, matching the Phase 1 Dexie unique index `&hash`.

---

## 6. Edge-Case Mapping & Reference Configurations

### 6.1 Case A: Multi-Line Continuation & Trailing "DB" Marker (`bca-individual-pdf.json`)

**Challenge**:
In Tahapan BCA statements:
- Transaction descriptions span 2 to 4 vertical lines.
- Date only appears on line 1 (format `DD/MM`).
- Lines 2 and 3 contain recipient account, bank code, or transfer notes.
- Amounts use Indonesian notation (`1.500.000,00`) with a trailing `"DB"` marker for debits.

**Solution**:
```json
{
  "meta": {
    "bankId": "bca",
    "name": "BCA Individual Account Statement",
    "fileType": "pdf",
    "version": "1.0.0"
  },
  "columns": [
    { "id": "date", "name": "Tanggal", "xStart": 30, "xEnd": 120 },
    { "id": "description", "name": "Keterangan", "xStart": 120, "xEnd": 480 },
    { "id": "branch", "name": "Cabang", "xStart": 480, "xEnd": 550 },
    { "id": "amount", "name": "Mutasi", "xStart": 550, "xEnd": 790 },
    { "id": "balance", "name": "Saldo", "xStart": 790, "xEnd": 980 }
  ],
  "rowContinuation": {
    "dateRequired": true,
    "dateRegex": "^\\d{2}/\\d{2}$",
    "descriptionJoiner": "\n"
  },
  "fields": {
    "date": { "columnId": "date", "format": "DD/MM" },
    "description": { "columnIds": ["description"], "sanitizeRegex": "[\\r\\t]+" },
    "amountStrategy": {
      "columnId": "amount",
      "debitIndicator": { "pattern": "DB", "position": "suffix" },
      "decimalSep": ",",
      "thousandSep": "."
    },
    "balance": { "columnId": "balance", "optional": false }
  }
}
```

### 6.2 Case B: Split Debit/Credit Columns (`cimb-niaga-pdf.json`)

**Challenge**:
Debits and credits reside in distinct columns rather than a signed single column.

**Solution**:
```json
{
  "meta": {
    "bankId": "cimb-niaga",
    "name": "CIMB Niaga Account Statement",
    "fileType": "pdf",
    "version": "1.0.0"
  },
  "columns": [
    { "id": "date", "name": "Tanggal Transaksi", "xStart": 30, "xEnd": 120 },
    { "id": "valDate", "name": "Tanggal Valuta", "xStart": 120, "xEnd": 210 },
    { "id": "description", "name": "Uraian Transaksi", "xStart": 210, "xEnd": 520 },
    { "id": "debit", "name": "Debet", "xStart": 520, "xEnd": 670 },
    { "id": "credit", "name": "Kredit", "xStart": 670, "xEnd": 830 },
    { "id": "balance", "name": "Saldo", "xStart": 830, "xEnd": 970 }
  ],
  "rowContinuation": {
    "dateRequired": true,
    "dateRegex": "^\\d{2}/\\d{2}/\\d{4}$",
    "descriptionJoiner": "\n"
  },
  "fields": {
    "date": { "columnId": "date", "format": "DD/MM/YYYY" },
    "description": { "columnIds": ["description"], "sanitizeRegex": "[\\r\\t]+" },
    "amountStrategy": {
      "debitColumnId": "debit",
      "creditColumnId": "credit",
      "decimalSep": ",",
      "thousandSep": "."
    },
    "balance": { "columnId": "balance", "optional": false }
  }
}
```

### 6.3 Case C: Structured CSV Index Extraction (`blu-bca-csv.json`)

**Challenge**:
CSV statements with variable column arrangements requiring zero-indexed column mapping and auto-delimiter detection.

**Solution**:
```json
{
  "meta": {
    "bankId": "blu-bca",
    "name": "blu by BCA Digital CSV Statement",
    "fileType": "csv",
    "version": "1.0.0"
  },
  "columns": [
    { "id": "date", "columnIndex": 0 },
    { "id": "description", "columnIndex": 1 },
    { "id": "type", "columnIndex": 2 },
    { "id": "amount", "columnIndex": 3 },
    { "id": "balance", "columnIndex": 4 }
  ],
  "rowContinuation": {
    "dateRequired": true,
    "dateRegex": "^\\d{4}-\\d{2}-\\d{2}$",
    "descriptionJoiner": " "
  },
  "fields": {
    "date": { "columnId": "date", "format": "YYYY-MM-DD" },
    "description": { "columnIds": ["description"] },
    "amountStrategy": {
      "columnId": "amount",
      "debitIndicator": { "pattern": "-", "position": "prefix" },
      "decimalSep": ".",
      "thousandSep": ","
    },
    "balance": { "columnId": "balance", "optional": false }
  }
}
```
