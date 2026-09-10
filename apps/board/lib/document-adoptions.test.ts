import { describe, expect, it } from "vitest";
import { documentAdoptionView, hasVerifiedAdoption, isAdoptionTarget } from "./document-adoptions";
import { consentDigest, consentPayload } from "./written-consent-integrity";
import { validateConsentAdoption } from "./written-consents";
import { adoptedFixture } from "./test-support/adoption";

describe("document adoption evidence", () => {
  it("verifies schema 3 adoption and rejects a changed attachment description", () => {
    const { ballot } = adoptedFixture();
    ballot.attachments![0].description = "Clean version for approval";
    ballot.consent!.schema = 3;
    const hash = consentDigest(consentPayload(ballot, ballot.consent!));
    ballot.consent!.contentHash = hash;
    ballot.consent!.receipts = ballot.consent!.receipts.map(receipt => ({ ...receipt, contentHash: hash }));
    expect(hasVerifiedAdoption(ballot)).toBe(true);
    expect(documentAdoptionView(ballot, "doc")).not.toBeNull();
    ballot.attachments![0].description = "Different explanation";
    expect(hasVerifiedAdoption(ballot)).toBe(false);
  });

  it("requires an adopted action and all exact receipts, not a passed legacy vote or a locator", () => {
    const { ballot } = adoptedFixture();
    expect(hasVerifiedAdoption(ballot)).toBe(true);
    for (const status of ["open", "draft", "cancelled"] as const) expect(hasVerifiedAdoption({ ...ballot, status })).toBe(false);
    expect(hasVerifiedAdoption({ ...ballot, consent: null })).toBe(false);
    expect(hasVerifiedAdoption({ ...ballot, consent: { ...ballot.consent!, schema: 1 } })).toBe(false);
    expect(hasVerifiedAdoption({ ...ballot, consent: { ...ballot.consent!, receipts: ballot.consent!.receipts.slice(1) } })).toBe(false);
    expect(hasVerifiedAdoption({ ...ballot, consent: { ...ballot.consent!, receipts: ballot.consent!.receipts.map((r, i) => i ? r : { ...r, action: "withdraw" }) } })).toBe(false);
  });
  it("binds adoption targets and effectivity to the signed digest and preserves schema 1", () => {
    const { ballot } = adoptedFixture();
    const changed = { ...ballot, adoption: { targets: [], effectiveTerms: "Retroactive" } };
    expect(hasVerifiedAdoption(changed)).toBe(false);
    expect(consentDigest(consentPayload(changed, ballot.consent!))).not.toBe(ballot.consent!.contentHash);
    const oldConsent = { ...ballot.consent!, schema: 1 as const };
    const oldPayload = consentPayload(ballot, oldConsent);
    expect(oldPayload).not.toHaveProperty("adoption");
    expect(consentDigest(consentPayload(changed, oldConsent))).toBe(consentDigest(oldPayload));
  });
  it("only labels expressly adopted versions, never an uploaded revision or supporting evidence", () => {
    const { ballot } = adoptedFixture();
    expect(isAdoptionTarget(ballot, "doc", "v1")).toBe(true);
    expect(isAdoptionTarget(ballot, "doc", "v2")).toBe(false);
    expect(isAdoptionTarget(ballot, "background")).toBe(false);
    const view = documentAdoptionView(ballot, "doc")!;
    expect(view).toMatchObject({ versionId: "v1", signatureCount: 5, directorCount: 5 });
    expect(view.originalHref).toContain("version=v1&consentMeeting=m&consentBallot=b");
    expect(view.effectiveTerms).toContain("October 1");
  });
  it("rejects unknown, duplicate or mismatched adoption targets", () => {
    const { ballot } = adoptedFixture();
    for (const targets of [[{ documentId: "private-disclosure", versionId: "v1" }], [{ documentId: "doc", versionId: "v2" }], [...ballot.adoption!.targets, ...ballot.adoption!.targets]]) {
      expect(() => validateConsentAdoption({ targets, effectiveTerms: "" }, ballot.attachments!)).toThrow();
    }
  });
});
