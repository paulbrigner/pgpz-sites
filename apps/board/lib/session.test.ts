import { describe, expect, it } from "vitest";
import { createBoardMembershipAdapter } from "@/lib/membership";
import {
  resolveBoardMemberState,
  type BoardSessionResolver,
} from "@/lib/session";

const requestHeaders = new Headers();

const rosterAdapter = () =>
  createBoardMembershipAdapter({
    BOARD_MEMBER_EMAILS: "ada@example.org, grace@example.org",
    BOARD_ADMIN_EMAILS: "ada@example.org",
  });

const noSession: BoardSessionResolver = async () => null;

const sessionFor = (email: string, name?: string | null): BoardSessionResolver =>
  async () => ({ user: { id: "user-1", name: name === undefined ? "Ada" : name, email } });

describe("resolveBoardMemberState", () => {
  it("classifies requests without a session as anonymous", async () => {
    const state = await resolveBoardMemberState(requestHeaders, {
      resolveSession: noSession,
      membershipAdapter: rosterAdapter(),
    });

    expect(state).toEqual({ status: "anonymous" });
  });

  it("classifies signed-in but off-roster emails as restricted", async () => {
    const state = await resolveBoardMemberState(requestHeaders, {
      resolveSession: sessionFor("Not+A.Director@example.org"),
      membershipAdapter: rosterAdapter(),
    });

    expect(state).toEqual({ status: "restricted", email: "not+a.director@example.org" });
  });

  it("classifies allowlisted emails as members with a name fallback", async () => {
    await expect(
      resolveBoardMemberState(requestHeaders, {
        resolveSession: sessionFor("  Grace@Example.org "),
        membershipAdapter: rosterAdapter(),
      }),
    ).resolves.toEqual({
      status: "member",
      member: { name: "Ada", email: "grace@example.org", isAdmin: false },
    });

    await expect(
      resolveBoardMemberState(requestHeaders, {
        resolveSession: sessionFor("ada@example.org", null),
        membershipAdapter: rosterAdapter(),
      }),
    ).resolves.toEqual({
      status: "member",
      member: { name: "Board member", email: "ada@example.org", isAdmin: true },
    });
  });

  it("fails closed when the roster allowlist is empty or missing", async () => {
    const emptyAdapter = createBoardMembershipAdapter({});
    const state = await resolveBoardMemberState(requestHeaders, {
      resolveSession: sessionFor("ada@example.org"),
      membershipAdapter: emptyAdapter,
    });

    expect(state).toEqual({ status: "restricted", email: "ada@example.org" });
  });
});
