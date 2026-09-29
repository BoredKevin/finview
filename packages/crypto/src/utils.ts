/**
 * Cryptographic Utility Functions
 * Works seamlessly in Browser, Web Worker, and Node.js environments.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function stringToBytes(str: string): Uint8Array {
  return textEncoder.encode(str);
}

export function bytesToString(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    throw new Error("No secure random number generator available in current runtime.");
  }
  return bytes;
}

/**
 * Custom JSON serialization supporting bigint values without losing financial precision.
 */
export function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "bigint") {
      return { __type: "bigint", value: val.toString() };
    }
    return val;
  });
}

/**
 * Custom JSON parsing restoring bigint values.
 */
export function parseWithBigInt<T = unknown>(json: string): T {
  return JSON.parse(json, (_key, val) => {
    if (val && typeof val === "object" && val.__type === "bigint" && typeof val.value === "string") {
      return BigInt(val.value);
    }
    return val;
  }) as T;
}
