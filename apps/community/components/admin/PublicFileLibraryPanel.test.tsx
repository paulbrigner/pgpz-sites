import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicFileLibraryPanel } from "./PublicFileLibraryPanel";

const files = [
  {
    path: "statements-for-the-record/2026-test.pdf",
    title: "HFSC Statement for the Record",
    description: "Public congressional statement",
    originalFileName: "2026-test.pdf",
    contentType: "application/pdf",
    fileSize: 217172,
    access: "public" as const,
    status: "active",
    createdAt: "2026-07-24T12:00:00.000Z",
    createdBy: "admin-1",
    updatedAt: "2026-07-24T12:00:00.000Z",
    updatedBy: "admin-1",
    archivedAt: null,
    archivedBy: null,
    previousVersionCount: 1,
    url: "https://community.pgpz.org/resources/statements-for-the-record/2026-test.pdf",
  },
  {
    path: "archive/old.pdf",
    title: "Archived file",
    description: "",
    originalFileName: "old.pdf",
    contentType: "application/pdf",
    fileSize: 100,
    access: "members" as const,
    status: "archived",
    createdAt: "2026-07-20T12:00:00.000Z",
    createdBy: "admin-1",
    updatedAt: "2026-07-21T12:00:00.000Z",
    updatedBy: "admin-1",
    archivedAt: "2026-07-21T12:00:00.000Z",
    archivedBy: "admin-1",
    previousVersionCount: 0,
    url: "https://community.pgpz.org/resources/archive/old.pdf",
  },
];

describe("PublicFileLibraryPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ files }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows existing public files, stable URLs, and stored-version counts", async () => {
    render(<PublicFileLibraryPanel />);
    expect(await screen.findByText("HFSC Statement for the Record")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "https://community.pgpz.org/resources/statements-for-the-record/2026-test.pdf",
      }),
    ).toHaveAttribute(
      "href",
      "https://community.pgpz.org/resources/statements-for-the-record/2026-test.pdf",
    );
    expect(screen.getByText(/1 previous version/)).toBeInTheDocument();
    expect(
      within(screen.getByText("HFSC Statement for the Record").closest("article")!).getByText(
        "Public",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Archived file")).not.toBeInTheDocument();
  });

  it("reveals archived files on request", async () => {
    const user = userEvent.setup();
    render(<PublicFileLibraryPanel />);
    await screen.findByText("HFSC Statement for the Record");
    await user.click(screen.getByRole("checkbox", { name: "Show archived" }));
    expect(screen.getByText("Archived file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore access" })).toBeInTheDocument();
    expect(
      within(screen.getByText("Archived file").closest("article")!).getByText("Members only"),
    ).toBeInTheDocument();
  });

  it("sends the selected access setting through both upload steps", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url === "https://storage.example/upload" && method === "PUT") {
        return new Response(null, { status: 200 });
      }

      if (url === "/api/admin/public-files" && method === "POST") {
        const body = JSON.parse(String(init?.body || "{}"));
        if (body.action === "prepareUpload") {
          return new Response(
            JSON.stringify({
              upload: {
                path: "member-guide.pdf",
                versionId: "version-1",
                s3Key: "public-files/member-guide/version-1.pdf",
                uploadUrl: "https://storage.example/upload",
                headers: { "Content-Type": "application/pdf" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            file: {
              ...files[0],
              path: "member-guide.pdf",
              title: "Member Guide",
              access: "members",
              url: "https://community.pgpz.org/resources/member-guide.pdf",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ files }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicFileLibraryPanel />);
    await screen.findByText("HFSC Statement for the Record");

    await user.upload(
      screen.getByLabelText(/^File/),
      new File(["%PDF"], "member-guide.pdf", { type: "application/pdf" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Access" }),
      "members",
    );
    fireEvent.submit(screen.getByRole("button", { name: "Upload file" }).closest("form")!);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Uploaded Member Guide for members only",
    );

    const uploadBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body || "{}")));
    expect(uploadBodies).toHaveLength(2);
    expect(uploadBodies[0]).toMatchObject({
      action: "prepareUpload",
      access: "members",
    });
    expect(uploadBodies[1]).toMatchObject({
      action: "completeUpload",
      access: "members",
    });
  });

  it("allows access to be changed while editing file details", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Response(
          JSON.stringify({ file: { ...files[0], access: "members" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ files }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicFileLibraryPanel />);
    await screen.findByText("HFSC Statement for the Record");
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    await user.selectOptions(
      screen.getAllByRole("combobox", { name: "Access" }).at(-1)!,
      "members",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Updated details for HFSC Statement for the Record.",
      );
    });

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body || "{}"))).toMatchObject({
      path: files[0].path,
      access: "members",
    });
  });
});
