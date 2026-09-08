import "server-only";
import { createHash } from "node:crypto";
import type { DisclosureSubmission } from "./disclosures";

// DynamoDB map key order is not stable. Canonicalize recursively, including policy and answer objects.
export function disclosureCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(disclosureCanonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${disclosureCanonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const disclosureHash = (value: unknown) => createHash("sha256").update(disclosureCanonical(value)).digest("hex");
export function verifyDisclosureSubmission(value: DisclosureSubmission) {
  const { hash, ...signed } = value;
  return hash === disclosureHash(signed);
}
