"use client";

import { useState } from "react";
import type { LibraryDocument } from "@/lib/document-library";

export function InEffectControl({ document, busy, onSave }: {
  document: LibraryDocument;
  busy: boolean;
  onSave: (document: LibraryDocument, versionId: string | null, reason: string) => Promise<boolean>;
}) {
  const [versionId, setVersionId] = useState(document.inEffect?.versionId ?? "");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return <details className="mt-3 rounded-xl border border-[var(--border)] bg-white/80 p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Manage in-effect designation</summary>
    <p className="mt-2 text-xs text-[var(--muted)]">Record which version is currently operative after verifying any required approval, filing, or conditions. This designation does not adopt a document. New uploads will not change it.</p>
    <form className="mt-3 grid gap-3" onSubmit={async (event) => {
      event.preventDefault();
      if (confirmed && await onSave(document, versionId || null, reason)) { setReason(""); setConfirmed(false); }
    }}>
      <label className="grid gap-1 font-semibold">In-effect version
        <select value={versionId} disabled={busy} onChange={(event) => { setVersionId(event.target.value); setConfirmed(false); }} className="min-w-0 rounded-lg border border-[var(--border-strong)] bg-white p-2">
          <option value="">No version designated</option>
          {document.versions.map((version) => <option key={version.versionId} value={version.versionId} disabled={document.status === "archived"}>Version {version.sequence}{version.versionId === document.currentVersionId ? " · Latest upload" : ""}</option>)}
        </select>
      </label>
      <label className="grid gap-1 font-semibold">Basis for this designation or change
        <textarea required maxLength={1000} rows={2} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="For example: original Articles filed July 30, 2026; proposed amendments have not been filed." className="rounded-lg border border-[var(--border-strong)] bg-white p-2 font-normal" />
      </label>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />I have verified the current status and intend to record this designation or clear it.</label>
      <button type="submit" disabled={busy || !confirmed || !reason.trim() || document.revision === undefined} className="w-fit rounded-full bg-[var(--primary)] px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save designation"}</button>
    </form>
  </details>;
}
