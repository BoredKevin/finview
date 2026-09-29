import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

import Dexie from "dexie";
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as any).indexedDB = indexedDB;
(globalThis as any).IDBKeyRange = IDBKeyRange;

import {
  generateMnemonic,
  validateMnemonic,
  initKeyHierarchy,
  unlockDekWithPassword,
  unlockDekWithRecoveryPhrase,
  encryptRecord,
  decryptRecord,
  generateTransactionHash,
  PBKDF2_ITERATIONS,
  EncryptedEnvelope,
} from "../packages/crypto/src/index.js";

import {
  AppDB,
  createAccount,
  getAccount,
  updateAccount,
  softDeleteAccount,
  listAccounts,
  createTransaction,
  getTransaction,
  updateTransaction,
  softDeleteTransaction,
  listTransactionsByAccount,
  findTransactionByHash,
  DuplicateTransactionError,
  saveCryptoKeys,
  getCryptoKeys,
  isRemoteSync,
  setRemoteSync,
  withRemoteSync,
  SyncCoordinator,
  RemoteSyncClient,
} from "../apps/web/src/db/index.js";

describe("1. Cryptographic Architecture (packages/crypto)", () => {
  test("PBKDF2 iteration parameter is strictly 600,000", () => {
    assert.equal(PBKDF2_ITERATIONS, 600_000);
  });

  test("generates and validates 12-word BIP-39 mnemonic phrase", async () => {
    const mnemonic = await generateMnemonic();
    const words = mnemonic.split(" ");
    assert.equal(words.length, 12, "Mnemonic must have exactly 12 words");

    const isValid = await validateMnemonic(mnemonic);
    assert.equal(isValid, true, "Generated mnemonic must pass checksum verification");

    const invalidMnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";
    const isInvalidValid = await validateMnemonic(invalidMnemonic);
    assert.equal(isInvalidValid, false, "Invalid checksum sequence must fail validation");

    const nonWordlist = "foo bar baz qux foo bar baz qux foo bar baz qux";
    assert.equal(await validateMnemonic(nonWordlist), false, "Words not in BIP-39 list must fail");
  });

  test("initializes key hierarchy, wraps DEK, and recovers DEK with password and recovery phrase", async () => {
    const password = "SuperSecretMasterPassword!2026";
    const { dek, mnemonic, keyRecord } = await initKeyHierarchy(password);

    assert.equal(keyRecord.id, "primary");
    assert.ok(keyRecord.salt, "Salt must be generated");
    assert.ok(keyRecord.wrappedDekByPassword, "DEK must be wrapped by password");
    assert.ok(keyRecord.wrappedDekByRecovery, "DEK must be wrapped by recovery phrase");
    assert.ok(keyRecord.ivPassword, "ivPassword must be present");
    assert.ok(keyRecord.ivRecovery, "ivRecovery must be present");

    // Test a payload encrypted with the original DEK
    const testSecret = { secretNote: "Zero knowledge proof payload", balanceMinorUnits: 420000n };
    const envelope = await encryptRecord({
      recordId: "rec_test_1",
      table: "accounts",
      payload: testSecret,
      dek,
    });

    // 1. Recover DEK via password
    const recoveredDekByPassword = await unlockDekWithPassword(password, keyRecord);
    const decrypted1 = await decryptRecord(envelope, recoveredDekByPassword);
    assert.deepEqual(decrypted1, testSecret);

    // Wrong password should fail decryption
    await assert.rejects(async () => {
      const wrongDek = await unlockDekWithPassword("WrongPassword123!", keyRecord);
      await decryptRecord(envelope, wrongDek);
    });

    // 2. Recover DEK via BIP-39 12-word mnemonic
    const recoveredDekByRecovery = await unlockDekWithRecoveryPhrase(mnemonic, keyRecord);
    const decrypted2 = await decryptRecord(envelope, recoveredDekByRecovery);
    assert.deepEqual(decrypted2, testSecret);
  });

  test("encrypts with unique 96-bit IV per write and produces opaque ciphertext", async () => {
    const { dek } = await initKeyHierarchy("test-password-iv");
    const payload = { accountId: "acc_1", amountMinorUnits: 1550n };

    const env1 = await encryptRecord({ recordId: "rec_1", table: "transactions", payload, dek });
    const env2 = await encryptRecord({ recordId: "rec_1", table: "transactions", payload, dek });

    assert.notEqual(env1.iv, env2.iv, "Each write must have a unique IV");
    assert.notEqual(env1.ciphertext, env2.ciphertext, "Identical payloads must yield distinct ciphertexts due to fresh IVs");

    assert.equal(env1.table, "transactions");
    assert.equal(env1.schemaVersion, 1);
    assert.equal(env1.deletedAt, null);
  });

  test("deterministic transaction hash generation enforces idempotency", async () => {
    const input1 = {
      accountId: "acc_xyz_1",
      date: "2026-09-29",
      description: "Coffee Shop Downtown",
      amountMinorUnits: -450n,
    };

    const input2 = {
      accountId: "  acc_xyz_1  ",
      date: "2026-09-29",
      description: "coffee shop downtown",
      amountMinorUnits: "-450",
    };

    const hash1 = await generateTransactionHash(input1);
    const hash2 = await generateTransactionHash(input2);

    assert.equal(hash1.length, 64, "SHA-256 hash must be 64 hex characters");
    assert.equal(hash1, hash2, "Normalized transaction inputs must produce identical hash");

    const inputDifferent = { ...input1, amountMinorUnits: -451n };
    const hashDifferent = await generateTransactionHash(inputDifferent);
    assert.notEqual(hash1, hashDifferent, "Different amounts must produce different hashes");
  });
});

