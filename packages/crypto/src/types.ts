/**
 * Cryptographic and Envelope Type Definitions
 * Zero-Knowledge Local-First Financial Engine
 */

export type EncryptedTable = "transactions" | "accounts" | "categories";

/**
 * Encrypted Envelope specification stored on remote server (Convex)
 * and transmitted during sync. Contains zero financial plaintext.
 */
export interface EncryptedEnvelope {
  recordId: string;
  table: EncryptedTable;
  iv: string; // Base64 encoded 96-bit (12-byte) initialization vector
  ciphertext: string; // Base64 encoded AES-GCM-256 ciphertext + auth tag
  schemaVersion: number;
  updatedAt: number; // UTC timestamp in milliseconds
  deletedAt: number | null; // UTC timestamp in milliseconds for tombstones, or null
}

/**
 * Local storage structure for wrapped keys inside Dexie `cryptoKeys` table.
 */
export interface CryptoKeyRow {
  id: "primary";
  salt: string; // Base64 encoded 32-byte salt for PBKDF2 KEK derivation
  wrappedDekByPassword: string; // Base64 encoded AES-GCM wrapped DEK
  wrappedDekByRecovery: string; // Base64 encoded AES-GCM wrapped DEK
  ivPassword: string; // Base64 encoded 96-bit IV used for password wrapping
  ivRecovery: string; // Base64 encoded 96-bit IV used for recovery wrapping
}

export interface EnvelopeMetadata {
  schemaVersion?: number;
  updatedAt?: number;
  deletedAt?: number | null;
}
