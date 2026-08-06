import "server-only";

import { createHash } from "node:crypto";

/** Synchronous SHA-256 hex digest. Node's crypto hash is synchronous. */
export type HashFn = (input: string) => string;

export const sha256: HashFn = (input) =>
  createHash("sha256").update(input, "utf8").digest("hex");
