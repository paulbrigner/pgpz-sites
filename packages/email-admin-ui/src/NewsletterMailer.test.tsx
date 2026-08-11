import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewsletterMailer } from "./NewsletterMailer";
import type { NewsletterMailerButtonProps } from "./contracts";
import {
  DEFAULT_NEWSLETTER_MAILER_CONFIG,
  formatDateTime,
  metricText,
} from "./helpers";

function TestButton({
  isLoading: _isLoading,
  size: _size,
  variant: _variant,
  ...props
}: NewsletterMailerButtonProps) {
  return <button {...props} />;
}

const emptyApiState = {
  newsletters: [],
  sendRuns: [],
  recipientCount: 0,
  recipients: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NewsletterMailer", () => {
  it("loads and renders the existing newsletter admin experience", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyApiState), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<NewsletterMailer Button={TestButton} />);

    expect(
      screen.getByRole("heading", { name: "Newsletter drafting and sends" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        DEFAULT_NEWSLETTER_MAILER_CONFIG.newslettersEndpoint,
        { cache: "no-store" },
      ),
    );
    expect(await screen.findByText("0 recipients")).toBeInTheDocument();
    expect(screen.getByText("As you save newsletter drafts, they will appear here.")).toBeInTheDocument();
  });

  it("supports an injected newsletter API path without changing UI behavior", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyApiState), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NewsletterMailer
        Button={TestButton}
        config={{ newslettersEndpoint: "/custom/newsletters" }}
      />,
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/custom/newsletters", {
        cache: "no-store",
      }),
    );
    expect(await screen.findByText("0 recipients")).toBeInTheDocument();
  });

  it("preserves formatting helper fallbacks", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
    expect(metricText(null)).toBe("—");
    expect(metricText(1200)).toBe((1200).toLocaleString());
  });
});
