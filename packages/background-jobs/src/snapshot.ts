/**
 * Produces the exact JSON-safe value that a durable job will fingerprint and
 * persist. Object properties whose value is undefined are omitted, while
 * undefined array entries follow JSON semantics and become null.
 */
export function normalizeBackgroundJobSnapshot<T>(value: T): T {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError("Background-job snapshots must be JSON-serializable.");
  }

  if (serialized === undefined) {
    throw new TypeError("Background-job snapshots must be JSON-serializable.");
  }

  return JSON.parse(serialized) as T;
}
