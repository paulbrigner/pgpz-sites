"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileClock,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  XCircle,
} from "lucide-react";
import type {
  CuratedBriefingAnswerStyle,
  CuratedBriefingTopic,
  CuratedBriefingVersion,
} from "@pgpz/x-monitor-core/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TopicDraft = {
  slug: string;
  question: string;
  category: string;
  editorialContext: string;
  answerStyle: CuratedBriefingAnswerStyle;
  refreshIntervalMinutes: number;
  lookbackHours: number;
  retrievalConfig: Record<string, unknown>;
  order: number;
  enabled: boolean;
};

type VersionDraft = { answerText: string; keyPoints: string };

const inputClass =
  "w-full rounded-md border bg-white px-3 py-2 text-sm leading-5 text-slate-800 outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(31,76,111,0.18)]";

const cadenceOptions = [
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Daily" },
  { value: 4320, label: "Every 3 days" },
  { value: 10080, label: "Weekly" },
];

const emptyTopic = (): TopicDraft => ({
  slug: "",
  question: "",
  category: "",
  editorialContext: "",
  answerStyle: "detailed",
  refreshIntervalMinutes: 1440,
  lookbackHours: 720,
  retrievalConfig: {},
  order: 0,
  enabled: true,
});

const topicDraft = (topic: CuratedBriefingTopic): TopicDraft => ({
  slug: topic.slug,
  question: topic.question,
  category: topic.category || "",
  editorialContext: topic.editorial_context || "",
  answerStyle: topic.answer_style,
  refreshIntervalMinutes: topic.refresh_interval_minutes,
  lookbackHours: Number(topic.retrieval_config?.lookback_hours || 720),
  retrievalConfig: topic.retrieval_config || {},
  order: topic.order,
  enabled: topic.enabled,
});

const topicPayload = (draft: TopicDraft) => ({
  slug: draft.slug,
  question: draft.question,
  category: draft.category || null,
  editorial_context: draft.editorialContext || null,
  retrieval_config: { ...draft.retrievalConfig, lookback_hours: draft.lookbackHours },
  answer_style: draft.answerStyle,
  refresh_interval_minutes: draft.refreshIntervalMinutes,
  order: draft.order,
  enabled: draft.enabled,
});

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const versionStatusClasses: Record<string, string> = {
  draft: "border-amber-200 bg-amber-50 text-amber-900",
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  superseded: "border-slate-200 bg-slate-50 text-slate-700",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "Topic Briefings request failed");
  return body as T;
}

function TopicFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: TopicDraft;
  onChange: (draft: TopicDraft) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1 md:col-span-2" htmlFor={`${idPrefix}-question`}>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Curated question</span>
        <textarea
          id={`${idPrefix}-question`}
          value={draft.question}
          onChange={(event) => onChange({ ...draft, question: event.target.value })}
          className={cn(inputClass, "min-h-20")}
          maxLength={1000}
          required
        />
      </label>
      <label className="space-y-1" htmlFor={`${idPrefix}-slug`}>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Stable slug</span>
        <input
          id={`${idPrefix}-slug`}
          value={draft.slug}
          onChange={(event) => onChange({ ...draft, slug: event.target.value.toLowerCase() })}
          className={inputClass}
          placeholder="three-z-architecture"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          required
        />
      </label>
      <label className="space-y-1" htmlFor={`${idPrefix}-category`}>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Category</span>
        <input
          id={`${idPrefix}-category`}
          value={draft.category}
          onChange={(event) => onChange({ ...draft, category: event.target.value })}
          className={inputClass}
          maxLength={120}
          placeholder="Protocol development"
        />
      </label>
      <label className="space-y-1" htmlFor={`${idPrefix}-cadence`}>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Refresh cadence</span>
        <select
          id={`${idPrefix}-cadence`}
          value={draft.refreshIntervalMinutes}
          onChange={(event) => onChange({ ...draft, refreshIntervalMinutes: Number(event.target.value) })}
          className={inputClass}
        >
          {cadenceOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1" htmlFor={`${idPrefix}-lookback`}>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Evidence lookback (hours)</span>
        <input
          id={`${idPrefix}-lookback`}
          type="number"
          min={1}
          max={8760}
          value={draft.lookbackHours}
          onChange={(event) => onChange({ ...draft, lookbackHours: Number(event.target.value) })}
          className={inputClass}
        />
      </label>
      <label className="space-y-1" htmlFor={`${idPrefix}-style`}>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Answer length</span>
        <select
          id={`${idPrefix}-style`}
          value={draft.answerStyle}
          onChange={(event) => onChange({ ...draft, answerStyle: event.target.value as CuratedBriefingAnswerStyle })}
          className={inputClass}
        >
          <option value="brief">Brief</option>
          <option value="balanced">Balanced</option>
          <option value="detailed">Detailed</option>
        </select>
      </label>
      <label className="space-y-1" htmlFor={`${idPrefix}-order`}>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Display order</span>
        <input
          id={`${idPrefix}-order`}
          type="number"
          min={-10000}
          max={10000}
          value={draft.order}
          onChange={(event) => onChange({ ...draft, order: Number(event.target.value) })}
          className={inputClass}
        />
      </label>
      <label className="space-y-1 md:col-span-2" htmlFor={`${idPrefix}-context`}>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Editorial guidance</span>
        <textarea
          id={`${idPrefix}-context`}
          value={draft.editorialContext}
          onChange={(event) => onChange({ ...draft, editorialContext: event.target.value })}
          className={cn(inputClass, "min-h-24")}
          maxLength={4000}
          placeholder="Optional guidance for what the generated draft should cover."
        />
      </label>
      <label className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm font-medium text-[var(--brand-ink)] md:col-span-2">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
          className="h-5 w-5 accent-[var(--brand-ink)]"
        />
        Enabled for scheduled refresh and member publication
      </label>
    </div>
  );
}

