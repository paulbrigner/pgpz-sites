"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Plus } from "lucide-react";

export type ManagerDocument = {
  documentId: string;
  title: string;
  description: string;
  category: string;
  status: "active" | "archived";
  versionCount: number;
  currentVersion: { versionId: string; fileName: string; byteLength: number };
};

async function json(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Request failed");
  }
  return response.json();
}

export function DocumentManager({ documents }: { documents: ManagerDocument[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("incorporation");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function uploadToStaging(f: File): Promise<{ stagingKey: string }> {
    const prepared = await json("/api/documents", { action: "prepareUpload" });
    await fetch(prepared.uploadUrl, { method: "PUT", body: f });
    return { stagingKey: prepared.stagingKey };
  }

  async function createDocument() {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const { stagingKey } = await uploadToStaging(file);
      await json("/api/documents", {
        action: "create",
        stagingKey,
        fileName: file.name,
        title,
        description: "",
        category,
      });
      setMessage("Document created.");
      setFile(null);
      setTitle("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addVersion(documentId: string, f: File) {
    setBusy(true);
    setMessage(null);
    try {
      const { stagingKey } = await uploadToStaging(f);
      await json("/api/documents", { action: "addVersion", documentId, stagingKey, fileName: f.name });
      setMessage("Version added.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Add version failed.");
    } finally {
      setBusy(false);
    }
  }

  async function run(documentId: string, archived: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await json("/api/documents", { action: archived ? "unarchive" : "archive", documentId });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 grid max-w-4xl gap-6">
      <section className="rounded-[1.75rem] border border-[var(--border)] bg-white/82 p-6 shadow-[0_26px_70px_-46px_rgba(15,23,42,0.48)]">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Upload a new document</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title (e.g. Articles of Incorporation)"
            className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--focus)]"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--focus)]"
          >
            <option value="incorporation">Incorporation</option>
            <option value="agreements">Agreements</option>
            <option value="policies">Policies</option>
            <option value="governance">Governance</option>
            <option value="brand-trademark">Brand &amp; trademark</option>
          </select>
        </div>
        <input
          type="file"
          accept=".pdf,.zip,.json,.txt,.md,.csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="mt-3 text-sm text-[var(--muted)]"
        />
        <button
          onClick={() => void createDocument()}
          disabled={busy || !file}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {busy ? "Working…" : "Upload"}
        </button>
      </section>

      {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}

      {documents.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No documents yet.</p>
      ) : (
        <ul className="grid gap-4">
          {documents.map((document) => (
            <li key={document.documentId} className="rounded-[1.75rem] border border-[var(--border)] bg-white/82 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">{document.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {document.category} · {document.versionCount} version{document.versionCount === 1 ? "" : "s"} ·{" "}
                    {document.status === "archived" ? "Archived" : "Active"}
                  </p>
                </div>
                <a
                  href={`/api/documents/${document.documentId}/download`}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--primary)]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> View
                </a>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept=".pdf,.zip,.json,.txt,.md,.csv"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (selected) void addVersion(document.documentId, selected);
                  }}
                  className="text-xs text-[var(--muted)]"
                  aria-label={`Add version to ${document.title}`}
                />
                <button
                  onClick={() => void run(document.documentId, document.status === "archived")}
                  className="rounded-full border border-[var(--border-strong)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--primary)]"
                >
                  {document.status === "archived" ? "Unarchive" : "Archive"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
