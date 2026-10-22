import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmailLinkPage, { dynamic, metadata, revalidate } from "./page";
import { EmailLinkContinue } from "./email-link-continue";

const token = "abcdefghijklmnopqrstuvwxyzABCDEF";
const origin = "https://board.pgpz.org";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Board email-link landing page", () => {
  it("renders without consuming, navigating, or exposing a verification link to prefetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const assign = vi.fn();
    const originalWindow = window;
    vi.stubGlobal("window", new Proxy(originalWindow, {
      get(target, property) {
        return property === "location" ? { assign } : Reflect.get(target, property, target);
      },
    }));
    const result = render(await EmailLinkPage({ searchParams: Promise.resolve({ token, callbackUrl: "/meetings" }) }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeVisible();
    expect(screen.getByText(/set up a passkey/)).toBeVisible();
    expect(result.container.querySelector('a[href*="magic-link/verify"], link[href*="magic-link/verify"]')).toBeNull();
    expect(result.container.innerHTML).not.toContain(token);
    expect(fetch).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(metadata.referrer).toBe("no-referrer");
  });

  it.each([undefined, "invalid", [token, token], "a".repeat(257)])("offers a fresh link for invalid token %j", async (invalidToken) => {
    render(await EmailLinkPage({ searchParams: Promise.resolve({ token: invalidToken, callbackUrl: "/meetings" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Request a new sign-in link");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByRole("link", { name: "Request a new sign-in link" })).toHaveAttribute("href", "/signin?callbackUrl=%2Fmeetings");
  });

  it("performs one full same-origin verification navigation only after Continue", () => {
    const assign = vi.fn();
    const originalWindow = window;
    vi.stubGlobal("window", new Proxy(originalWindow, {
      get(target, property) {
        return property === "location" ? { assign } : Reflect.get(target, property, target);
      },
    }));
    render(<EmailLinkContinue token={token} callbackUrl="/meetings?tab=current&item=one" />);
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(assign).toHaveBeenCalledOnce();
    const path = assign.mock.calls[0][0] as string;
    expect(path).toMatch(/^\/api\/better-auth\/magic-link\/verify\?/);
    const verify = new URL(path, origin);
    expect(verify.searchParams.get("token")).toBe(token);
    const success = new URL(decodeURIComponent(verify.searchParams.get("callbackURL")!), origin);
    expect(success.pathname).toBe("/account/security");
    expect(success.searchParams.get("callbackUrl")).toBe("/meetings?tab=current&item=one");
    expect(screen.getByRole("button", { name: "Continuing…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Continuing…" }));
    expect(assign).toHaveBeenCalledOnce();
  });
});