describe("2. Local Database Engine & Echo Suppression (apps/web/src/db)", () => {
  let db: AppDB;

  test("instantiates Dexie database and stores cryptoKeys", async () => {
    db = new AppDB(`finview_test_${Date.now()}_${Math.random()}`);
    await db.open();

    const { keyRecord } = await initKeyHierarchy("TestPass#99");
    await saveCryptoKeys(db, keyRecord);

    const loadedKeys = await getCryptoKeys(db);
    assert.ok(loadedKeys);
    assert.equal(loadedKeys.id, "primary");
    assert.equal(loadedKeys.wrappedDekByPassword, keyRecord.wrappedDekByPassword);
  });

  test("creates, updates, and soft-deletes accounts while enqueuing to syncQueue", async () => {
    // Empty sync queue first
    await db.syncQueue.clear();

    const account = await createAccount(db, {
      id: "acc_checking_01",
      name: "Primary Checking",
      currency: "USD",
      balanceMinorUnits: 250000n, // $2,500.00
    });

    assert.equal(account.balanceMinorUnits, 250000n);
    assert.equal(account.deletedAt, null);

    // Check syncQueue for UPSERT
    const queueAfterCreate = await db.syncQueue.where("recordId").equals("acc_checking_01").toArray();
    assert.equal(queueAfterCreate.length, 1);
    assert.equal(queueAfterCreate[0].operation, "UPSERT");
    assert.equal(queueAfterCreate[0].table, "accounts");

    // Update account
    await updateAccount(db, "acc_checking_01", {
      balanceMinorUnits: 300000n,
    });

    const updated = await getAccount(db, "acc_checking_01");
    assert.equal(updated?.balanceMinorUnits, 300000n);

    // Soft delete
    await softDeleteAccount(db, "acc_checking_01");
    const activeAccounts = await listAccounts(db, false);
    assert.equal(activeAccounts.length, 0, "Soft-deleted account should be excluded from active list");

    const allAccounts = await listAccounts(db, true);
    assert.equal(allAccounts.length, 1, "Account still exists with tombstone");
    assert.ok(allAccounts[0].deletedAt !== null);

    const queueAfterDelete = await db.syncQueue.where("recordId").equals("acc_checking_01").toArray();
    const lastOp = queueAfterDelete[queueAfterDelete.length - 1];
    assert.equal(lastOp.operation, "DELETE");
  });

  test("enforces unique index on transactions.hash and prevents duplicates", async () => {
    await db.transactions.clear();
    await db.syncQueue.clear();

    const txData = {
      id: "tx_1001",
      accountId: "acc_checking_01",
      date: "2026-09-29",
      description: "Payroll Direct Deposit",
      amountMinorUnits: 500000n, // +$5,000.00
      runningBalanceMinorUnits: 750000n,
    };

    const createdTx = await createTransaction(db, txData);
    assert.ok(createdTx.hash, "Transaction hash must be computed");

    // Attempt to insert duplicate transaction with identical details
    await assert.rejects(
      async () => {
        await createTransaction(db, {
          id: "tx_1002_duplicate",
          accountId: "acc_checking_01",
          date: "2026-09-29",
          description: "Payroll Direct Deposit",
          amountMinorUnits: 500000n,
          runningBalanceMinorUnits: 800000n,
        });
      },
      DuplicateTransactionError,
      "Duplicate transaction with same hash must throw DuplicateTransactionError"
    );
  });

  test("Echo Suppression: remote sync writes NEVER enqueue to syncQueue", async () => {
    await db.syncQueue.clear();

    // 1. Regular write (isRemoteSync === false)
    assert.equal(isRemoteSync(), false);
    await createAccount(db, {
      id: "acc_local_01",
      name: "Local Account",
      currency: "EUR",
      balanceMinorUnits: 10000n,
    });

    const queueAfterLocal = await db.syncQueue.where("recordId").equals("acc_local_01").toArray();
    assert.equal(queueAfterLocal.length, 1, "Local write must enqueue to syncQueue");

    // 2. Remote sync write (wrapped in withRemoteSync)
    await withRemoteSync(async () => {
      assert.equal(isRemoteSync(), true);

      await db.accounts.put({
        id: "acc_remote_01",
        name: "Remote Inbound Account",
        currency: "USD",
        balanceMinorUnits: 99999n,
        updatedAt: Date.now(),
        deletedAt: null,
      });

      await db.transactions.put({
        id: "tx_remote_01",
        accountId: "acc_remote_01",
        date: "2026-09-29",
        description: "Inbound Transaction",
        amountMinorUnits: 5000n,
        runningBalanceMinorUnits: 99999n,
        hash: "remote_hash_abc_123",
        updatedAt: Date.now(),
        deletedAt: null,
      });
    });

    // Post-condition: isRemoteSync must be restored to false
    assert.equal(isRemoteSync(), false);

    const queueAfterRemote = await db.syncQueue
      .where("recordId")
      .anyOf(["acc_remote_01", "tx_remote_01"])
      .toArray();

    assert.equal(
      queueAfterRemote.length,
      0,
      "CRITICAL: Remote sync writes must NEVER enqueue to syncQueue (Echo Suppression)"
    );
  });
});

