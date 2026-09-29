/**
 * Sync Coordinator: Offline-Aware Poll-and-Flush Lifecycle
 * 
 * Invariants Enforced:
 * 1. Zero Plaintext Egress: Encrypts every payload with AES-GCM-256 before transmission.
 * 2. Financial Precision: Preserves minor units throughout serialization/deserialization.
 * 3. Echo Suppression: Wraps inbound writes in `withRemoteSync(true)` so change hooks ignore them.
 */

import { decryptRecord, encryptRecord, EncryptedEnvelope } from "../../../../packages/crypto/src/index.js";
import { withRemoteSync } from "./context.js";
import { AppDB } from "./database.js";
import { Account, Transaction } from "./types.js";

export interface RemoteSyncClient {
  pushBatch(records: EncryptedEnvelope[]): Promise<{
    processed: number;
    upserted: number;
    skipped: number;
    timestamp: number;
  }>;
  pullChanges(since: number): Promise<{
    records: EncryptedEnvelope[];
    serverTime: number;
  }>;
  updateCursor?(lastPulledAt: number): Promise<void>;
}

export interface SyncCoordinatorOptions {
  db: AppDB;
  remoteClient: RemoteSyncClient;
  activeDek?: CryptoKey;
  batchSize?: number;
  pollIntervalMs?: number;
  initialCursor?: number;
}

export interface SyncState {
  isSyncing: boolean;
  isOnline: boolean;
  pendingOutbound: number;
  lastPulledAt: number;
  lastSyncAt: number | null;
  backoffIndex: number;
  consecutiveFailures: number;
  lastError: Error | null;
}

export const BACKOFF_INTERVALS = [1000, 2000, 5000, 30000]; // 1s, 2s, 5s, 30s

export class SyncCoordinator {
  private db: AppDB;
  private remoteClient: RemoteSyncClient;
  private activeDek: CryptoKey | null = null;
  private batchSize: number;
  private pollIntervalMs: number;
  private lastPulledAt: number;
  private isSyncing = false;
  private consecutiveFailures = 0;
  private lastError: Error | null = null;
  private lastSyncAt: number | null = null;
  private pollTimer: any = null;
  private backoffTimer: any = null;
  private isRunning = false;
  private boundOnlineListener: (() => void) | null = null;
  private boundOfflineListener: (() => void) | null = null;

  constructor(options: SyncCoordinatorOptions) {
    this.db = options.db;
    this.remoteClient = options.remoteClient;
    this.activeDek = options.activeDek ?? null;
    this.batchSize = options.batchSize ?? 50;
    this.pollIntervalMs = options.pollIntervalMs ?? 15000;
    this.lastPulledAt = options.initialCursor ?? 0;
  }

  public setActiveDek(dek: CryptoKey | null): void {
    this.activeDek = dek;
  }

  public getActiveDek(): CryptoKey | null {
    return this.activeDek;
  }

  public isOnline(): boolean {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true; // Default to true in non-browser/test environments
  }

  public getState(): SyncState {
    const backoffIndex = this.consecutiveFailures === 0
      ? 0
      : Math.min(this.consecutiveFailures - 1, BACKOFF_INTERVALS.length - 1);
    return {
      isSyncing: this.isSyncing,
      isOnline: this.isOnline(),
      pendingOutbound: 0, // Computed dynamically when needed or via getPendingCount()
      lastPulledAt: this.lastPulledAt,
      lastSyncAt: this.lastSyncAt,
      backoffIndex,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
    };
  }

  public async getPendingCount(): Promise<number> {
    return this.db.syncQueue.count();
  }