export function BriefingsAdminPanel() {
  const [topics, setTopics] = useState<CuratedBriefingTopic[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TopicDraft>>({});
  const [newTopic, setNewTopic] = useState<TopicDraft>(emptyTopic);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, CuratedBriefingVersion[]>>({});
  const [selectedVersion, setSelectedVersion] = useState<Record<string, string>>({});
  const [versionDrafts, setVersionDrafts] = useState<Record<string, VersionDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sortedTopics = useMemo(
    () => [...topics].sort((a, b) => a.order - b.order || a.question.localeCompare(b.question)),
    [topics],
  );

  const loadTopics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<{ items: CuratedBriefingTopic[] }>("/api/admin/x-monitor/briefings");
      setTopics(response.items || []);
      setDrafts(Object.fromEntries((response.items || []).map((topic) => [topic.topic_id, topicDraft(topic)])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load briefing topics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadTopics(); }, []);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy((current) => ({ ...current, [key]: true }));
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Topic Briefings action failed");
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  };

  const createTopic = () => run("create", async () => {
    await api("/api/admin/x-monitor/briefings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(topicPayload(newTopic)),
    });
    setNewTopic(emptyTopic());
    setShowCreate(false);
    setNotice("Topic created. Use Refresh now to generate its first draft.");
    await loadTopics();
  });

  const saveTopic = (topicId: string) => run(`save:${topicId}`, async () => {
    await api(`/api/admin/x-monitor/briefings/topics/${topicId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(topicPayload(drafts[topicId])),
    });
    setNotice("Topic settings saved.");
    await loadTopics();
  });

  const refreshTopic = (topicId: string) => run(`refresh:${topicId}`, async () => {
    await api(`/api/admin/x-monitor/briefings/topics/${topicId}/refresh`, { method: "POST" });
    setNotice("A new briefing draft has been queued. The current published answer remains visible.");
    await loadTopics();
  });

  const archiveTopic = (topic: CuratedBriefingTopic) => {
    if (!window.confirm(`Archive “${topic.question}”? Its published answer will no longer appear to members.`)) return;
    void run(`archive:${topic.topic_id}`, async () => {
      await api(`/api/admin/x-monitor/briefings/topics/${topic.topic_id}`, { method: "DELETE" });
      setNotice("Topic archived.");
      await loadTopics();
    });
  };

  const loadVersions = async (topicId: string, preferredVersionId?: string) => {
    const response = await api<{ items: CuratedBriefingVersion[] }>(
      `/api/admin/x-monitor/briefings/topics/${topicId}/versions`,
    );
    const items = response.items || [];
    setVersions((current) => ({ ...current, [topicId]: items }));
    setVersionDrafts((current) => ({
      ...current,
      ...Object.fromEntries(items.map((version) => [
        version.version_id,
        current[version.version_id] || {
          answerText: version.answer_text,
          keyPoints: version.key_points.join("\n"),
        },
      ])),
    }));
    const selected = preferredVersionId && items.some((version) => version.version_id === preferredVersionId)
      ? preferredVersionId
      : items.find((version) => version.review_status === "draft")?.version_id || items[0]?.version_id;
    if (selected) setSelectedVersion((current) => ({ ...current, [topicId]: selected }));
  };

  const toggleHistory = (topicId: string) => {
    if (expandedTopic === topicId) {
      setExpandedTopic(null);
      return;
    }
    setExpandedTopic(topicId);
    if (!versions[topicId]) {
      void run(`versions:${topicId}`, () => loadVersions(topicId));
    }
  };

  const saveRevision = (topicId: string, versionId: string) => run(`edit:${versionId}`, async () => {
    const draft = versionDrafts[versionId];
    const revised = await api<CuratedBriefingVersion>(`/api/admin/x-monitor/briefings/versions/${versionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer_text: draft.answerText,
        key_points: draft.keyPoints.split("\n").map((point) => point.trim()).filter(Boolean),
      }),
    });
    setNotice("Editorial changes saved as a new draft version.");
    await loadVersions(topicId, revised.version_id);
  });

  const publishVersion = (topicId: string, versionId: string) => run(`publish:${versionId}`, async () => {
    await api(`/api/admin/x-monitor/briefings/versions/${versionId}/publish`, { method: "POST" });
    setNotice("Briefing published to members.");
    await Promise.all([loadTopics(), loadVersions(topicId, versionId)]);
  });

  const rejectVersion = (topicId: string, versionId: string) => {
    const reason = window.prompt("Optional rejection reason:") ?? null;
    if (reason === null) return;
    void run(`reject:${versionId}`, async () => {
      await api(`/api/admin/x-monitor/briefings/versions/${versionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || null }),
      });
      setNotice("Draft rejected. The current published answer is unchanged.");
      await loadVersions(topicId, versionId);
    });
  };

  const rollbackVersion = (topicId: string, versionId: string) => {
    if (!window.confirm("Republish this earlier approved version?")) return;
    void run(`rollback:${versionId}`, async () => {
      await api(`/api/admin/x-monitor/briefings/topics/${topicId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId }),
      });
      setNotice("Earlier version restored and published.");
      await Promise.all([loadTopics(), loadVersions(topicId, versionId)]);
    });
  };

  return (
    <section aria-labelledby="briefings-admin-heading" className="overflow-hidden rounded-2xl border bg-white/90 shadow-sm">
      <div className="border-b bg-[linear-gradient(135deg,rgba(255,247,222,0.92),rgba(239,248,255,0.9))] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="briefings-admin-heading" className="flex items-center gap-2 text-lg font-semibold text-[var(--brand-ink)]">
              <BookOpenText className="h-5 w-5 text-[var(--zcash-gold-deep)]" aria-hidden="true" />
              X Monitor Topic Briefings
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Manage the fixed topic list, schedule evidence refreshes, and review generated drafts.
              Members see only versions an administrator publishes; there is no member answer prompt.
              Topic edits apply to future drafts, while every version keeps the question and settings
              used to generate it.
            </p>
          </div>
          <Button type="button" onClick={() => setShowCreate((visible) => !visible)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New topic
          </Button>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {showCreate ? (
          <form
            className="rounded-2xl border border-[rgba(245,168,0,0.36)] bg-[var(--brand-ice)] p-5"
            onSubmit={(event) => { event.preventDefault(); void createTopic(); }}
          >
            <h3 className="text-base font-semibold text-[var(--brand-ink)]">Create a curated topic</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              This question is administrator-controlled. Creating it does not generate or publish an answer.
            </p>
            <div className="mt-4"><TopicFields draft={newTopic} onChange={setNewTopic} idPrefix="new-briefing" /></div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={busy.create}>
                {busy.create ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                Create topic
              </Button>
            </div>
          </form>
        ) : null}

        {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div> : null}
        {notice ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

        {loading ? (
          <div role="status" className="flex items-center gap-2 rounded-xl border bg-slate-50 p-5 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading briefing topics…
          </div>
        ) : sortedTopics.length === 0 ? (
          <div className="rounded-xl border bg-slate-50 p-8 text-center">
            <BookOpenText className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-[var(--brand-ink)]">No topics configured</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Create the first curated question to begin the review workflow.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedTopics.map((topic) => {
              const draft = drafts[topic.topic_id] || topicDraft(topic);
              const topicVersions = versions[topic.topic_id] || [];
              const selectedId = selectedVersion[topic.topic_id];
              const selected = topicVersions.find((version) => version.version_id === selectedId) || null;
              return (
                <article key={topic.topic_id} className="overflow-hidden rounded-2xl border bg-white">
                  <div className="flex flex-col gap-4 border-b bg-slate-50/70 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--brand-ink)] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-[var(--zcash-gold)]">
                          {topic.category || "Uncategorized"}
                        </span>
                        <span className={cn("rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]", topic.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600")}>
                          {topic.enabled ? "Enabled" : "Disabled"}
                        </span>
                        {topic.latest_run ? (
                          <span className="text-xs text-slate-500">Latest run: {topic.latest_run.status}</span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-base font-semibold leading-6 text-[var(--brand-ink)]">{topic.question}</h3>
                      <p className="mt-1 text-xs text-slate-500">/{topic.slug} · order {topic.order} · next refresh {formatDate(topic.next_refresh_at)}</p>
                      {topic.latest_run?.error ? (
                        <p className="mt-2 text-xs text-rose-700">Latest refresh failed: {topic.latest_run.error.message}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void refreshTopic(topic.topic_id)} disabled={busy[`refresh:${topic.topic_id}`]}>
                        <RefreshCcw className={cn("h-4 w-4", busy[`refresh:${topic.topic_id}`] && "animate-spin")} aria-hidden="true" />
                        Refresh now
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleHistory(topic.topic_id)}>
                        <FileClock className="h-4 w-4" aria-hidden="true" />
                        Review & history
                        <ChevronDown className={cn("h-4 w-4 transition", expandedTopic === topic.topic_id && "rotate-180")} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-5">
                    <TopicFields
                      draft={draft}
                      onChange={(next) => setDrafts((current) => ({ ...current, [topic.topic_id]: next }))}
                      idPrefix={`topic-${topic.topic_id}`}
                    />
                    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
                      <Button type="button" variant="outline" className="text-rose-700" onClick={() => archiveTopic(topic)} disabled={busy[`archive:${topic.topic_id}`]}>
                        <Archive className="h-4 w-4" aria-hidden="true" />
                        Archive
                      </Button>
                      <Button type="button" onClick={() => void saveTopic(topic.topic_id)} disabled={busy[`save:${topic.topic_id}`]}>
                        {busy[`save:${topic.topic_id}`] ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                        Save topic
                      </Button>
                    </div>
                  </div>

                  {expandedTopic === topic.topic_id ? (
                    <div className="border-t bg-[var(--brand-ice)]/45 p-5">
                      {busy[`versions:${topic.topic_id}`] ? (
                        <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading version history…</div>
                      ) : topicVersions.length === 0 ? (
                        <p className="text-sm text-slate-600">No generated versions yet. Use Refresh now to queue the first draft.</p>
                      ) : (
                        <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
                          <div className="space-y-2" aria-label="Briefing version history">
                            {topicVersions.map((version) => (
                              <button
                                key={version.version_id}
                                type="button"
                                onClick={() => setSelectedVersion((current) => ({ ...current, [topic.topic_id]: version.version_id }))}
                                className={cn("w-full rounded-xl border bg-white p-3 text-left transition", selectedId === version.version_id && "border-[rgba(245,168,0,0.7)] shadow-sm")}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-[var(--brand-ink)]">Version {version.version_number}</span>
                                  <span className={cn("rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em]", versionStatusClasses[version.review_status] || versionStatusClasses.superseded)}>{version.review_status}</span>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">Generated {formatDate(version.generated_at)}</p>
                                <p className="mt-1 text-xs text-slate-500">{version.source_count} sources</p>
                              </button>
                            ))}
                          </div>

                          {selected ? (
                            <div className="rounded-2xl border bg-white p-5">
                              <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <h4 className="text-base font-semibold text-[var(--brand-ink)]">Review version {selected.version_number}</h4>
                                  <p className="mt-1 text-xs text-slate-500">Evidence through {formatDate(selected.corpus_through)} · generated {formatDate(selected.generated_at)}</p>
                                  {selected.question !== topic.question ? (
                                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                                      This version answers the earlier snapshot: “{selected.question}”
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {selected.review_status === "draft" ? (
                                    <>
                                      <Button type="button" size="sm" variant="outline" onClick={() => rejectVersion(topic.topic_id, selected.version_id)} disabled={busy[`reject:${selected.version_id}`]}>
                                        <XCircle className="h-4 w-4" aria-hidden="true" />Reject
                                      </Button>
                                      <Button type="button" size="sm" onClick={() => void publishVersion(topic.topic_id, selected.version_id)} disabled={busy[`publish:${selected.version_id}`]}>
                                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />Publish
                                      </Button>
                                    </>
                                  ) : selected.version_id !== topic.current_published_version_id && (selected.review_status === "published" || selected.review_status === "superseded") ? (
                                    <Button type="button" size="sm" variant="outline" onClick={() => rollbackVersion(topic.topic_id, selected.version_id)} disabled={busy[`rollback:${selected.version_id}`]}>
                                      <RotateCcw className="h-4 w-4" aria-hidden="true" />Restore this version
                                    </Button>
                                  ) : null}
                                </div>
                              </div>

                              {selected.review_status === "draft" ? (
                                <div className="mt-4 space-y-4">
                                  <label className="block space-y-1" htmlFor={`answer-${selected.version_id}`}>
                                    <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600"><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Answer Markdown</span>
                                    <textarea
                                      id={`answer-${selected.version_id}`}
                                      value={versionDrafts[selected.version_id]?.answerText || ""}
                                      onChange={(event) => setVersionDrafts((current) => ({ ...current, [selected.version_id]: { ...(current[selected.version_id] || { keyPoints: "" }), answerText: event.target.value } }))}
                                      className={cn(inputClass, "min-h-72 font-mono text-xs leading-6")}
                                    />
                                  </label>
                                  <label className="block space-y-1" htmlFor={`points-${selected.version_id}`}>
                                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Key points · one per line</span>
                                    <textarea
                                      id={`points-${selected.version_id}`}
                                      value={versionDrafts[selected.version_id]?.keyPoints || ""}
                                      onChange={(event) => setVersionDrafts((current) => ({ ...current, [selected.version_id]: { ...(current[selected.version_id] || { answerText: "" }), keyPoints: event.target.value } }))}
                                      className={cn(inputClass, "min-h-28")}
                                    />
                                  </label>
                                  <div className="flex justify-end">
                                    <Button type="button" variant="outline" onClick={() => void saveRevision(topic.topic_id, selected.version_id)} disabled={busy[`edit:${selected.version_id}`]}>
                                      <Save className="h-4 w-4" aria-hidden="true" />Save as new draft
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-4 space-y-4">
                                  <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.answer_text}</div>
                                  {selected.rejection_reason ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">Rejection reason: {selected.rejection_reason}</p> : null}
                                </div>
                              )}

                              {selected.citations.length > 0 ? (
                                <div className="mt-5 border-t pt-4">
                                  <h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Cited evidence</h5>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {selected.citations.map((citation, index) => (
                                      <a
                                        key={`${citation.status_id}-${index}`}
                                        href={/^[0-9]{1,32}$/.test(citation.status_id) ? `https://x.com/i/status/${citation.status_id}` : undefined}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-[var(--brand-denim)]"
                                      >
                                        @{citation.author_handle || "source"}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-3 border-t pt-4 text-xs leading-5 text-slate-500">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Scheduled and manual refreshes create drafts only. Publishing, rejecting, and restoring
            versions are administrator actions, and the last approved version remains visible if a run fails.
          </p>
        </div>
      </div>
    </section>
  );
}
