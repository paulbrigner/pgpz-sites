import { describe, expect, it } from "vitest";
import { buildChainEntry, createInMemoryAuditLedger, sha256, verifyChain } from "./server";

function actor(userId = "user-1") {
  return { type: "authenticated" as const, userId, email: "ada@example.org", role: "admin", capabilities: ["manageBoardDocuments"] };
}

function event(overrides: Record<string, unknown> = {}, seqSalt = "") {
  return {
    category: "authentication",
    action: "sign_in",
    outcome: "success" as const,
    actor: actor(),
    idempotencyKey: `sign-in-${seqSalt}`,
    occurredAt: "2026-08-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("@pgpz/audit-log", () => {
  it("builds a hash-linked chain and verifies cleanly", async () => {
    const ledger = createInMemoryAuditLedger(sha256);
    const a = await ledger.append(event({ idempotencyKey: "k1", requestId: "r1" }));
    const b = await ledger.append(event({ action: "sign_out", outcome: "success", idempotencyKey: "k2", requestId: "r2" }));

    expect(a.sequence).toBe(0);
    expect(a.previousHash).toBeNull();
    expect(b.sequence).toBe(1);
    expect(b.previousHash).toBe(a.eventHash);

    const entries = await ledger.list();
    expect(verifyChain(entries, sha256)).toMatchObject({ ok: true, entryCount: 2 });
  });

  it("is idempotent by idempotency key", async () => {
    const ledger = createInMemoryAuditLedger(sha256);
    const first = await ledger.append(event({ idempotencyKey: "dup" }));
    const retry = await ledger.append(event({ idempotencyKey: "dup" }));

    expect(retry).toEqual(first);
    expect((await ledger.list()).length).toBe(1);
  });

  it("detects tampering of a committed event's content", async () => {
    const ledger = createInMemoryAuditLedger(sha256);
    await ledger.append(event({ idempotencyKey: "k1" }));
    await ledger.append(event({ idempotencyKey: "k2" }));

    const entries = await ledger.list();
    // Tamper with the recorded actor role after the fact.
    const forged = [{ ...entries[0], actor: { ...entries[0].actor, role: "executive-director" } }, entries[1]];

    const result = verifyChain(forged, sha256);
    expect(result.ok).toBe(false);
    expect(result.issues.some((message) => message.includes("eventHash"))).toBe(true);
  });

  it("detects a removed (deleted) entry via a chain gap", async () => {
    const ledger = createInMemoryAuditLedger(sha256);
    await ledger.append(event({ idempotencyKey: "k1" }));
    await ledger.append(event({ idempotencyKey: "k2" }));

    const entries = await ledger.list();
    const spliced = [entries[0], entries[1]];
    // Remove the first entry (deletion).
    const result = verifyChain([spliced[1]], sha256);
    expect(result.ok).toBe(false);
    expect(result.issues.some((message) => message.includes("previousHash"))).toBe(true);
  });

  it("serializes structurally-equal fingerprints identically regardless of key order", () => {
    const base = {
      category: "document_lifecycle",
      action: "version_created",
      outcome: "success" as const,
      actor: actor(),
      idempotencyKey: "same",
      occurredAt: "2026-08-06T00:00:00.000Z",
      recordedAt: "2026-08-06T00:00:00.000Z",
    };
    // Same semantic content, different object-literal insertion order.
    const entryA = buildChainEntry(base, null, sha256);
    const entryB = buildChainEntry(
      { ...base, actor: { ...base.actor } },
      null,
      sha256,
    );
    expect(entryA.eventHash).toBe(entryB.eventHash);
  });
});