  /**
   * Starts background polling and hooks network availability listeners.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Attach network event listeners
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      this.boundOnlineListener = () => {
        this.consecutiveFailures = 0;
        this.triggerSync();
      };
      this.boundOfflineListener = () => {
        if (this.backoffTimer) {
          clearTimeout(this.backoffTimer);
          this.backoffTimer = null;
        }
      };

      window.addEventListener("online", this.boundOnlineListener);
      window.addEventListener("offline", this.boundOfflineListener);
    }

    // Schedule periodic poll
    this.scheduleNextPoll();

    // Trigger initial sync run immediately
    this.triggerSync();
  }

  /**
   * Stops background polling and tears down event listeners.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }

    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      if (this.boundOnlineListener) {
        window.removeEventListener("online", this.boundOnlineListener);
        this.boundOnlineListener = null;
      }
      if (this.boundOfflineListener) {
        window.removeEventListener("offline", this.boundOfflineListener);
        this.boundOfflineListener = null;
      }
    }
  }

  /**
   * Triggers a sync cycle immediately if not already active and online.
   */
  public async triggerSync(): Promise<boolean> {
    if (this.isSyncing) {
      return false;
    }

    if (!this.isOnline()) {
      return false;
    }

    if (!this.activeDek) {
      return false;
    }

    this.isSyncing = true;
    try {
      // 1. Outbound Flush: encrypt and push queued local changes
      await this.flushOutbound();

      // 2. Inbound Pull: pull remote changes, decrypt, and bulk-upsert with echo suppression
      await this.pullInbound();

      // Sync cycle succeeded: reset backoff
      this.consecutiveFailures = 0;
      this.lastError = null;
      this.lastSyncAt = Date.now();
      return true;
    } catch (err: any) {
      this.consecutiveFailures++;
      this.lastError = err instanceof Error ? err : new Error(String(err));
      this.scheduleBackoffRetry();
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Dequeues batches from `syncQueue`, encrypts using active DEK, commits via `pushBatch`,
   * and purges successfully committed items from `syncQueue`.
   */
  public async flushOutbound(): Promise<number> {
    if (!this.activeDek) {
      throw new Error("Active DEK must be set before flushing outbound queue.");
    }

    let totalFlushed = 0;

    // Loop until syncQueue is empty
    while (true) {
      const batch = await this.db.syncQueue.orderBy("id").limit(this.batchSize).toArray();
      if (batch.length === 0) {
        break;
      }

      const envelopes: EncryptedEnvelope[] = [];
      const itemIdsToRemove: number[] = [];

      for (const item of batch) {
        if (item.operation === "DELETE") {
          // Construct encrypted tombstone envelope
          const tombstonePayload = { id: item.recordId, deletedAt: item.queuedAt };
          const envelope = await encryptRecord({
            recordId: item.recordId,
            table: item.table,
            payload: tombstonePayload,
            dek: this.activeDek,
            metadata: {
              schemaVersion: 1,
              updatedAt: item.queuedAt,
              deletedAt: item.queuedAt,
            },
          });
          envelopes.push(envelope);
        } else {
          // UPSERT: load full record from table
          let record: (Account | Transaction | undefined) = undefined;
          if (item.table === "accounts") {
            record = await this.db.accounts.get(item.recordId);
          } else if (item.table === "transactions") {
            record = await this.db.transactions.get(item.recordId);
          }

          if (!record) {
            // Record was removed locally before sync - emit tombstone
            const envelope = await encryptRecord({
              recordId: item.recordId,
              table: item.table,
              payload: { id: item.recordId, deletedAt: item.queuedAt },
              dek: this.activeDek,
              metadata: {
                schemaVersion: 1,
                updatedAt: item.queuedAt,
                deletedAt: item.queuedAt,
              },
            });
            envelopes.push(envelope);
          } else {
            const envelope = await encryptRecord({
              recordId: record.id,
              table: item.table,
              payload: record,
              dek: this.activeDek,
              metadata: {
                schemaVersion: 1,
                updatedAt: record.updatedAt,
                deletedAt: record.deletedAt,
              },
            });
            envelopes.push(envelope);
          }
        }

        if (item.id !== undefined) {
          itemIdsToRemove.push(item.id);
        }
      }

      // Commit encrypted envelopes to remote server
      if (envelopes.length > 0) {
        await this.remoteClient.pushBatch(envelopes);
      }

      // Purge committed queue entries
      if (itemIdsToRemove.length > 0) {
        await this.db.syncQueue.bulkDelete(itemIdsToRemove);
      }

      totalFlushed += batch.length;

      // If batch was smaller than limit, queue is now drained
      if (batch.length < this.batchSize) {
        break;
      }
    }

    return totalFlushed;
  }

  /**
   * Pulls remote changes modified after `lastPulledAt`, decrypts each record using active DEK,
   * sets `isRemoteSync = true` to suppress echo dispatches, and bulk upserts into Dexie.
   */
  public async pullInbound(): Promise<number> {
    if (!this.activeDek) {
      throw new Error("Active DEK must be set before pulling inbound changes.");
    }

    const result = await this.remoteClient.pullChanges(this.lastPulledAt);
    const envelopes = result.records;

    if (envelopes.length === 0) {
      this.lastPulledAt = result.serverTime;
      if (this.remoteClient.updateCursor) {
        await this.remoteClient.updateCursor(result.serverTime);
      }
      return 0;
    }

    // Decrypt all incoming envelopes before opening DB transaction
    const decryptedItems: Array<{
      envelope: EncryptedEnvelope;
      payload: any;
    }> = [];

    for (const env of envelopes) {
      try {
        const payload = await decryptRecord(env, this.activeDek);
        decryptedItems.push({ envelope: env, payload });
      } catch (decryptionError) {
        console.error(
          `Failed to decrypt remote envelope for table ${env.table} id ${env.recordId}:`,
          decryptionError
        );
      }
    }

    // Apply inbound changes under Echo Suppression
    await withRemoteSync(async () => {
      await this.db.transaction("rw", [this.db.accounts, this.db.transactions], async () => {
        for (const item of decryptedItems) {
          const { envelope, payload } = item;

          if (envelope.table === "accounts") {
            if (envelope.deletedAt !== null) {
              const existing = await this.db.accounts.get(envelope.recordId);
              if (existing) {
                await this.db.accounts.update(envelope.recordId, {
                  deletedAt: envelope.deletedAt,
                  updatedAt: envelope.updatedAt,
                });
              }
            } else if (payload) {
              await this.db.accounts.put(payload as Account);
            }
          } else if (envelope.table === "transactions") {
            if (envelope.deletedAt !== null) {
              const existing = await this.db.transactions.get(envelope.recordId);
              if (existing) {
                await this.db.transactions.update(envelope.recordId, {
                  deletedAt: envelope.deletedAt,
                  updatedAt: envelope.updatedAt,
                });
              }
            } else if (payload) {
              await this.db.transactions.put(payload as Transaction);
            }
          }
        }
      });
    });

    // Advance cursor
    this.lastPulledAt = result.serverTime;
    if (this.remoteClient.updateCursor) {
      await this.remoteClient.updateCursor(result.serverTime);
    }

    return decryptedItems.length;
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning) return;
    this.pollTimer = setTimeout(async () => {
      await this.triggerSync();
      this.scheduleNextPoll();
    }, this.pollIntervalMs);
  }

  private scheduleBackoffRetry(): void {
    if (!this.isRunning || !this.isOnline()) return;

    const backoffIndex = Math.min(
      this.consecutiveFailures - 1,
      BACKOFF_INTERVALS.length - 1
    );
    const delay = BACKOFF_INTERVALS[Math.max(0, backoffIndex)];

    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
    }

    this.backoffTimer = setTimeout(async () => {
      this.backoffTimer = null;
      await this.triggerSync();
    }, delay);
  }
}
