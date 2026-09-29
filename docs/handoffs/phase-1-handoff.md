# Phase 1 Engineering Handoff: Zero-Knowledge Local-First Sync Engine

## 1. Scope & Modules Delivered

The Phase 1 zero-knowledge, local-first engine delivers end-to-end encryption, IndexedDB local persistence, echo suppression, and Convex remote sync:

| Component | Path | Description |
| :--- | :--- | :--- |
| **Cryptography Core** | `packages/crypto/` | Key hierarchy, PBKDF2 (600,000 iter), 12-word BIP-39 mnemonic, AES-GCM-256 envelope encryption, deterministic transaction hashing. |
| **Local Database Engine** | `apps/web/src/db/` | Dexie.js `AppDB` schema, change hooks, echo suppression context, typed CRUD APIs, and `SyncCoordinator`. |
| **Remote Storage Engine** | `apps/web/convex/` | Convex schema (`encrypted_records`, `sync_cursors`), `pushBatch`, `pullChanges`, user isolation. |
| **Test Suite** | `tests/e2ee-sync.test.ts` | 15 comprehensive unit & integration tests using `fake-indexeddb`. |
| **Architecture Documentation** | `docs/architecture/e2ee-sync.md` | In-depth threat model, wire specs, key wrapping lifecycle. |

---

## 2. Typed Dexie CRUD APIs (`apps/web/src/db/crud.ts`)

All database interactions operate through type-safe, transactional functions that maintain financial precision (minor units) and respect change-tracking hooks.

### 2.1 Account Operations

```typescript
import { createAccount, updateAccount, softDeleteAccount, getAccount, listAccounts } from "@/db";

// 1. Create an Account
const account = await createAccount(db, {
  id: "acc_checking_01",
  name: "Primary Checking",
  currency: "USD",
  balanceMinorUnits: 250000n, // $2,500.00 represented as signed BigInt cents
});

// 2. Update an Account
await updateAccount(db, "acc_checking_01", {
  name: "Everyday Checking",
  balanceMinorUnits: 320000n,
});

// 3. Retrieve Single Account
const acc = await getAccount(db, "acc_checking_01");

// 4. List Accounts (Active only or with tombstones)
const activeAccounts = await listAccounts(db, false);
const allAccounts = await listAccounts(db, true);

// 5. Soft Delete Account (Creates Tombstone & Enqueues DELETE for Sync)
await softDeleteAccount(db, "acc_checking_01");
```

### 2.2 Transaction Operations & Deduplication

```typescript
import {
  createTransaction,
  updateTransaction,
  softDeleteTransaction,
  getTransaction,
  listTransactionsByAccount,
  findTransactionByHash,
  DuplicateTransactionError,
} from "@/db";

// 1. Create Transaction (Hash is automatically calculated if omitted)
try {
  const tx = await createTransaction(db, {
    id: "tx_payroll_1001",
    accountId: "acc_checking_01",
    date: "2026-09-29",
    description: "Employer Direct Deposit",
    amountMinorUnits: 500000n, // +$5,000.00
    runningBalanceMinorUnits: 750000n,
  });
} catch (err) {
  if (err instanceof DuplicateTransactionError) {
    console.warn(`Duplicate transaction rejected by hash: ${err.hash}`);
  }
}

// 2. Update Transaction (Re-computes hash automatically if details changed)
await updateTransaction(db, "tx_payroll_1001", {
  description: "Employer Payroll Deposit",
});

// 3. Query Transactions by Account
const transactions = await listTransactionsByAccount(db, "acc_checking_01", false);

// 4. Find Transaction by Deduplication Hash
const existingTx = await findTransactionByHash(db, "64_char_hex_hash...");

// 5. Soft Delete Transaction
await softDeleteTransaction(db, "tx_payroll_1001");
```

### 2.3 Cryptographic Key Storage

```typescript
import { saveCryptoKeys, getCryptoKeys } from "@/db";

// Persist encrypted key hierarchy locally
await saveCryptoKeys(db, keyRecord);

// Load encrypted key hierarchy on app startup
const keys = await getCryptoKeys(db);
```

---

## 3. Transaction Hash Generation Specification

To ensure idempotency and eliminate duplicate imported transactions, a deterministic SHA-256 digest is calculated across normalized transaction fields:

### 3.1 Normalization Algorithm
Given transaction attributes:
1. `accountId`: Trim leading/trailing whitespace (`input.accountId.trim()`).
2. `date`: Trim whitespace; normalized ISO 8601 string (`input.date.trim()`).
3. `description`: Trim whitespace and convert to lowercase (`input.description.trim().toLowerCase()`).
4. `amountMinorUnits`: String representation of signed integer (`input.amountMinorUnits.toString().trim()`).

