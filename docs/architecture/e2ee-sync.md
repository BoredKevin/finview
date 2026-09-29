# Zero-Knowledge, Local-First Synchronization Engine Architecture

## 1. Executive Summary & Design Invariants

Finview implements an end-to-end encrypted (E2EE), zero-knowledge, local-first data architecture for sensitive personal financial telemetry. Plaintext data (accounts, transaction details, balances, payees, notes) resides exclusively in the client's local IndexedDB instance managed via **Dexie.js**. Remote synchronization is handled by **Convex**, which acts strictly as an untrusted, opaque envelope store.

```
+-----------------------------------------------------------------------------------+
| CLIENT BROWSER (Trusted Execution Realm)                                          |
|                                                                                   |
|  +-----------------------+                    +--------------------------------+  |
|  |     Dexie.js (IDB)    |                    |       packages/crypto          |  |
|  |   - accounts          | <== Decrypted ===> |  - AES-GCM-256                 |  |
|  |   - transactions      |     Plaintext      |  - PBKDF2 (600,000 iter)       |  |
|  |   - syncQueue         |                    |  - BIP-39 12-word Mnemonic     |  |
|  |   - cryptoKeys        |                    |  - DEK / KEK / RK Hierarchy    |  |
|  +-----------------------+                    +--------------------------------+  |
|             |                                                  |                  |
|             | (Change Hook / Loop Protection)                  | Active DEK       |
|             v                                                  v                  |
|  +-----------------------------------------------------------------------------+  |
|  | SyncCoordinator (apps/web/src/db/syncCoordinator.ts)                        |  |
|  |  - Outbound Batching & AES-GCM Encryption                                   |  |
|  |  - Inbound Pull, Decryption & Echo Suppression (`withRemoteSync`)           |  |
|  |  - Offline Awareness & Exponential Backoff (1s -> 2s -> 5s -> 30s)          |  |
|  +-----------------------------------------------------------------------------+  |
+---------------------------------------|-------------------------------------------+
                                        | Opaque Envelopes Only
                                        | (Zero Plaintext Egress)
                                        v
+-----------------------------------------------------------------------------------+
| CONVEX BACKEND (Untrusted Remote Realm)                                           |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | schema.ts:                                                                  |  |
|  |  - encrypted_records: userId, recordId, table, ciphertext, iv, LWW attrs    |  |
|  |  - sync_cursors: userId, lastPulledAt                                       |  |
|  | operations:                                                                 |  |
|  |  - pushBatch(records[]): Last-Write-Wins (LWW) + Tombstone Retention        |  |
|  |  - pullChanges(since): Strict UserId Isolation + Incremental Delivery       |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### System Invariants

1. **Zero Plaintext Egress**: Convex servers never receive, store, or process raw amounts, merchant names, currencies, balances, or user metadata. All records are encrypted with AES-GCM-256 before leaving the client.
2. **Financial Precision**: All financial quantities are represented as signed 64-bit integer minor units (`bigint` or integer cents) to eradicate floating-point rounding errors. Custom serialization safeguards precision across JSON serialization boundaries.
3. **Echo Suppression & Loop Protection**: Changes received from remote sync pulls are inserted into IndexedDB with an execution context flag `isRemoteSync === true`. Local table change hooks suppress dispatch into `syncQueue`, preventing infinite ping-pong echo storms.

---

## 2. Cryptographic Key Hierarchy & Lifecycle

The cryptographic engine follows an isolated, hierarchical key wrapping architecture:

```
                            [ User Master Password ]
                                        |
                                        v  PBKDF2-HMAC-SHA256
                                           (600,000 iterations, 32-byte salt)
                                        |
                                        v
                            [ Key Encryption Key (KEK) ] (AES-256)
                                        |
        +-------------------------------+-------------------------------+
        |                                                               |
        v Wrap (AES-GCM-256, 96-bit IV)                                 v Wrap (AES-GCM-256, 96-bit IV)
[ wrappedDekByPassword ]                                        [ wrappedDekByRecovery ]
        ^                                                               ^
        |                                                               |
