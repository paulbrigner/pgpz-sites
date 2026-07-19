import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import type { AppSession } from "@/lib/app-session";
import { useAppSession } from "@/lib/use-app-session";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/better-auth-client", () => ({
  signOut: vi.fn(),
}));

function SessionStatus() {
  const { data, status } = useAppSession();
  return <output>{`${status}:${data?.user?.id || "anonymous"}`}</output>;
}

let sessionControls: ReturnType<typeof useAppSession> | null = null;

function SessionController() {
  sessionControls = useAppSession();
  return <output>{`${sessionControls.status}:${sessionControls.data?.user?.id || "anonymous"}`}</output>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function sessionResponse(userId: string) {
  return new Response(
    JSON.stringify({
      user: { id: userId, email: `${userId}@example.test` },
      capabilities: {
        accountActive: true,
        member: true,
        admin: false,
        protectedContent: true,
      },
      authUserId: `auth-${userId}`,
      authProvider: "better-auth",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function sessionRequestCount() {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([input]) => String(input) === "/api/auth/session/app").length;
}

function mockSessionRequests(...responses: Array<Promise<Response>>) {
  const remaining = [...responses];
  vi.mocked(fetch)
    .mockReset()
    .mockImplementation((input) => {
      if (String(input) !== "/api/auth/session/app") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      const response = remaining.shift();
      if (!response) throw new Error("Unexpected session request");
      return response;
    });
}

describe("root providers", () => {
  beforeEach(() => {
    sessionControls = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/auth/session/app") {
          return new Response(
            JSON.stringify({
              user: { id: "member-1", email: "member@example.test" },
              capabilities: {
                accountActive: true,
                member: true,
                admin: false,
                protectedContent: true,
              },
              authUserId: "auth-1",
              authProvider: "better-auth",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(null, { status: 204 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    sessionControls = null;
    vi.unstubAllGlobals();
  });

  it("includes application children in server-rendered output", () => {
    const html = renderToString(
      <Providers>
        <p>Server-rendered application content</p>
      </Providers>,
    );

    expect(html).toContain("Server-rendered application content");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares one session request across every consumer", async () => {
    render(
      <Providers>
        <SessionStatus />
        <SessionStatus />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("authenticated:member-1")).toHaveLength(2);
    });

    const sessionRequests = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input) === "/api/auth/session/app");
    expect(sessionRequests).toHaveLength(1);
  });

  it("queues one fresh request for concurrent updates during the initial load", async () => {
    const initialRequest = deferred<Response>();
    const freshRequest = deferred<Response>();
    mockSessionRequests(initialRequest.promise, freshRequest.promise);

    render(
      <Providers>
        <SessionController />
      </Providers>,
    );

    await waitFor(() => expect(sessionRequestCount()).toBe(1));

    const updates: Promise<AppSession | null>[] = [];
    act(() => {
      updates.push(sessionControls!.update(), sessionControls!.update());
    });
    expect(sessionRequestCount()).toBe(1);

    initialRequest.resolve(sessionResponse("stale-member"));
    await waitFor(() => expect(sessionRequestCount()).toBe(2));
    expect(screen.getByText("authenticated:stale-member")).toBeTruthy();

    let results: Array<AppSession | null> = [];
    await act(async () => {
      freshRequest.resolve(sessionResponse("fresh-member"));
      results = await Promise.all(updates);
    });

    expect(results.map((session) => session?.user.id)).toEqual([
      "fresh-member",
      "fresh-member",
    ]);
    expect(screen.getByText("authenticated:fresh-member")).toBeTruthy();
    expect(sessionRequestCount()).toBe(2);
  });

  it("coalesces one trailing refresh per in-flight request", async () => {
    const initialRequest = deferred<Response>();
    const activeRefresh = deferred<Response>();
    const trailingRefresh = deferred<Response>();
    mockSessionRequests(
      initialRequest.promise,
      activeRefresh.promise,
      trailingRefresh.promise,
    );

    render(
      <Providers>
        <SessionController />
      </Providers>,
    );

    await waitFor(() => expect(sessionRequestCount()).toBe(1));
    initialRequest.resolve(sessionResponse("initial-member"));
    await waitFor(() => {
      expect(screen.getByText("authenticated:initial-member")).toBeTruthy();
    });

    let currentUpdate!: Promise<AppSession | null>;
    act(() => {
      currentUpdate = sessionControls!.update();
    });
    expect(sessionRequestCount()).toBe(2);

    const trailingUpdates: Promise<AppSession | null>[] = [];
    act(() => {
      trailingUpdates.push(sessionControls!.update(), sessionControls!.update());
    });
    expect(sessionRequestCount()).toBe(2);

    let currentResult: AppSession | null = null;
    await act(async () => {
      activeRefresh.resolve(sessionResponse("current-member"));
      currentResult = await currentUpdate;
    });
    expect((currentResult as AppSession | null)?.user.id).toBe("current-member");
    expect(sessionRequestCount()).toBe(3);

    let trailingResults: Array<AppSession | null> = [];
    await act(async () => {
      trailingRefresh.resolve(sessionResponse("trailing-member"));
      trailingResults = await Promise.all(trailingUpdates);
    });

    expect(trailingResults.map((session) => session?.user.id)).toEqual([
      "trailing-member",
      "trailing-member",
    ]);
    expect(screen.getByText("authenticated:trailing-member")).toBeTruthy();
    expect(sessionRequestCount()).toBe(3);
  });
});
