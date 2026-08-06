import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityPublicHome } from "./CommunityPublicHome";
import { BETTER_AUTH_BASE_PATH } from "@/lib/better-auth-constants";

const featuredPolicyUpdates = [
  {
    slug: "2026-07-27-weekly-policy-memo",
    categoryLabel: "Weekly Policy Memo",
    title: "Weekly Policy Memo: Week of July 27, 2026",
    shortTitle: "Weekly Policy Memo: July 27, 2026",
    summary: "The latest member policy context.",
    emailPreheader: "Current policy context and practical action items for members.",
    coverImage: "/protected-cover.png",
    portalPath: "/updates/2026-07-27-weekly-policy-memo",
    publishedAt: "2026-07-27",
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CommunityPublicHome", () => {
  it("keeps signup on the existing legal and referral-aware route", () => {
    render(
      <CommunityPublicHome
        signupHref="/signin?reason=signup&ref=member-code"
        featuredPolicyUpdates={featuredPolicyUpdates}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "A member home for Zcash policy engagement.",
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
        featuredPolicyUpdates={featuredPolicyUpdates}
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
        featuredPolicyUpdates={featuredPolicyUpdates}
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

  it("separates member-only and public recent work without protected imagery", () => {
    render(
      <CommunityPublicHome
        signupHref="/signin?reason=signup"
        featuredPolicyUpdates={featuredPolicyUpdates}
      />,
    );

    expect(screen.getByText("Weekly Policy Memo · Jul 27")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Members only" })).toHaveAttribute(
      "href",
      "#member-sign-in",
    );
    expect(screen.getByText("Statements for the Record · Jul 24")).toBeInTheDocument();
    expect(screen.getByText("How Zcash Works · Updated Aug 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CLARITY Act statement" })).toHaveAttribute(
      "href",
      "https://community.pgpz.org/resources/statements-for-the-record/2026-07-17-hfsc-clarity-act-statement-for-the-record.pdf",
    );
    expect(screen.getByRole("link", { name: "FinCEN oversight statement" })).toHaveAttribute(
      "href",
      "https://community.pgpz.org/resources/statements-for-the-record/2026-07-21-hfsc-fincen-oversight-statement-for-the-record.pdf",
    );
    expect(screen.getByRole("link", { name: "Read the public guide" })).toHaveAttribute(
      "href",
      "/zec-shelf/how-zcash-works.html",
    );
    expect(screen.queryByRole("img", { name: /cover/i })).not.toBeInTheDocument();
  });

  it("advances the memo preview when a newer published weekly update is available", () => {
    render(
      <CommunityPublicHome
        signupHref="/signin?reason=signup"
        featuredPolicyUpdates={[
          {
            ...featuredPolicyUpdates[0],
            publishedAt: "2026-08-03",
            emailPreheader: "Newer weekly policy context for members.",
          },
        ]}
      />,
    );

    expect(screen.getByText("Weekly Policy Memo · Aug 3")).toBeInTheDocument();
    expect(screen.getByText("Newer weekly policy context for members.")).toBeInTheDocument();
  });

  it("uses the approved independence language and does not claim sponsorship", () => {
    render(
      <CommunityPublicHome
        signupHref="/signin?reason=signup"
        featuredPolicyUpdates={featuredPolicyUpdates}
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
