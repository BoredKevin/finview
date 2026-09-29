/**
 * Dexie.js AppDB Database Instance with Echo Suppression and Deduplication
 */

import Dexie, { type Table, type Transaction as DexieTransaction } from "dexie";
import { isRemoteSync } from "./context.js";
import {
  Account,
  CryptoKeyRow,
  InstalledParser,
  SyncOperation,
  SyncQueueItem,
  Transaction,
} from "./types.js";

export class AppDB extends Dexie {
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  cryptoKeys!: Table<CryptoKeyRow, string>;
  installedParsers!: Table<InstalledParser, string>;

  constructor(dbName = "finview_db", options?: { indexedDB?: any; IDBKeyRange?: any }) {
    super(dbName, {
      indexedDB: options?.indexedDB ?? (typeof indexedDB !== "undefined" ? indexedDB : undefined),
      IDBKeyRange: options?.IDBKeyRange ?? (typeof IDBKeyRange !== "undefined" ? IDBKeyRange : undefined),
      ...options,
    });

    this.version(1).stores({
      accounts: "id, name, currency, balanceMinorUnits, updatedAt, deletedAt",
      transactions: "id, accountId, date, description, amountMinorUnits, runningBalanceMinorUnits, &hash, updatedAt, deletedAt",
      syncQueue: "++id, table, recordId, operation, queuedAt",
      cryptoKeys: "id, salt, wrappedDekByPassword, wrappedDekByRecovery, ivPassword, ivRecovery",
    });

    this.version(2).stores({
      installedParsers: "id, &slug, bankName, country, fileType, installedVersion, updatedAt",
    });

    this.attachChangeHooks();
  }

  private attachChangeHooks(): void {
    const bindHooksForTable = (
      table: Table<any, string>,
      tableName: "accounts" | "transactions"
    ) => {
      // Create Hook
      table.hook("creating", function (primKey, obj, _trans) {
        if (isRemoteSync()) return;
        const targetId = (primKey ?? obj.id) as string;

        this.onsuccess = () => {
          Dexie.ignoreTransaction(() => {
            table.db.table("syncQueue").add({
              table: tableName,
              recordId: targetId,
              operation: "UPSERT" as SyncOperation,
              queuedAt: Date.now(),
            }).catch((err) => {
              console.error(`Failed to enqueue create in syncQueue for ${tableName}:`, err);
            });
          });
        };
      });

      // Update Hook
      table.hook("updating", function (modifications: any, primKey, obj: any, _trans) {
        if (isRemoteSync()) return;
        const targetId = (primKey ?? obj?.id) as string;
        const isSoftDeleted =
          (modifications.deletedAt !== undefined && modifications.deletedAt !== null) ||
          obj?.deletedAt !== null;
        const operation: SyncOperation = isSoftDeleted ? "DELETE" : "UPSERT";

        this.onsuccess = () => {
          Dexie.ignoreTransaction(() => {
            table.db.table("syncQueue").add({
              table: tableName,
              recordId: targetId,
              operation,
              queuedAt: Date.now(),
            }).catch((err) => {
              console.error(`Failed to enqueue update in syncQueue for ${tableName}:`, err);
            });
          });
        };
      });

      // Delete Hook
      table.hook("deleting", function (primKey, obj: any, _trans) {
        if (isRemoteSync()) return;
        const targetId = (primKey ?? obj?.id) as string;

        this.onsuccess = () => {
          Dexie.ignoreTransaction(() => {
            table.db.table("syncQueue").add({
              table: tableName,
              recordId: targetId,
              operation: "DELETE" as SyncOperation,
              queuedAt: Date.now(),
            }).catch((err) => {
              console.error(`Failed to enqueue delete in syncQueue for ${tableName}:`, err);
            });
          });
        };
      });
    };

    bindHooksForTable(this.accounts, "accounts");
    bindHooksForTable(this.transactions, "transactions");
  }
}

/**
 * Default singleton instance for web client runtime.
 */
let dbInstance: AppDB | null = null;

export function getDatabase(): AppDB {
  if (!dbInstance) {
    dbInstance = new AppDB();
  }
  return dbInstance;
}
