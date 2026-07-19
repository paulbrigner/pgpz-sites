"use client";

const memoryFallback = new Map<string, string>();

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function hexadecimal(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function readStored(key: string) {
  try {
    return window.sessionStorage.getItem(key) || memoryFallback.get(key) || null;
  } catch {
    return memoryFallback.get(key) || null;
  }
}

function writeStored(key: string, value: string) {
  memoryFallback.set(key, value);
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The in-memory fallback still protects retries in this page lifecycle.
  }
}

function removeStored(key: string, value: string) {
  if (memoryFallback.get(key) === value) memoryFallback.delete(key);
  try {
    if (window.sessionStorage.getItem(key) === value) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // The storage backend is unavailable; the in-memory entry was still cleared.
  }
}

/**
 * Keeps one idempotency key for the same logical request until the server
 * acknowledges a durable job. Network loss and page reloads therefore reuse
 * the original key instead of creating a second delivery job.
 */
export async function durableRequestIdempotency(
  scope: string,
  payload: unknown,
) {
  const normalizedScope = scope.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(normalizedScope)) {
    throw new Error("A valid durable-request scope is required.");
  }
  const input = new TextEncoder().encode(
    `${normalizedScope}\n${JSON.stringify(canonicalize(payload))}`,
  );
  const digest = await window.crypto.subtle.digest("SHA-256", input);
  const storageKey = `pgpz:durable-request:${normalizedScope}:${hexadecimal(digest)}`;
  const value = readStored(storageKey) || window.crypto.randomUUID();
  writeStored(storageKey, value);
  return {
    value,
    acknowledge() {
      removeStored(storageKey, value);
    },
  };
}
