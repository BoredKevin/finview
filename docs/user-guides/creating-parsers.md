# Visual Parser Authoring Guide: Creating Bank Statement Parsers in Parser Studio

## 1. Overview & Architectural Principles

**Parser Studio** (`apps/web/src/studio/`) is an interactive, zero-knowledge visual workspace engineered to author, test, and sanitize declarative statement parser configurations directly against proprietary bank statements (PDF and CSV) without writing code or generating executable scripts.

```
+----------------------------------------------------------------------------------------------------+
|                                      PARSER STUDIO WORKSPACE                                       |
|                                                                                                    |
|  [ LEFT PANEL: Document Canvas ]                   [ RIGHT PANEL: Tooling & Verification ]          |
|  +---------------------------------------+         +---------------------------------------------+ |
|  | - PDF Page HTML5 Canvas               |         | TABS:                                       | |
|  | - Overlaid Interactive SVG Surface    |         | 1. Visual Configuration Wizard              | |
|  | - 0..1000 Normalized Coordinate Grid  | ------> |    - Column Bounds, Canonical Mapping       | |
|  | - Draggable Column Guides [xStart-xEnd|         |    - Debit/Credit Rule Builder (Single/Split| |
|  | - Top/Bottom Page Cutoff Margins      |         |    - Date Format Selector & Row Preview     | |
|  | - Live Text Span Highlights           |         | 2. Ledger & Mathematical Reconciliation     | |
|  +---------------------------------------+         |    - Opening + Credits - Debits == Closing  | |
|                                                    |    - Row Continuity & Missing Balance Alerts| |
|                                                    | 3. PII Sanitizer & Fixture Generator        | |
|                                                    |    - Character-Preserving Masking           | |
|                                                    |    - Structural Marker Retention            | |
|                                                    |    - Proportional Scalar & Verified Export  | |
|                                                    +---------------------------------------------+ |
+----------------------------------------------------------------------------------------------------+
```

### System Invariants

1. **Zero Local Retention**: Uploaded bank statements remain strictly in ephemeral React state (`useRef` / `useState`). They are **never** written to IndexedDB, Dexie tables, localStorage, caches, or transmitted across the network. Memory can be zeroed out immediately via the **Purge Buffer** action.
2. **Sanitization Parity**: The PII redaction pipeline guarantees 100% parity across:
   - **Character Count Parity**: Masked strings have the exact character length and whitespace preservation.
   - **Geometry Parity**: $0 \to 1000$ spatial bounding boxes are untouched.
   - **Mathematical Balance Parity**: Applying proportional scalars scales opening, debits, credits, and closing balances such that `Opening' + Sum(Credits') - Sum(Debits') == Closing'` holds to the cent.
3. **Sandbox & ReDoS Protection**: All regular expressions are statically screened against nested repetition vulnerabilities and monitored by a 50ms per-page deadline watchdog.

---

## 2. Coordinate System & Normalization

All PDF statement dimensions are normalized into an integer coordinate grid ranging from $0$ to $1000$ independently of the physical PDF page size:

$$x_{\text{norm}} = \text{clamp}\left(0, 1000, \text{round}\left(\frac{x}{\text{pageWidth}} \times 1000\right)\right)$$

$$y_{\text{norm}} = \text{clamp}\left(0, 1000, \text{round}\left(\frac{\text{pageHeight} - y - \text{height}}{\text{pageHeight}} \times 1000\right)\right)$$

- $(0, 0)$ is the **top-left corner** of the page.
- $(1000, 1000)$ is the **bottom-right corner** of the page.
- Dragging guides in the SVG layer updates these normalized integers directly.

---

## 3. Modeling Bank Formats

### 3.1 Case A: Single-Column Amounts with Trailing "DB" & Multi-Line Continuations (e.g. BCA)

Tahapan BCA statements present two distinct structural modeling challenges:
1. **Multi-line descriptions**: The date appears on the first line (e.g., `01/10`), while recipient accounts, bank codes, or transfer notes continue on lines 2 and 3 without dates.
2. **Single signed amount column**: Mutasi values are displayed in Indonesian notation (`1.500.000,00`) with a trailing `"DB"` marker indicating debits/outflows.

```
01/10  TRSF E-BANKING DB          0000     1.500.000,00 DB     18.500.000,00
       TRANSFER KE REK 0987654321
       BIF DANA DARURAT
```

#### Step-by-Step Configuration Workflow:

1. **Set Page Bounds**:
   - Drag the **Top Cutoff** line down to $y = 150$ to exclude the bank logo, account details, and column header titles (`TANGGAL`, `KETERANGAN`, `CB`, `MUTASI`, `SALDO`).
   - Drag the **Bottom Cutoff** line up to $y = 920$ to exclude the statement summary box (`SALDO AWAL`, `MUTASI CR`, `MUTASI DB`, `SALDO AKHIR`).
2. **Position Column Guides**:
   - Align the 5 column bounds:
     - `date`: $xStart = 30$, $xEnd = 120$
     - `description`: $xStart = 120$, $xEnd = 480$
     - `branch`: $xStart = 480$, $xEnd = 550$
     - `amount`: $xStart = 550$, $xEnd = 790$
     - `balance`: $xStart = 790$, $xEnd = 980$
