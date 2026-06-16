import { describe, expect, it } from "vitest";
import { buildPolicyUpdateEmail } from "@/lib/policy-update-email";
import { getLatestPolicyUpdate } from "@/lib/policy-updates";

const weeklyUpdate = getLatestPolicyUpdate("weekly");
const specialUpdate = getLatestPolicyUpdate("special");

describe("buildPolicyUpdateEmail", () => {
  it("greets recipients by profile name", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      weeklyUpdate,
      {
        email: "paul@example.com",
        name: "Paul Brigner",
      },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain("Hi Paul Brigner,");
    expect(built.text).toContain("Hi Paul Brigner,");
  });

  it("builds a greeting from first and last name fields", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      weeklyUpdate,
      {
        email: "paul@example.com",
        firstName: "Paul",
        lastName: "Brigner",
      },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain("Hi Paul Brigner,");
    expect(built.text).toContain("Hi Paul Brigner,");
  });

  it("falls back when no profile name is available", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      weeklyUpdate,
      { email: "unknown@example.com" },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain("Hi there,");
    expect(built.text).toContain("Hi there,");
  });

  it("renders policy update tables in HTML and text email bodies", () => {
    if (!specialUpdate) throw new Error("Missing special update fixture");

    const built = buildPolicyUpdateEmail(
      specialUpdate,
      { email: "paul@example.com", name: "Paul Brigner" },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain("Status as of June 12, 2026");
    expect(built.html).toContain("Digital Asset Market Clarity Act");
    expect(built.text).toContain("Development | Status as of June 12, 2026 | Relevance to the Zcash ecosystem");
    expect(built.text).toContain("SEC closure of the Zcash Foundation inquiry");
  });
});
