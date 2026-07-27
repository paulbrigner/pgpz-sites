import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  LetterSummaryMarkdown,
  safeLetterSummaryHref,
} from "./LetterSummaryMarkdown";
import { LetterSummaryField } from "./LetterSummaryField";

describe("LetterSummaryMarkdown", () => {
  afterEach(cleanup);

  it("renders member-facing Markdown with accessible structure", () => {
    render(
      <LetterSummaryMarkdown>
        {"## Why this matters\n\nSupport **clear rules** and *privacy*.\n\n- Network tokens\n- Developer protections\n\n[Read more](https://pgpz.org/letters)"}
      </LetterSummaryMarkdown>,
    );

    expect(
      screen.getByRole("heading", { name: "Why this matters", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText("clear rules").tagName).toBe("STRONG");
    expect(screen.getByText("privacy").tagName).toBe("EM");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Read more" })).toHaveAttribute(
      "href",
      "https://pgpz.org/letters",
    );
  });

  it("does not render raw HTML, images, or unsafe links", () => {
    const { container } = render(
      <LetterSummaryMarkdown>
        {'<script>alert("no")</script>\n\n![tracking](https://example.test/pixel.png)\n\n[unsafe](javascript:alert(1))'}
      </LetterSummaryMarkdown>,
    );

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "unsafe" })).not.toBeInTheDocument();
    expect(screen.getByText("unsafe")).toBeInTheDocument();
  });

  it("renders link labels without nested anchors when links are disabled", () => {
    render(
      <a href="https://example.test/letters/example">
        <LetterSummaryMarkdown disableLinks>
          {"See [the full explanation](https://pgpz.org)."}
        </LetterSummaryMarkdown>
      </a>,
    );

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("the full explanation").tagName).toBe("SPAN");
  });
});

describe("LetterSummaryField", () => {
  afterEach(cleanup);

  it("previews Markdown and enforces the persisted field limit", () => {
    render(
      <LetterSummaryField
        value={"## Member preview\n\n- One\n- Two"}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Member-facing summary")).toHaveAttribute(
      "maxlength",
      "2000",
    );
    expect(screen.getByText("Member preview", { selector: "p" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Member preview", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("safeLetterSummaryHref", () => {
  it("allows web, mail, site-relative, and fragment links", () => {
    expect(safeLetterSummaryHref("https://pgpz.org")).toBe("https://pgpz.org/");
    expect(safeLetterSummaryHref("mailto:team@pgpz.org")).toBe(
      "mailto:team@pgpz.org",
    );
    expect(safeLetterSummaryHref("/letters")).toBe("/letters");
    expect(safeLetterSummaryHref("#signers")).toBe("#signers");
  });

  it("rejects executable and protocol-relative links", () => {
    expect(safeLetterSummaryHref("javascript:alert(1)")).toBeNull();
    expect(safeLetterSummaryHref("//example.test/path")).toBeNull();
  });
});
