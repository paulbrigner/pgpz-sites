import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DisclosureView } from "@/lib/disclosures";
import { DISCLOSURE_CATEGORIES } from "@/lib/disclosures";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), mutate: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: mocks.mutate }));
import { DisclosureWorkspace } from "./DisclosureWorkspace";
const identity = (id: string, role: string) => ({ accessId: id, email: `${id}@example.invalid`, name: id, role });
function fixture(subject = true): DisclosureView {
  return { request: { id: "id", version: 3, kind: "annual", year: 2026, dueDate: null,
    subject: identity("subject", "executive-director"), reviewer: identity("reviewer", "member"), counsel: null, excludedIds: [],
    policy: { documentId: "policy", versionId: "v1", title: "Policy", sequence: 1, sha256: "a".repeat(64), adoption: "proposed" }, createdAt: "2026-09-08T00:00:00Z", createdBy: "chair", status: "submitted", revision: subject ? 0 : 1, latestHash: subject ? null : "signed-v1", lastNoticeAt: null, lastNoticeStatus: null },
    draft: subject ? { hash: "draft-v1", savedAt: "2026-09-08T00:00:00Z", form: { roles: "Director", matter: "Original answers", answers: DISCLOSURE_CATEGORIES.map(() => ({ choice: "none", details: "" })) } } : null,
    events: [], isSubject: subject, isReviewer: !subject, isCounsel: false,
  };
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); mocks.mutate.mockImplementation(async () => ({ ok: true, json: async () => ({ status: "sent" }) })); });
describe("disclosure acknowledgment freshness", () => {
  it("requires a fresh signature review when a reminder reload discovers a different draft", async () => {
    const initial = fixture(); mocks.fetch.mockResolvedValue({ ok: true, json: async () => initial });
    render(<DisclosureWorkspace initial={initial} candidates={[]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Review for signature" }));
    await screen.findByRole("button", { name: "Sign and deliver" });
    fireEvent.click(screen.getByRole("checkbox", { name: /I have read the saved/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Type your account name/ }), { target: { value: "subject" } });
    expect(screen.getByRole("button", { name: "Sign and deliver" })).toBeEnabled();
    const changed = structuredClone(initial); changed.request.version++; changed.draft!.hash = "draft-v2"; changed.draft!.form.matter = "New undisclosed-to-this-tab answers";
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => changed });
    fireEvent.click(screen.getByRole("button", { name: "Email reviewing director" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sign and deliver" })).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: /Additional context/ })).toHaveValue("New undisclosed-to-this-tab answers");
    fireEvent.click(screen.getByRole("button", { name: "Review for signature" }));
    await screen.findByRole("button", { name: "Sign and deliver" });
    expect(screen.getByRole("checkbox", { name: /I have read the saved/ })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: /Type your account name/ })).toHaveValue("");
  });
  it("resets review notes and independence when a new signed revision arrives during an unrelated reload", async () => {
    const initial = fixture(false); render(<DisclosureWorkspace initial={initial} candidates={[]}/>);
    fireEvent.change(screen.getByRole("textbox", { name: "Private review note" }), { target: { value: "Review of old revision" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I am disinterested/ }));
    const changed = structuredClone(initial); changed.request.version++; changed.request.revision = 2; changed.request.latestHash = "signed-v2";
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => changed });
    fireEvent.click(screen.getByRole("button", { name: "Email person disclosing" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Private review note" })).toHaveValue(""));
    expect(screen.getByRole("checkbox", { name: /I am disinterested/ })).not.toBeChecked();
  });
});
