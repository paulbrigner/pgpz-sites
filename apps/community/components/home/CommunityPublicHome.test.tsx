import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityPublicHome } from "./CommunityPublicHome";
import { BETTER_AUTH_BASE_PATH } from "@/lib/better-auth-constants";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CommunityPublicHome", () => {
  it("keeps signup on the existing legal and referral-aware route", () => {
    render(
      <CommunityPublicHome
        signupHref="/signin?reason=signup&ref=member-code"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Connect. Learn. Help shape Zcash policy.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join the Community" })).toHaveAttribute(
      "href",
      "/signin?reason=signup&ref=member-code",
    );
    expect(screen.getByRole("link", { name: /Join now/ })).toHaveAttribute(
      "href",
      "/signin?reason=signup&ref=member-code",
    );
  });

  it("sends a normalized Better Auth magic link from the embedded member form", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <CommunityPublicHome
        signupHref="/signin?reason=signup"
      />,
    );
    await user.type(screen.getByLabelText("Email"), "  MEMBER@Example.COM  ");
    await user.click(screen.getByRole("button", { name: "Send secure link" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `${BETTER_AUTH_BASE_PATH}/sign-in/magic-link`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "member@example.com",
          callbackURL: "/",
          errorCallbackURL: "/signin",
        }),
      }),
    );
    expect(screen.getByText("Email sent")).toBeInTheDocument();
  });

  it("keeps account-access errors on the homepage and points new visitors to signup", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: "No active account was found for that email." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <CommunityPublicHome
        signupHref="/signin?reason=signup"
      />,
    );
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "Send secure link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No active account was found for that email.",
    );
    expect(screen.getByRole("link", { name: /Join now/ })).toHaveAttribute(
      "href",
      "/signin?reason=signup",
    );
  });

  it("points readers to the public archive without presenting policy updates as a member benefit", () => {
    render(<CommunityPublicHome signupHref="/signin?reason=signup" />);
    expect(screen.getByRole("link", { name: /Read policy updates/ })).toHaveAttribute("href", "https://pgpz.org/updates");
    expect(screen.getByText(/No login required/)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Members only" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A place to participate" })).toBeVisible();
    expect(screen.queryByRole("img", { name: /cover/i })).not.toBeInTheDocument();
  });

  it("uses the approved independence language and does not claim sponsorship", () => {
    render(
      <CommunityPublicHome
        signupHref="/signin?reason=signup"
      />,
    );

    expect(
      screen.getByText(/is independent, nonpartisan, and not an official Zcash or Zcash Foundation website/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/fiscally sponsored/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Learn more about Pretty Good Policy for Zcash" }),
    ).toHaveAttribute("href", "https://pgpz.org");
  });
});
