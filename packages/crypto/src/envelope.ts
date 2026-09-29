/**
 * Record Encryption and Envelope Construction (AES-GCM-256)
 * 
 * Invariants:
 * - Unique 96-bit IV per write
 * - Zero plaintext leakage to remote transport
 * - BigInt-safe financial serialization
 */

import { EncryptedEnvelope, EncryptedTable, EnvelopeMetadata } from "./types.js";
import {
  base64ToBytes,
  bytesToBase64,
  getRandomBytes,
  parseWithBigInt,
  stringifyWithBigInt,
  stringToBytes,
  bytesToString,
} from "./utils.js";

export const IV_LENGTH = 12; // 96 bits
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Encrypts an arbitrary object payload using AES-GCM-256 with a unique 96-bit IV.
 */
export async function encryptPayload(
  payload: unknown,
  dek: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = getRandomBytes(IV_LENGTH);
  const jsonString = stringifyWithBigInt(payload);
  const plaintextBytes = stringToBytes(jsonString);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    },
    dek,
    plaintextBytes as BufferSource
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iv: bytesToBase64(iv),
  };
}

/**
 * Decrypts an AES-GCM-256 payload using the provided DEK and IV.
 */
export async function decryptPayload<T = unknown>(
  ciphertextBase64: string,
  ivBase64: string,
  dek: CryptoKey
): Promise<T> {
  const ciphertextBytes = base64ToBytes(ciphertextBase64);
  const ivBytes = base64ToBytes(ivBase64);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBytes as BufferSource,
    },
    dek,
    ciphertextBytes as BufferSource
  );

  const jsonString = bytesToString(new Uint8Array(decryptedBuffer));
  return parseWithBigInt<T>(jsonString);
}

/**
 * Constructs a fully formatted EncryptedEnvelope ready for Convex storage and wire transmission.
 */
export async function encryptRecord<T = unknown>(params: {
  recordId: string;
  table: EncryptedTable;
  payload: T;
  dek: CryptoKey;
  metadata?: EnvelopeMetadata;
}): Promise<EncryptedEnvelope> {
  const { ciphertext, iv } = await encryptPayload(params.payload, params.dek);

  return {
    recordId: params.recordId,
    table: params.table,
    iv,
    ciphertext,
    schemaVersion: params.metadata?.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    updatedAt: params.metadata?.updatedAt ?? Date.now(),
    deletedAt: params.metadata?.deletedAt ?? null,
  };
}

/**
 * Unpacks and decrypts an EncryptedEnvelope into the original typed record payload.
 */
export async function decryptRecord<T = unknown>(
  envelope: EncryptedEnvelope,
  dek: CryptoKey
): Promise<T> {
  return decryptPayload<T>(envelope.ciphertext, envelope.iv, dek);
}
