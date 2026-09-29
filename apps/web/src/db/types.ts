/**
 * Local Database Schema & Domain Types
 * Financial precision: Minor units (bigint or number)
 */

import { CryptoKeyRow, EncryptedEnvelope } from "../../../../packages/crypto/src/index.js";

export type SyncOperation = "UPSERT" | "DELETE";

export interface Account {
  id: string;
  name: string;
  currency: string;
  balanceMinorUnits: bigint | number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // ISO 8601 Date string (e.g. "2026-09-29")
  description: string;
  amountMinorUnits: bigint | number; // Signed: negative for debit/expense, positive for credit/income
  runningBalanceMinorUnits: bigint | number;
  hash: string; // Deterministic SHA-256 hash enforcing deduplication
  updatedAt: number;
  deletedAt: number | null;
}

export interface SyncQueueItem {
  id?: number; // Auto-incrementing primary key (++id)
  table: "transactions" | "accounts" | "categories";
  recordId: string;
  operation: SyncOperation;
  queuedAt: number;
}

export type { CryptoKeyRow, EncryptedEnvelope };
