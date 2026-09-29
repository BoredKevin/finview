/**
 * BIP-39 12-Word Mnemonic Generation, Validation, and Recovery Key Derivation
 */

import { BIP39_WORDLIST, BIP39_WORD_MAP } from "./wordlist.js";
import { getRandomBytes, stringToBytes } from "./utils.js";

function getBit(bytes: Uint8Array, bitIndex: number): number {
  const byteIndex = Math.floor(bitIndex / 8);
  const bitOffset = 7 - (bitIndex % 8);
  return (bytes[byteIndex] >> bitOffset) & 1;
}

function getCombinedBit(entropy: Uint8Array, checksumByte: number, bitIndex: number): number {
  if (bitIndex < 128) {
    return getBit(entropy, bitIndex);
  }
  // Checksum is the highest 4 bits of the SHA-256 hash (indices 128..131)
  const checksumBitOffset = 7 - (bitIndex - 128);
  return (checksumByte >> checksumBitOffset) & 1;
}

/**
 * Generate a cryptographically secure 12-word BIP-39 mnemonic phrase.
 * Uses 128 bits of entropy + 4 bits SHA-256 checksum = 132 bits / 11 = 12 words.
 */
export async function generateMnemonic(customEntropy?: Uint8Array): Promise<string> {
  const entropy = customEntropy ?? getRandomBytes(16);
  if (entropy.length !== 16) {
    throw new Error("12-word mnemonic requires exactly 16 bytes (128 bits) of entropy.");
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", entropy as BufferSource);
  const hashBytes = new Uint8Array(hashBuffer);
  const checksumByte = hashBytes[0];

  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    let wordIndex = 0;
    for (let b = 0; b < 11; b++) {
      const bit = getCombinedBit(entropy, checksumByte, i * 11 + b);
      wordIndex = (wordIndex << 1) | bit;
    }
    words.push(BIP39_WORDLIST[wordIndex]);
  }

  return words.join(" ");
}

/**
 * Validate a 12-word BIP-39 mnemonic phrase against wordlist and 4-bit checksum.
 */
export async function validateMnemonic(mnemonic: string): Promise<boolean> {
  try {
    const words = mnemonic.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12) {
      return false;
    }

    // Check all words exist in wordlist and convert to indices
    const indices: number[] = [];
    for (const word of words) {
      const idx = BIP39_WORD_MAP.get(word);
      if (idx === undefined) {
        return false;
      }
      indices.push(idx);
    }

    // Reconstruct 132 bits
    const bits: number[] = [];
    for (const idx of indices) {
      for (let b = 10; b >= 0; b--) {
        bits.push((idx >> b) & 1);
      }
    }

    // Extract 128 bits of entropy (16 bytes)
    const entropy = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        byte = (byte << 1) | bits[i * 8 + b];
      }
      entropy[i] = byte;
    }

    // Extract 4 checksum bits
    let embeddedChecksum = 0;
    for (let i = 128; i < 132; i++) {
      embeddedChecksum = (embeddedChecksum << 1) | bits[i];
    }

    // Compute expected checksum
    const hashBuffer = await crypto.subtle.digest("SHA-256", entropy as BufferSource);
    const hashBytes = new Uint8Array(hashBuffer);
    const expectedChecksum = (hashBytes[0] >> 4) & 0x0f;

    return embeddedChecksum === expectedChecksum;
  } catch {
    return false;
  }
}

/**
 * Derives a 256-bit AES-GCM Recovery Key (RK) from a 12-word BIP-39 mnemonic.
 * Uses PBKDF2 with SHA-256 and 100,000 iterations for defense-in-depth against offline brute force.
 */
export async function deriveRecoveryKey(
  mnemonic: string,
  passphrase = ""
): Promise<CryptoKey> {
  const isValid = await validateMnemonic(mnemonic);
  if (!isValid) {
    throw new Error("Invalid BIP-39 mnemonic phrase. Checksum or wordlist verification failed.");
  }

  const normalizedMnemonic = mnemonic.trim().toLowerCase().normalize("NFKD");
  const salt = stringToBytes(`mnemonic${passphrase.normalize("NFKD")}`);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    stringToBytes(normalizedMnemonic) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  );
}
