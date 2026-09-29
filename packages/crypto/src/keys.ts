/**
 * Key Hierarchy & Key Encryption Key (KEK) / Data Encryption Key (DEK) Management
 * 
 * Hierarchy:
 *   1. User Password -> PBKDF2 (SHA-256, 600,000 iterations, 32-byte salt) -> KEK (AES-GCM-256)
 *   2. 12-word BIP-39 Mnemonic -> PBKDF2-SHA256 -> Recovery Key RK (AES-GCM-256)
 *   3. Random 256-bit DEK (AES-GCM-256) wrapped by KEK -> wrappedDekByPassword
 *   4. Random 256-bit DEK (AES-GCM-256) wrapped by RK  -> wrappedDekByRecovery
 */

import { CryptoKeyRow } from "./types.js";
import {
  base64ToBytes,
  bytesToBase64,
  getRandomBytes,
  stringToBytes,
} from "./utils.js";
import { deriveRecoveryKey, generateMnemonic } from "./mnemonic.js";

export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTE_LENGTH = 32;
export const IV_BYTE_LENGTH = 12; // 96 bits for AES-GCM
export const KEY_BIT_LENGTH = 256;

export function generateSalt(): Uint8Array {
  return getRandomBytes(SALT_BYTE_LENGTH);
}

export function generateIv(): Uint8Array {
  return getRandomBytes(IV_BYTE_LENGTH);
}

/**
 * Derives a 256-bit AES-GCM Key Encryption Key (KEK) from user password via PBKDF2.
 * Parameters: SHA-256, 600,000 iterations, 32-byte salt.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  if (salt.length !== SALT_BYTE_LENGTH) {
    throw new Error(`Salt must be exactly ${SALT_BYTE_LENGTH} bytes.`);
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    stringToBytes(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_BIT_LENGTH },
    false,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  );
}

/**
 * Generates a fresh, cryptographically random 256-bit AES-GCM Data Encryption Key (DEK).
 */
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: KEY_BIT_LENGTH,
    },
    true, // Extractable so it can be wrapped by KEK and RK
    ["encrypt", "decrypt"]
  );
}

/**
 * Wraps the DEK using AES-GCM with a fresh 96-bit IV.
 */
export async function wrapDek(
  dek: CryptoKey,
  wrappingKey: CryptoKey
): Promise<{ wrappedDek: string; iv: string }> {
  const iv = generateIv();
  const wrappedBuffer = await crypto.subtle.wrapKey(
    "raw",
    dek,
    wrappingKey,
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    }
  );

  return {
    wrappedDek: bytesToBase64(new Uint8Array(wrappedBuffer)),
    iv: bytesToBase64(iv),
  };
}

/**
 * Unwraps a wrapped DEK using AES-GCM.
 */
export async function unwrapDek(
  wrappedDekBase64: string,
  ivBase64: string,
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  const wrappedBytes = base64ToBytes(wrappedDekBase64);
  const iv = base64ToBytes(ivBase64);

  return crypto.subtle.unwrapKey(
    "raw",
    wrappedBytes as BufferSource,
    wrappingKey,
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    },
    {
      name: "AES-GCM",
      length: KEY_BIT_LENGTH,
    },
    true, // Extractable
    ["encrypt", "decrypt"]
  );
}

export interface KeyHierarchyInitResult {
  dek: CryptoKey;
  mnemonic: string;
  keyRecord: CryptoKeyRow;
}

/**
 * Orchestrates full key hierarchy initialization:
 * 1. Generates 32-byte salt.
 * 2. Generates 12-word BIP-39 mnemonic phrase.
 * 3. Derives KEK from password (PBKDF2-SHA256, 600,000 iterations).
 * 4. Derives RK from mnemonic.
 * 5. Generates 256-bit DEK.
 * 6. Wraps DEK with KEK and RK with distinct 96-bit IVs.
 * 7. Constructs `CryptoKeyRow` for Dexie storage.
 */
export async function initKeyHierarchy(
  password: string,
  customMnemonic?: string
): Promise<KeyHierarchyInitResult> {
  const salt = generateSalt();
  const mnemonic = customMnemonic ?? (await generateMnemonic());

  const kek = await deriveKeyFromPassword(password, salt);
  const rk = await deriveRecoveryKey(mnemonic);
  const dek = await generateDek();

  const wrappedPassword = await wrapDek(dek, kek);
  const wrappedRecovery = await wrapDek(dek, rk);

  const keyRecord: CryptoKeyRow = {
    id: "primary",
    salt: bytesToBase64(salt),
    wrappedDekByPassword: wrappedPassword.wrappedDek,
    wrappedDekByRecovery: wrappedRecovery.wrappedDek,
    ivPassword: wrappedPassword.iv,
    ivRecovery: wrappedRecovery.iv,
  };

  return { dek, mnemonic, keyRecord };
}

/**
 * Unlocks the active DEK using the user password.
 */
export async function unlockDekWithPassword(
  password: string,
  keyRecord: CryptoKeyRow
): Promise<CryptoKey> {
  const salt = base64ToBytes(keyRecord.salt);
  const kek = await deriveKeyFromPassword(password, salt);
  return unwrapDek(keyRecord.wrappedDekByPassword, keyRecord.ivPassword, kek);
}

/**
 * Unlocks the active DEK using the 12-word BIP-39 recovery phrase.
 */
export async function unlockDekWithRecoveryPhrase(
  mnemonic: string,
  keyRecord: CryptoKeyRow
): Promise<CryptoKey> {
  const rk = await deriveRecoveryKey(mnemonic);
  return unwrapDek(keyRecord.wrappedDekByRecovery, keyRecord.ivRecovery, rk);
}
