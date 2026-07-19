"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Link2, ListTodo, MessageSquareText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type WorkspaceItem = {
  id: string;
  groupId: string;
  kind: "note" | "task" | "link";
  title: string;
  body: string;
  url: string | null;
  status: "open" | "completed";
  authorName: string;
  createdAt: string;
};

export default function GroupWorkspace({ groupId }: { groupId: string }) {
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [kind, setKind] = useState<WorkspaceItem["kind"]>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/items`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Could not load workspace");
      setItems(Array.isArray(result?.items) ? result.items : []);
    } catch (err: any) {
      setError(err?.message || "Could not load workspace");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const createItem = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, body, url }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Could not add workspace item");
      setTitle(""); setBody(""); setUrl("");
      await load();
    } catch (err: any) {
      setError(err?.message || "Could not add workspace item");
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (item: WorkspaceItem) => {
    setError(null);
    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, createdAt: item.createdAt, completed: item.status !== "completed" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Could not update task");
      setItems((current) => current.map((entry) => entry.id === item.id ? result.item : entry));
    } catch (err: any) {
      setError(err?.message || "Could not update task");
    }
  };

  const icon = (itemKind: WorkspaceItem["kind"]) =>
    itemKind === "task" ? ListTodo : itemKind === "link" ? Link2 : MessageSquareText;

  return (
    <section className="rounded-lg border bg-white/90 p-6 shadow-sm">
      <p className="section-eyebrow text-[var(--brand-denim)]">Live workspace</p>
      <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">Notes, tasks, and useful links</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Items here are shared with all active Coalition members.</p>
      {error ? <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}
      <form onSubmit={createItem} className="mt-5 grid gap-3 rounded-lg border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <select value={kind} onChange={(event) => setKind(event.target.value as WorkspaceItem["kind"])} className="h-10 rounded-md border bg-white px-3 text-sm">
            <option value="note">Note</option><option value="task">Task</option><option value="link">Link</option>
          </select>
          <input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="h-10 rounded-md border px-3 text-sm" />
        </div>
        {kind === "link" ? <input required type="url" maxLength={500} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" className="h-10 rounded-md border px-3 text-sm" /> : null}
        <textarea required rows={3} maxLength={6000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Context, next step, or summary" className="rounded-md border px-3 py-2 text-sm" />
        <div><Button type="submit" size="sm" disabled={saving} isLoading={saving}><Plus className="h-4 w-4" /> Add to workspace</Button></div>
      </form>
      <div className="mt-5 space-y-3">
        {loading ? <div className="rounded-md border bg-white p-4 text-sm text-slate-600">Loading workspace...</div> : null}
        {!loading && !items.length ? <div className="rounded-md border bg-white p-4 text-sm text-slate-600">No workspace items yet.</div> : null}
        {items.map((item) => {
          const Icon = icon(item.kind);
          return (
            <article key={item.id} className={`rounded-lg border bg-white p-4 ${item.status === "completed" ? "opacity-70" : ""}`}>
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-denim)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`font-semibold text-[var(--brand-ink)] ${item.status === "completed" ? "line-through" : ""}`}>{item.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-600">{item.kind}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.body}</p>
                  {item.url ? <Link href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand-denim)] underline">Open link <ExternalLink className="h-3.5 w-3.5" /></Link> : null}
                  <p className="mt-3 text-xs text-slate-500">{item.authorName} · {new Date(item.createdAt).toLocaleString()}</p>
                </div>
                {item.kind === "task" ? (
                  <button type="button" onClick={() => toggleTask(item)} className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {item.status === "completed" ? "Reopen" : "Complete"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