describe("3. Sync Coordinator & Remote Storage (apps/web/src/db/syncCoordinator & apps/web/convex)", () => {
  let db: AppDB;
  let activeDek: CryptoKey;

  before(async () => {
    const { dek } = await initKeyHierarchy("CoordinatorPass@2026");
    activeDek = dek;
  });

  // In-memory mock server simulating Convex backend with LWW and user isolation
  class MockConvexRemoteServer implements RemoteSyncClient {
    public storage = new Map<string, { userId: string; record: EncryptedEnvelope }>();
    public cursors = new Map<string, number>();
    public currentUserId = "user_k1";

    async pushBatch(records: EncryptedEnvelope[]) {
      let upserted = 0;
      let skipped = 0;

      for (const rec of records) {
        const key = `${this.currentUserId}:${rec.recordId}`;
        const existing = this.storage.get(key);

        if (!existing) {
          this.storage.set(key, { userId: this.currentUserId, record: rec });
          upserted++;
        } else {
          // Last-Write-Wins (LWW)
          if (rec.updatedAt > existing.record.updatedAt) {
            this.storage.set(key, { userId: this.currentUserId, record: rec });
            upserted++;
          } else {
            skipped++;
          }
        }
      }

      return {
        processed: records.length,
        upserted,
        skipped,
        timestamp: Date.now(),
      };
    }

    async pullChanges(since: number) {
      const records: EncryptedEnvelope[] = [];
      for (const entry of this.storage.values()) {
        if (entry.userId === this.currentUserId && entry.record.updatedAt > since) {
          records.push(entry.record);
        }
      }
      return {
        records,
        serverTime: Date.now(),
      };
    }

    async updateCursor(lastPulledAt: number) {
      this.cursors.set(this.currentUserId, lastPulledAt);
    }
  }

  test("outbound flush encrypts payload and commits batch, then purges syncQueue", async () => {
    db = new AppDB(`finview_sync_test_${Date.now()}`);
    await db.open();

    const { dek } = await initKeyHierarchy("CoordinatorPass@2026");
    activeDek = dek;

    const mockServer = new MockConvexRemoteServer();
    const coordinator = new SyncCoordinator({
      db,
      remoteClient: mockServer,
      activeDek,
    });

    // Create a local account and a local transaction
    const acc = await createAccount(db, {
      id: "acc_sync_test_1",
      name: "Emergency Savings",
      currency: "USD",
      balanceMinorUnits: 1200000n, // $12,000.00
    });

    const tx = await createTransaction(db, {
      id: "tx_sync_test_1",
      accountId: "acc_sync_test_1",
      date: "2026-09-29",
      description: "Transfer to Savings",
      amountMinorUnits: 100000n,
      runningBalanceMinorUnits: 1200000n,
    });

    const pendingBefore = await coordinator.getPendingCount();
    assert.equal(pendingBefore, 2, "There must be 2 items in syncQueue");

    // Perform Outbound Flush
    const flushedCount = await coordinator.flushOutbound();
    assert.equal(flushedCount, 2, "Should flush 2 items");

    const pendingAfter = await coordinator.getPendingCount();
    assert.equal(pendingAfter, 0, "syncQueue must be empty after successful flush");

    // Verify Remote Storage received only encrypted envelopes with zero plaintext
    assert.equal(mockServer.storage.size, 2);
    for (const entry of mockServer.storage.values()) {
      const env = entry.record;
      assert.ok(env.ciphertext, "Ciphertext must be present");
      assert.ok(env.iv, "IV must be present");

      // Verify ZERO PLAINTEXT EGRESS:
      // Ciphertext must NOT contain raw description or currency string
      const rawCiphertext = env.ciphertext;
      assert.equal(rawCiphertext.includes("Emergency Savings"), false, "Plaintext name leaked into ciphertext!");
      assert.equal(rawCiphertext.includes("Transfer to Savings"), false, "Plaintext description leaked into ciphertext!");
      assert.equal(rawCiphertext.includes("1200000"), false, "Plaintext balance leaked into ciphertext!");
    }
  });

  test("inbound pull fetches remote changes, decrypts, and applies with echo suppression", async () => {
    // Simulate Client B receiving changes from mockServer
    const dbClientB = new AppDB(`finview_client_b_${Date.now()}`);
    await dbClientB.open();

    const mockServer = new MockConvexRemoteServer();

    // Seed mockServer with an encrypted envelope directly
    const remoteAccount = {
      id: "acc_from_cloud",
      name: "Cloud Synced Account",
      currency: "GBP",
      balanceMinorUnits: 85000n, // £850.00
      updatedAt: Date.now(),
      deletedAt: null,
    };

    const env = await encryptRecord({
      recordId: remoteAccount.id,
      table: "accounts",
      payload: remoteAccount,
      dek: activeDek,
      metadata: {
        schemaVersion: 1,
        updatedAt: remoteAccount.updatedAt,
        deletedAt: null,
      },
    });

    await mockServer.pushBatch([env]);

    const coordinatorB = new SyncCoordinator({
      db: dbClientB,
      remoteClient: mockServer,
      activeDek,
    });

    // Inbound pull
    const pulledCount = await coordinatorB.pullInbound();
    assert.equal(pulledCount, 1, "Should pull and decrypt 1 record");

    // Verify record exists in Client B Dexie
    const localInB = await dbClientB.accounts.get("acc_from_cloud");
    assert.ok(localInB);
    assert.equal(localInB.name, "Cloud Synced Account");
    assert.equal(localInB.balanceMinorUnits, 85000n);

    // CRITICAL: Verify Client B's syncQueue is EMPTY (no echo loop!)
    const clientBQueue = await dbClientB.syncQueue.toArray();
    assert.equal(clientBQueue.length, 0, "Inbound pull must NOT generate items in syncQueue");
  });

  test("Last-Write-Wins (LWW) conflict resolution and tombstone preservation", async () => {
    const mockServer = new MockConvexRemoteServer();

    const t1 = 1000;
    const t2 = 2000;
    const t3 = 1500; // Older than t2

    const envV1 = await encryptRecord({
      recordId: "acc_lww",
      table: "accounts",
      payload: { name: "Version 1" },
      dek: activeDek,
      metadata: { updatedAt: t1, deletedAt: null },
    });

    const envV2 = await encryptRecord({
      recordId: "acc_lww",
      table: "accounts",
      payload: { name: "Version 2 (Newer)" },
      dek: activeDek,
      metadata: { updatedAt: t2, deletedAt: null },
    });

    const envV3Stale = await encryptRecord({
      recordId: "acc_lww",
      table: "accounts",
      payload: { name: "Version 3 (Stale)" },
      dek: activeDek,
      metadata: { updatedAt: t3, deletedAt: null },
    });

    // Push V1 then V2
    await mockServer.pushBatch([envV1]);
    const res2 = await mockServer.pushBatch([envV2]);
    assert.equal(res2.upserted, 1);

    // Push stale V3 (updatedAt < V2) -> should be skipped!
    const res3 = await mockServer.pushBatch([envV3Stale]);
    assert.equal(res3.skipped, 1, "Stale record must be skipped under LWW");

    // Tombstone deletion with t = 3000
    const envTombstone = await encryptRecord({
      recordId: "acc_lww",
      table: "accounts",
      payload: { id: "acc_lww" },
      dek: activeDek,
      metadata: { updatedAt: 3000, deletedAt: 3000 },
    });

    const resDel = await mockServer.pushBatch([envTombstone]);
    assert.equal(resDel.upserted, 1);

    const pulled = await mockServer.pullChanges(0);
    assert.equal(pulled.records.length, 1);
    assert.equal(pulled.records[0].deletedAt, 3000, "Tombstone must be preserved and transmitted");
  });

  test("offline awareness and exponential backoff retry schedule", async () => {
    const dbTest = new AppDB(`finview_backoff_test_${Date.now()}`);
    await dbTest.open();

    let shouldFail = true;
    const failingServer: RemoteSyncClient = {
      async pushBatch() {
        if (shouldFail) throw new Error("Network simulated failure 503");
        return { processed: 0, upserted: 0, skipped: 0, timestamp: Date.now() };
      },
      async pullChanges() {
        if (shouldFail) throw new Error("Network simulated failure 503");
        return { records: [], serverTime: Date.now() };
      },
    };

    const coordinator = new SyncCoordinator({
      db: dbTest,
      remoteClient: failingServer,
      activeDek,
    });

    // Initial state
    assert.equal(coordinator.getState().consecutiveFailures, 0);
    assert.equal(coordinator.getState().backoffIndex, 0);

    // Fail 1st time
    await coordinator.triggerSync();
    assert.equal(coordinator.getState().consecutiveFailures, 1);
    assert.equal(coordinator.getState().backoffIndex, 0); // 1s

    // Fail 2nd time
    await coordinator.triggerSync();
    assert.equal(coordinator.getState().consecutiveFailures, 2);
    assert.equal(coordinator.getState().backoffIndex, 1); // 2s

    // Fail 3rd time
    await coordinator.triggerSync();
    assert.equal(coordinator.getState().consecutiveFailures, 3);
    assert.equal(coordinator.getState().backoffIndex, 2); // 5s

    // Fail 4th time
    await coordinator.triggerSync();
    assert.equal(coordinator.getState().consecutiveFailures, 4);
    assert.equal(coordinator.getState().backoffIndex, 3); // 30s max capped

    // Recover
    shouldFail = false;
    await coordinator.triggerSync();
    assert.equal(coordinator.getState().consecutiveFailures, 0, "Failures must reset on success");
    assert.equal(coordinator.getState().backoffIndex, 0, "Backoff must reset to 0 on success");
  });
});

