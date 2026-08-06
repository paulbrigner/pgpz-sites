/**
 * Deterministic canonical serialization used for hashing. Produces the same
 * byte string for structurally-equal values regardless of object key insertion
 * order, so two processes that record the same event compute the same hash.
 */
export function serializeCanonical(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Map) {
    return canonicalize([...value.entries()]);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const item = canonicalize(record[key]);
      if (item !== null || Object.prototype.hasOwnProperty.call(record, key)) {
        // JSON.stringify drops undefined; keep explicit nulls only.
        sorted[key] = item === undefined ? null : item;
      }
    }
    return sorted;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Cannot serialize non-finite number ${value} canonically.`);
  }
  return value;
}
