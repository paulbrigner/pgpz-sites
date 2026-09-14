// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewThreadPath } from "./resolution-review-links";
import { resolveSafeCallbackUrl } from "./callback-url";
const mocks = vi.hoisted(() => ({ session: vi.fn(), enrolled: vi.fn(), verified: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/config/server", () => ({ boardMembershipAdapter: { resolveMembership: async () => ({ id: "member", email: "director@example.invalid", status: "active", attributes: { role: "member" } }) } }));
vi.mock("@pgpz/core/server", () => ({ resolveActiveMembership: async () => ({ active: true, id: "member", email: "director@example.invalid", status: "active", attributes: { role: "member" } }) }));
vi.mock("@/lib/passkey-enrollment", () => ({ hasBoardPasskey: mocks.enrolled }));
vi.mock("@/lib/passkey-step-up", () => ({ hasBoardPasskeySession: mocks.verified }));
vi.mock("@/lib/audit", () => ({ auditBestEffort: vi.fn(), authenticatedActor: vi.fn() }));
import { requireBoardMember } from "./session";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "director", email: "director@example.invalid" } });
  mocks.enrolled.mockResolvedValue(true); mocks.verified.mockResolvedValue(true);
});
describe("review email authentication return", () => {
  it.each(["anonymous", "enrollment", "verification"])("retains the target through the actual %s guard and callback validator", async (gate) => {
    if (gate === "anonymous") mocks.session.mockResolvedValue(null);
    if (gate === "enrollment") mocks.enrolled.mockResolvedValue(false);
    if (gate === "verification") mocks.verified.mockResolvedValue(false);
    const path = reviewThreadPath("meeting-1", "assessment-1");
    const prefix = gate === "anonymous" ? "/signin?" : `/account/security?${gate}=required&`;
    await expect(requireBoardMember(path)).rejects.toThrow(`${prefix}callbackUrl=${encodeURIComponent(path)}`);
    // SignInForm and passkey return paths both apply this existing validator.
    expect(resolveSafeCallbackUrl(path)).toBe("/meetings/meeting-1?reviewThread=assessment-1");
  });
});
