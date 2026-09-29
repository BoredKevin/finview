/**
 * Typed Dexie CRUD APIs for Accounts, Transactions, and Cryptographic Keys
 */

import { generateTransactionHash } from "../../../../packages/crypto/src/index.js";
import { AppDB } from "./database.js";
import { Account, CryptoKeyRow, Transaction } from "./types.js";

export class DuplicateTransactionError extends Error {
  constructor(public readonly hash: string) {
    super(`A transaction with identical deterministic hash (${hash}) already exists.`);
    this.name = "DuplicateTransactionError";
  }
}

// ==========================================
// Account CRUD
// ==========================================

export async function createAccount(
  db: AppDB,
  data: Omit<Account, "updatedAt" | "deletedAt">
): Promise<Account> {
  const account: Account = {
    ...data,
    updatedAt: Date.now(),
    deletedAt: null,
  };
  await db.accounts.add(account);
  return account;
}

export async function updateAccount(
  db: AppDB,
  id: string,
  updates: Partial<Omit<Account, "id" | "updatedAt">>
): Promise<Account> {
  const existing = await db.accounts.get(id);
  if (!existing) {
    throw new Error(`Account with id "${id}" not found.`);
  }

  const updated: Account = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  await db.accounts.put(updated);
  return updated;
}

export async function softDeleteAccount(db: AppDB, id: string): Promise<void> {
  const existing = await db.accounts.get(id);
  if (!existing) {
    throw new Error(`Account with id "${id}" not found.`);
  }

  const now = Date.now();
  await db.accounts.update(id, {
    deletedAt: now,
    updatedAt: now,
  });
}

export async function getAccount(
  db: AppDB,
  id: string
): Promise<Account | undefined> {
  return db.accounts.get(id);
}

export async function listAccounts(
  db: AppDB,
  includeDeleted = false
): Promise<Account[]> {
  if (includeDeleted) {
    return db.accounts.toArray();
  }
  return db.accounts.filter((acc) => acc.deletedAt === null).toArray();
}

// ==========================================
// Transaction CRUD
// ==========================================

export async function createTransaction(
  db: AppDB,
  data: Omit<Transaction, "hash" | "updatedAt" | "deletedAt"> & { hash?: string }
): Promise<Transaction> {
  const hash =
    data.hash ??
    (await generateTransactionHash({
      accountId: data.accountId,
      date: data.date,
      description: data.description,
      amountMinorUnits: data.amountMinorUnits,
    }));

  // Check unique hash constraint
  const existingByHash = await db.transactions.where("hash").equals(hash).first();
  if (existingByHash && existingByHash.deletedAt === null) {
    throw new DuplicateTransactionError(hash);
  }

  const transaction: Transaction = {
    ...data,
    hash,
    updatedAt: Date.now(),
    deletedAt: null,
  };

  try {
    await db.transactions.add(transaction);
  } catch (err: any) {
    if (err?.name === "ConstraintError" || err?.message?.includes("Key already exists")) {
      throw new DuplicateTransactionError(hash);
    }
    throw err;
  }

  return transaction;
}

export async function updateTransaction(
  db: AppDB,
  id: string,
  updates: Partial<Omit<Transaction, "id" | "updatedAt">>
): Promise<Transaction> {
  const existing = await db.transactions.get(id);
  if (!existing) {
    throw new Error(`Transaction with id "${id}" not found.`);
  }

  const shouldRehash =
    updates.accountId !== undefined ||
    updates.date !== undefined ||
    updates.description !== undefined ||
    updates.amountMinorUnits !== undefined;

  let newHash = existing.hash;
  if (shouldRehash) {
    newHash = await generateTransactionHash({
      accountId: updates.accountId ?? existing.accountId,
      date: updates.date ?? existing.date,
      description: updates.description ?? existing.description,
      amountMinorUnits: updates.amountMinorUnits ?? existing.amountMinorUnits,
    });
  }

  const updated: Transaction = {
    ...existing,
    ...updates,
    hash: newHash,
    updatedAt: Date.now(),
  };

  await db.transactions.put(updated);
  return updated;
}

export async function softDeleteTransaction(
  db: AppDB,
  id: string
): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) {
    throw new Error(`Transaction with id "${id}" not found.`);
  }

  const now = Date.now();
  await db.transactions.update(id, {
    deletedAt: now,
    updatedAt: now,
  });
}

export async function getTransaction(
  db: AppDB,
  id: string
): Promise<Transaction | undefined> {
  return db.transactions.get(id);
}

export async function listTransactionsByAccount(
  db: AppDB,
  accountId: string,
  includeDeleted = false
): Promise<Transaction[]> {
  const query = db.transactions.where("accountId").equals(accountId);
  if (includeDeleted) {
    return query.toArray();
  }
  return query.filter((tx) => tx.deletedAt === null).toArray();
}

export async function findTransactionByHash(
  db: AppDB,
  hash: string
): Promise<Transaction | undefined> {
  return db.transactions.where("hash").equals(hash).first();
}

// ==========================================
// CryptoKey Management CRUD
// ==========================================

export async function saveCryptoKeys(
  db: AppDB,
  keys: CryptoKeyRow
): Promise<void> {
  await db.cryptoKeys.put(keys);
}

export async function getCryptoKeys(
  db: AppDB
): Promise<CryptoKeyRow | undefined> {
  return db.cryptoKeys.get("primary");
}
