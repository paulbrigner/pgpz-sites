import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/board-access-repository", () => ({ boardAccessRepository: { getByEmail: vi.fn() } }));

import { createBoardAccessMembershipAdapter } from "./board-access-membership";

const record = {
  id: "access-1", email: "director@example.org", name: "Director", role: "member" as const,
  status: "active" as const, version: 2, createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "admin@example.org", updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "admin@example.org", activatedAt: "2026-01-01T00:00:00.000Z",
  deactivatedAt: null, sessionsRevokedAt: null,
};

describe("Board access registry membership", () => {
  it("resolves active roles and capabilities from the registry", async () => {
    const adapter = createBoardAccessMembershipAdapter({ getByEmail: vi.fn().mockResolvedValue({ ...record, role: "legal-counsel" }) });
    await expect(adapter.resolve({ email: " DIRECTOR@example.org " })).resolves.toMatchObject({
      active: true,
      attributes: { role: "legal-counsel", isAdmin: true, source: "board-access-registry", accessVersion: 2 },
    });
  });

  it.each([null, { ...record, status: "invited" }, { ...record, status: "deactivated" }])(
    "fails closed for missing or inactive records",
    async (access) => {
      const adapter = createBoardAccessMembershipAdapter({ getByEmail: vi.fn().mockResolvedValue(access) });
      await expect(adapter.resolve({ email: record.email })).resolves.toMatchObject({ active: false });
    },
  );
});
