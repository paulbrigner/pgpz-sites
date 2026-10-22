import { describe, expect, it } from "vitest";
import {
  buildBoardEmailLinkLandingUrl,
  buildBoardEmailLinkVerificationPath,
  readBoardEmailLinkToken,
  resolveBoardEmailLinkCallback,
} from "./email-link";

const origin = "https://board.pgpz.org";
const token = "abcdefghijklmnopqrstuvwxyzABCDEF";
const verificationUrl = (callback = "/") => `${origin}/api/better-auth/magic-link/verify?${new URLSearchParams({ token, callbackURL: callback })}`;

describe("Board email-link input", () => {
  it("accepts the current token format and rejects missing, repeated, malformed or overlong values", () => {
    expect(readBoardEmailLinkToken(token)).toBe(token);
    for (const value of [undefined, null, "", [token], [token, token], "short", `${token} `, `<${token}>`, "a".repeat(257)]) {
      expect(readBoardEmailLinkToken(value)).toBeNull();
    }
  });

  it("preserves a local destination including its query, and unwraps security callbacks", () => {
    const destination = "/meetings/meeting-1?ballot=ballot-1&assessment=director-1";
    expect(resolveBoardEmailLinkCallback(destination)).toBe(destination);
    const security = `/account/security?callbackUrl=${encodeURIComponent(destination)}`;
    expect(resolveBoardEmailLinkCallback(security)).toBe(destination);
    expect(resolveBoardEmailLinkCallback(`/account/security?callbackUrl=${encodeURIComponent(security)}`)).toBe(destination);
  });

  it.each([
    undefined, null, ["/meetings"], "//evil.example", "https://evil.example/", "javascript:alert(1)",
    "/\\evil.example", "/%2f%2fevil.example", "/bad%00", "/bad%", "a".repeat(2_049),
    "/signin", "/signin?callbackUrl=%2Fmeetings", "/signin/email-link", "/s%69gnin/email-link", "/signin/",
    "/api", "/api/better-auth/sign-out", "/%61pi/better-auth/magic-link/verify",
    "/account/security", "/account/security?callbackUrl=%2Fsignin", "/account/security?callbackUrl=%2Fapi%2Fdocuments",
    "/account/security?callbackUrl=%2Fmeetings&callbackUrl=%2Fdocuments",
  ].map((value) => ({ value })))("falls back to the portal root for unsafe or looping callbacks", ({ value }) => {
    expect(resolveBoardEmailLinkCallback(value)).toBe("/");
  });
});

describe("Board email-link landing URL", () => {
  it("rewrites only a trusted verification URL and preserves the token and original destination", () => {
    const destination = "/meetings/meeting-1?ballot=ballot-1&assessment=director-1";
    const source = new URL(verificationUrl(`/account/security?callbackUrl=${encodeURIComponent(destination)}`));
    source.searchParams.set("errorCallbackURL", "https://evil.example");
    const landing = new URL(buildBoardEmailLinkLandingUrl(source.toString(), origin));
    expect(landing.origin).toBe(origin);
    expect(landing.pathname).toBe("/signin/email-link");
    expect([...landing.searchParams]).toEqual([["token", token], ["callbackUrl", destination]]);
  });

  it("uses the explicitly configured development origin", () => {
    const local = "http://localhost:3002";
    const landing = new URL(buildBoardEmailLinkLandingUrl(verificationUrl().replace(origin, local), local));
    expect(landing.origin).toBe(local);
    expect(landing.pathname).toBe("/signin/email-link");
  });

  it.each([
    verificationUrl().replace(origin, "https://evil.example"),
    verificationUrl().replace("/magic-link/verify", "/sign-out"),
    verificationUrl().replace("https://", "https://user:password@"),
    `${verificationUrl()}&token=${token}`,
    `${verificationUrl()}#fragment`,
    `${origin}/api/better-auth/magic-link/verify?token=short`,
  ])("rejects malformed or untrusted source URLs", (value) => {
    expect(() => buildBoardEmailLinkLandingUrl(value, origin)).toThrow("Invalid Board email sign-in link.");
  });

  it("drops ambiguous or unsafe source callbacks", () => {
    for (const source of [`${verificationUrl("/meetings")}&callbackURL=%2Fdocuments`, verificationUrl("https://evil.example")]) {
      expect(new URL(buildBoardEmailLinkLandingUrl(source, origin)).searchParams.get("callbackUrl")).toBe("/");
    }
  });
});

describe("Board explicit email-link continuation", () => {
  it("targets the fixed same-origin endpoint and survives Better Auth's extra callback decoding", () => {
    const destination = "/meetings/meeting-1?ballot=ballot-1&assessment=director-1";
    const path = buildBoardEmailLinkVerificationPath(token, destination);
    expect(path).toMatch(/^\/api\/better-auth\/magic-link\/verify\?/);
    const verification = new URL(path!, origin);
    expect(verification.searchParams.get("token")).toBe(token);
    const success = new URL(decodeURIComponent(verification.searchParams.get("callbackURL")!), origin);
    const failure = new URL(decodeURIComponent(verification.searchParams.get("errorCallbackURL")!), origin);
    expect(success.pathname).toBe("/account/security");
    expect(failure.pathname).toBe("/signin");
    expect(success.searchParams.get("callbackUrl")).toBe(destination);
    expect(failure.searchParams.get("callbackUrl")).toBe(destination);
  });

  it("does not build a verification request without a valid token", () => {
    expect(buildBoardEmailLinkVerificationPath(null, "/meetings")).toBeNull();
    expect(buildBoardEmailLinkVerificationPath([token], "/meetings")).toBeNull();
  });
});