[ Data Encryption Key (DEK) ] <-----------------------------------------+
(256-bit CSPRNG AES-GCM)
        |
        | Encrypts Records (AES-GCM-256, 96-bit IV per write)
        v
[ EncryptedEnvelope ] ===> Convex Remote Storage
```

### 2.1 Data Encryption Key (DEK)
- A 256-bit cryptographically secure pseudorandom key (`crypto.getRandomValues(new Uint8Array(32))`).
- The DEK never leaves client memory in plaintext; it is never stored on disk unencrypted and is never transmitted to Convex.

### 2.2 Key Encryption Key (KEK)
- Derived from the user's master password.
- Algorithm: **PBKDF2** with **SHA-256**.
- Iterations: **600,000** (exceeding OWASP 2024 recommendations for PBKDF2-HMAC-SHA256).
- Salt: 32 bytes of CSPRNG entropy stored locally in `cryptoKeys.salt`.
- Used to wrap the DEK into `wrappedDekByPassword` with a unique 96-bit IV (`ivPassword`).

### 2.3 Recovery Key (RK) & BIP-39 Mnemonic
- Derived from a 12-word BIP-39 mnemonic phrase.
- Entropy: 128 bits of CSPRNG entropy + 4 bits SHA-256 checksum = 132 bits / 11 bits = 12 words from the standard BIP-39 English wordlist.
- Key Derivation: PBKDF2 with SHA-256 (100,000 iterations) using NFKD-normalized mnemonic phrase.
- Used to wrap the DEK into `wrappedDekByRecovery` with a unique 96-bit IV (`ivRecovery`).

### 2.4 Local Key Storage Schema (`cryptoKeys`)
Stored in Dexie table `cryptoKeys`:
```typescript
interface CryptoKeyRow {
  id: "primary";
  salt: string;                 // Base64 (32-byte CSPRNG salt)
  wrappedDekByPassword: string; // Base64 (AES-GCM-256 wrapped DEK)
  wrappedDekByRecovery: string; // Base64 (AES-GCM-256 wrapped DEK)
  ivPassword: string;           // Base64 (96-bit IV for password wrapping)
  ivRecovery: string;           // Base64 (96-bit IV for recovery wrapping)
}
```

### 2.5 Key Unlocking Workflows
- **Standard Login**: Master Password + stored `salt` -> KEK -> Unwrap `wrappedDekByPassword` with `ivPassword` -> Active DEK in memory.
- **Disaster Recovery**: 12-word BIP-39 Mnemonic -> RK -> Unwrap `wrappedDekByRecovery` with `ivRecovery` -> Active DEK in memory. Allows the user to reset their master password without data loss.

---

## 3. Envelope Specification & Wire Format

Every row written to Convex adheres to the `EncryptedEnvelope` interface:

```typescript
interface EncryptedEnvelope {
  recordId: string;
  table: "transactions" | "accounts" | "categories";
  iv: string;             // Base64 encoded 96-bit (12-byte) initialization vector
  ciphertext: string;     // Base64 encoded AES-GCM-256 ciphertext + 128-bit auth tag
  schemaVersion: number;  // Currently 1
  updatedAt: number;      // UTC epoch in milliseconds (for LWW conflict resolution)
  deletedAt: number | null; // Tombstone timestamp or null if active
}
```

### Invariants:
1. **IV Uniqueness**: Every write uses `crypto.getRandomValues(new Uint8Array(12))` to generate a distinct 96-bit IV. AES-GCM IV reuse is completely averted.
2. **Authenticated Integrity**: The 128-bit authentication tag appended to the ciphertext guarantees tamper detection; modifying any bit of ciphertext or IV causes decryption failure.
3. **BigInt Preservation**: Payloads containing `bigint` minor units are serialized via a dedicated replacer (`{ __type: "bigint", value: string }`) and parsed back to native `bigint`.

---

## 4. Conflict Resolution & Tombstone Lifecycle

### 4.1 Last-Write-Wins (LWW)
Convex applies timestamp-based Last-Write-Wins during `pushBatch`:
- When an envelope for `(userId, recordId)` arrives:
  - If no record exists: insert record.
  - If existing record exists:
    - If `incoming.updatedAt > existing.updatedAt`: patch record with new envelope.
    - If `incoming.updatedAt <= existing.updatedAt`: drop incoming record (already stale).

### 4.2 Tombstone Retention & Deletion Propagation
- Hard deletes on client databases risk zombie resurrection if another client syncs prior to receiving the delete.
- Finview represents deletions as **tombstones** (`deletedAt: number`).
- When a record is deleted locally, Dexie hooks enqueue a `DELETE` job into `syncQueue`.
- The `SyncCoordinator` generates an `EncryptedEnvelope` with `deletedAt: Date.now()`.
- Convex retains the tombstone record in `encrypted_records`.
- When peers call `pullChanges(since)`, tombstones are delivered in the change batch, and the peer marks or removes the local record in IndexedDB under echo-suppressed execution.

---

## 5. Offline Poll-and-Flush Lifecycle

The `SyncCoordinator` implements a resilient network loop:

1. **Network Detection**:
   - Inspects `navigator.onLine`.
   - Binds to `window.addEventListener('online')` and `window.addEventListener('offline')`.
   - Transitions immediately to flush when network reconnects.

2. **Exponential Backoff Schedule**:
   - Backoff intervals: `[1000, 2000, 5000, 30000]` (1s, 2s, 5s, 30s).
   - On network or remote error, retry delay increases up to the 30-second cap.
   - On successful sync cycle, backoff counter resets immediately to 0.

3. **Atomic Outbound Dequeue**:
   - Dequeues items from `syncQueue` in order of primary key (`id`).
   - Encrypts batch with active DEK.
   - Dispatches `pushBatch(envelopes)` to Convex.
   - Only upon confirmed commit: calls `db.syncQueue.bulkDelete(committedIds)`.

4. **Inbound Pull & Echo Suppression**:
   - Queries `pullChanges(lastPulledAt)` from Convex.
   - Decrypts each incoming envelope with active DEK.
   - Executes Dexie bulk update inside `withRemoteSync(async () => { ... })`.
   - Advances `lastPulledAt` cursor and commits to Convex `sync_cursors`.

---

## 6. Threat Models & Security Mitigations

| Threat | Attack Vector | Architecture Mitigation |
| :--- | :--- | :--- |
| **Untrusted Host / Server Breach** | Attacker compromises Convex database or storage snapshots. | **Zero Plaintext Egress**: Convex stores only random-looking Base64 AES-GCM ciphertexts and IVs. No financial figures, accounts, or descriptions exist in cloud memory or disk. |
| **Password Brute Force** | Attacker captures local IndexedDB snapshot and attempts offline dictionary attack on KEK. | **PBKDF2 with 600,000 iterations & 32-byte salt**: Renders offline GPU/ASIC hash cracking computationally infeasible. |
| **Lost Password** | User forgets password; needs recovery without central backdoor. | **BIP-39 12-Word Mnemonic (RK)**: Provides 128-bit cryptographic recovery phrase capable of unwrapping the original DEK without cloud intervention. |
| **Ciphertext Tampering / Bit-Flipping** | Malicious server or network actor alters ciphertext or metadata. | **AES-GCM 128-bit Auth Tag**: Any modification to ciphertext or IV causes `crypto.subtle.decrypt` to throw a DOMException, aborting ingestion. |
| **IV Reuse** | Encryption of multiple records with same IV leads to key stream recovery. | **Unique 96-bit IV per write**: Enforced via CSPRNG `getRandomBytes(12)` on every envelope creation. |
| **Cross-Tenant Data Leakage** | Malicious authenticated user attempts to pull another user's financial records. | **Strict UserId Isolation**: Convex Auth validates caller token. All queries enforce `.withIndex("by_user_updatedAt", q => q.eq("userId", authUserId))`. |
| **Echo Ping-Pong Storm** | Incoming remote write triggers local change hook, dispatching infinite sync loops. | **Loop Protection (`isRemoteSync`)**: Dexie hooks evaluate sync execution context. When `isRemoteSync === true`, `syncQueue` enqueue is skipped. |