describe("4. Remote Storage Engine Handlers (apps/web/convex)", () => {
  // Mock Convex context simulator
  function createMockConvexContext(authenticatedUserId: string | null) {
    const tableData = new Map<string, any[]>();
    tableData.set("encrypted_records", []);
    tableData.set("sync_cursors", []);
    let idCounter = 1;

    return {
      auth: {
        getUserIdentity: async () => {
          if (!authenticatedUserId) return null;
          return {
            subject: authenticatedUserId,
            tokenIdentifier: `token_${authenticatedUserId}`,
          };
        },
      },
      db: {
        query: (tableName: string) => {
          const rows = tableData.get(tableName) || [];
          return {
            withIndex: (_indexName: string, filterFn: (q: any) => any) => {
              const predicates: Array<{ field: string; op: string; value: any }> = [];
              const qHelper = {
                eq: (field: string, value: any) => {
                  predicates.push({ field, op: "eq", value });
                  return qHelper;
                },
                gt: (field: string, value: any) => {
                  predicates.push({ field, op: "gt", value });
                  return qHelper;
                },
              };
              filterFn(qHelper);

              const matching = rows.filter((row) =>
                predicates.every((p) => {
                  if (p.op === "eq") return row[p.field] === p.value;
                  if (p.op === "gt") return row[p.field] > p.value;
                  return true;
                })
              );

              return {
                first: async () => matching[0] || null,
                collect: async () => [...matching],
              };
            },
          };
        },
        insert: async (tableName: string, doc: any) => {
          const _id = `${tableName}_${idCounter++}`;
          const newDoc = { _id, _creationTime: Date.now(), ...doc };
          const list = tableData.get(tableName) || [];
          list.push(newDoc);
          tableData.set(tableName, list);
          return _id;
        },
        patch: async (id: string, updates: any) => {
          for (const list of tableData.values()) {
            const doc = list.find((d) => d._id === id);
            if (doc) {
              Object.assign(doc, updates);
              return;
            }
          }
        },
      },
    };
  }

  test("rejects unauthenticated requests to pushBatch and pullChanges", async () => {
    const unauthCtx = createMockConvexContext(null);
    const { pushBatch, pullChanges } = await import("../apps/web/convex/sync.js");

    await assert.rejects(
      async () => {
        await (pushBatch as any)._handler(unauthCtx, { records: [] });
      },
      /Unauthenticated/,
      "Unauthenticated caller must be rejected"
    );

    await assert.rejects(
      async () => {
        await (pullChanges as any)._handler(unauthCtx, { since: 0 });
      },
      /Unauthenticated/,
      "Unauthenticated pull must be rejected"
    );
  });

  test("enforces strict user isolation: User A cannot pull User B records", async () => {
    const { pushBatch, pullChanges } = await import("../apps/web/convex/sync.js");
    const sharedDb = createMockConvexContext("user_alice");

    // Alice pushes a record
    const aliceRecord: EncryptedEnvelope = {
      recordId: "rec_alice_1",
      table: "accounts",
      iv: "iv_alice",
      ciphertext: "cipher_alice",
      schemaVersion: 1,
      updatedAt: 1000,
      deletedAt: null,
    };

    await (pushBatch as any)._handler(sharedDb, { records: [aliceRecord] });

    // Alice pulls her records -> gets 1
    const alicePull = await (pullChanges as any)._handler(sharedDb, { since: 0 });
    assert.equal(alicePull.records.length, 1);
    assert.equal(alicePull.records[0].recordId, "rec_alice_1");

    // Bob inspects using his identity
    const bobCtx = {
      ...sharedDb,
      auth: {
        getUserIdentity: async () => ({
          subject: "user_bob",
          tokenIdentifier: "token_user_bob",
        }),
      },
    };

    // Bob pulls changes -> gets 0 records!
    const bobPull = await (pullChanges as any)._handler(bobCtx, { since: 0 });
    assert.equal(bobPull.records.length, 0, "User B must NOT see User A records");
  });
});