### 3.2 Canonical String & Digest
```
canonicalString = `${normalizedAccountId}|${normalizedDate}|${normalizedDescription}|${normalizedAmount}`
digest = SHA256(UTF8(canonicalString))
hash = 64-character lowercase hex string
```

### 3.3 Database Enforcement
Dexie enforces a unique index `&hash` on `transactions`:
```typescript
this.version(1).stores({
  transactions: "id, accountId, date, description, amountMinorUnits, runningBalanceMinorUnits, &hash, updatedAt, deletedAt",
});
```
Any insertion collision throws `DuplicateTransactionError`, safeguarding the local ledger against double-entry errors.

---

## 4. Test Suite Execution (`fake-indexeddb`)

### 4.1 Running Tests
The test suite utilizes Node.js's native test runner (`node:test`) and `fake-indexeddb` to execute in any terminal or CI/CD environment without browser dependencies:

```bash
npm test
```

### 4.2 Configuration Details for Node.js
Dexie requires its dependencies to be assigned directly when executing under Node.js:
```typescript
import Dexie from "dexie";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
```

### 4.3 Test Coverage Summary (15 Tests Across 4 Test Suites)

```
▶ 1. Cryptographic Architecture (packages/crypto)
  ✔ PBKDF2 iteration parameter is strictly 600,000 (0.7ms)
  ✔ generates and validates 12-word BIP-39 mnemonic phrase (3.5ms)
  ✔ initializes key hierarchy, wraps DEK, and recovers DEK with password and recovery phrase (324.2ms)
  ✔ encrypts with unique 96-bit IV per write and produces opaque ciphertext (111.4ms)
  ✔ deterministic transaction hash generation enforces idempotency (0.9ms)
✔ 1. Cryptographic Architecture (packages/crypto) (442.1ms)

▶ 2. Local Database Engine & Echo Suppression (apps/web/src/db)
  ✔ instantiates Dexie database and stores cryptoKeys (123.6ms)
  ✔ creates, updates, and soft-deletes accounts while enqueuing to syncQueue (10.7ms)
  ✔ enforces unique index on transactions.hash and prevents duplicates (3.6ms)
  ✔ Echo Suppression: remote sync writes NEVER enqueue to syncQueue (2.8ms)
✔ 2. Local Database Engine & Echo Suppression (apps/web/src/db) (141.3ms)

▶ 3. Sync Coordinator & Remote Storage (apps/web/src/db/syncCoordinator & apps/web/convex)
  ✔ outbound flush encrypts payload and commits batch, then purges syncQueue (112.8ms)
  ✔ inbound pull fetches remote changes, decrypts, and applies with echo suppression (4.6ms)
  ✔ Last-Write-Wins (LWW) conflict resolution and tombstone preservation (1.0ms)
  ✔ offline awareness and exponential backoff retry schedule (2.9ms)
✔ 3. Sync Coordinator & Remote Storage (apps/web/src/db/syncCoordinator & apps/web/convex) (231.7ms)

▶ 4. Remote Storage Engine Handlers (apps/web/convex)
  ✔ rejects unauthenticated requests to pushBatch and pullChanges (25.9ms)
  ✔ enforces strict user isolation: User A cannot pull User B records (0.5ms)
✔ 4. Remote Storage Engine Handlers (apps/web/convex) (26.5ms)

15 passed, 0 failed (Total runtime: ~970ms)
```

---

## 5. Integration Guide for Frontend Engineers (Phase 2)

### 5.1 Unlocking the Database on User Login
```typescript
import { getDatabase, getCryptoKeys, saveCryptoKeys } from "@/db";
import { initKeyHierarchy, unlockDekWithPassword, unlockDekWithRecoveryPhrase } from "@finview/crypto";

const db = getDatabase();

// Case A: First time setup / registration
const { dek, mnemonic, keyRecord } = await initKeyHierarchy(userPassword);
await saveCryptoKeys(db, keyRecord);
// Display `mnemonic` to user as their 12-word recovery phrase!

// Case B: Subsequent login
const keyRecord = await getCryptoKeys(db);
if (keyRecord) {
  const dek = await unlockDekWithPassword(userPassword, keyRecord);
  syncCoordinator.setActiveDek(dek);
  syncCoordinator.start();
}
```

### 5.2 Starting the Sync Coordinator
```typescript
import { SyncCoordinator } from "@/db";
import { useConvex } from "convex/react";
import { api } from "../convex/_generated/api";

const convex = useConvex();

const remoteClient = {
  pushBatch: (records) => convex.mutation(api.sync.pushBatch, { records }),
  pullChanges: (since) => convex.query(api.sync.pullChanges, { since }),
};

const coordinator = new SyncCoordinator({
  db,
  remoteClient,
  activeDek: unlockedDek,
  pollIntervalMs: 15000,
});

coordinator.start();
```