3. **Configure Row Continuation**:
   - Toggle **Date Anchor Required** to `ON`.
   - Set **Date Regex Pattern** to `^\d{2}/\d{2}$`. Lines lacking a valid `DD/MM` date will automatically be merged into the preceding transaction.
   - Set **Description Joiner** to `\n` (Newline) to preserve multi-line transaction narratives.
4. **Configure Debit/Credit Strategy**:
   - Select **Single Column Mode**.
   - Amount Column: `amount`.
   - Debit Indicator Pattern: `DB`.
   - Debit Indicator Position: `suffix`.
   - Thousand Separator: `.` (Dot).
   - Decimal Separator: `,` (Comma).
5. **Configure Date Format**:
   - Select `DD/MM`. Verify against the real-time preview showing normalized dates (e.g., `2024-10-01`).

---

### 3.2 Case B: Split Debit and Credit Columns (e.g. CIMB Niaga)

In statements like CIMB Niaga, debits and credits reside in distinct, dedicated columns:

```
TGL TRANSAKSI  TGL VALUTA  URAIAN TRANSAKSI           DEBET          KREDIT         SALDO
01/10/2024     01/10/2024  TRANSFER BI-FAST           2.000.000,00                  48.000.000,00
15/10/2024     15/10/2024  SALARY CREDIT PT ABC                      15.000.000,00  63.000.000,00
```

#### Step-by-Step Configuration Workflow:

1. **Set Column Guides**:
   - `date`: $xStart = 30$, $xEnd = 120$
   - `valDate`: $xStart = 120$, $xEnd = 210$
   - `description`: $xStart = 210$, $xEnd = 520$
   - `debit`: $xStart = 520$, $xEnd = 670$
   - `credit`: $xStart = 670$, $xEnd = 830$
   - `balance`: $xStart = 830$, $xEnd = 970$
2. **Configure Amount Strategy**:
   - Toggle to **Split Columns Mode**.
   - Assign **Debit Column**: `debit`.
   - Assign **Credit Column**: `credit`.
   - Separators: Thousand `.` and Decimal `,`.
3. **Configure Date Format**:
   - Select `DD/MM/YYYY`. Verify against extracted preview rows.

---

### 3.3 Case C: Multi-Column CSV Statements (e.g. Blu BCA)

CSV statements require zero-indexed column mappings with auto-delimiter detection:

```csv
Date,Description,Type,Amount,Balance
2024-10-01,Top up e-Wallet Gopay,DEBIT,-100000.00,4900000.00
2024-10-05,Transfer from BCA Account,CREDIT,2500000.00,7400000.00
```

#### Step-by-Step Configuration Workflow:

1. **Map Zero-Indexed Columns**:
   - `date`: Column Index `0`
   - `description`: Column Index `1`
   - `type`: Column Index `2`
   - `amount`: Column Index `3`
   - `balance`: Column Index `4`
2. **Set Numeric Strategy**:
   - Mode: `Single`. Debit Indicator: `-` (prefix).
   - Thousand Separator: `,` (Comma), Decimal Separator: `.` (Dot).
3. **Date Format**:
   - Select `YYYY-MM-DD`.

---

## 4. Verification & Mathematical Parity Engine

Every configuration adjustment triggers a debounced (150ms) background re-parse via the Web Worker pipeline.

The engine verifies the fundamental mathematical equality across the document:

$$\text{OpeningBalance} + \sum \text{Credits} - \sum \text{Debits} == \text{ClosingBalance}$$

### Ledger Visual Indicators:

- 🟢 **LEDGER BALANCED (DELTA: 0.00)**: Global equation holds exactly, and every consecutive row satisfies $Balance_i = Balance_{i-1} + NetMutation_i$.
- 🔴 **DISCREPANCY (Delta: Rp X)**: Highlights when cumulative transactions fail to balance against the reported closing balance.
- 🔴 **Continuity Error**: Highlighted row where the running balance does not match the previous row plus current transaction net amount.
- 🔴 **Malformed Date**: Highlighted row where date string fails pattern parsing.
- 🟡 **Missing Balance**: Row where required running balance is empty.

---

## 5. PII Redaction & Shareable Fixture Generation

When exporting a parser definition to contribute to the community repository or test suites, the **PII Sanitizer** guarantees zero disclosure of personal data while preserving testability.

### Redaction Capabilities:

1. **Account Number Masking**: Account numbers, credit card 16-digit sequences, and IBANs are scrambled with randomized digits while maintaining identical character lengths and hyphens.
2. **Customer Header Anonymization**: Customer names, tax IDs, and addresses in statement headers are replaced with synthetic text of matching length.
3. **Narrative Obfuscation**: Merchant names, counterparty details, and remarks are scrambled into synthetic strings while keeping structural markers intact (`TRANSFER`, `DB`, `CR`, `BIF`, `ATM`, `QRIS`, `SETORAN`, `BUNGA`, `PAJAK`).
4. **Proportional Scalar**: Adjusting the amount multiplier (e.g. $1.35\times$) scales opening balance, debits, credits, and closing balance proportionally, mathematically ensuring zero discrepancy.

### Verified Export Artifact:

Clicking **Generate Verified Export Bundle** produces a cryptographically signed `.json` file containing:
- The parser DSL configuration (`config`).
- The sanitized test fixture (`fixture`).
- A 64-character SHA-256 digest signature (`signature`).
