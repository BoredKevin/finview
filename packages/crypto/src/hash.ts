/**
 * Deterministic Transaction Hash Generation for Deduplication
 * 
 * Canonical representation:
 * `${accountId.trim()}|${date.trim()}|${description.trim().toLowerCase()}|${amountMinorUnits.toString()}`
 * Digested via SHA-256 into a 64-character lowercase hex string.
 */

import { bytesToHex, stringToBytes } from "./utils.js";

export interface TransactionHashInput {
  accountId: string;
  date: string;
  description: string;
  amountMinorUnits: bigint | number | string;
}

/**
 * Computes a deterministic SHA-256 hash for transaction deduplication.
 */
export async function generateTransactionHash(
  input: TransactionHashInput
): Promise<string> {
  const normalizedAccountId = input.accountId.trim();
  const normalizedDate = input.date.trim();
  const normalizedDescription = input.description.trim().toLowerCase();
  const normalizedAmount = input.amountMinorUnits.toString().trim();

  const canonicalString = `${normalizedAccountId}|${normalizedDate}|${normalizedDescription}|${normalizedAmount}`;
  const dataBytes = stringToBytes(canonicalString);

  const digestBuffer = await crypto.subtle.digest("SHA-256", dataBytes as BufferSource);
  return bytesToHex(new Uint8Array(digestBuffer));
}
