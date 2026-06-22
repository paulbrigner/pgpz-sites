"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, EyeOff, FileText, MailCheck, RefreshCcw, Search, Send, Sparkles, UploadCloud, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PolicyUpdateSummary } from "@/lib/policy-updates";
import { cn } from "@/lib/utils";

type PolicyUpdateEmailStats = {
  sent: number;
  failed: number;
  draftSent: number;
  lastSentAt: string | null;
};

type PolicyUpdateSendHistoryItem = {
  id: string;
  updateSlug: string;
  title: string;
  shortTitle: string;
  category: string;
  categoryLabel: string;
  subject: string;
  sentAt: string;
  lastEventAt: string;
  audienceMode: "all_active_members" | "selected_members";
  stats: {
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    openCount: number | null;
    clickCount: number | null;
    unsubscribeCount: number | null;
    possibleForwardOpenCount: number | null;
  };
  failurePreview: Array<{ email: string; error: string }>;
  source: "send_run" | "legacy_email_log";
  engagementTracked: boolean;
};

type ApiState = {
  updates: PolicyUpdateSummary[];
  recipientCount: number;
  recipients: AudienceRecipient[];
  statsBySlug: Record<string, PolicyUpdateEmailStats>;
  sendHistory: PolicyUpdateSendHistoryItem[];
};

type AudienceRecipient = {
  id: string;
  email: string;
  name: string | null;
};

type SendResult = {
  ok: boolean;
  title: string;
  draft?: boolean;
  recipientEmail?: string | null;
  resolvedRecipientName?: string | null;
  sent: number;
  failed: number;
  recipientCount: number;
  failures?: Array<{ email: string; error: string }>;
};

type UploadPrepareResponse = {
  ok?: boolean;
  error?: string;
  upload?: {
    slug: string;
    s3Key: string;
    uploadUrl: string;
    headers?: Record<string, string>;
  };
  metadata?: {
    category: "weekly" | "special";
    publishedAt: string;
    title: string;
    shortTitle: string;
    displayDate: string;
    summary: string;
    emailSubject: string;
    emailPreheader: string;
    fileName: string;
    fileSize: number;
    contentType: string;
  };
};

type Props = {
  initialUpdates: PolicyUpdateSummary[];
};

const MAX_POLICY_UPDATE_UPLOAD_BYTES = 25 * 1024 * 1024;

const emptyStats: PolicyUpdateEmailStats = {
  sent: 0,
  failed: 0,
  draftSent: 0,
  lastSentAt: null,
};

const formatDateTime = (value: string | null) => {
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

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const titleFromFileName = (fileName: string) =>
  fileName.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

const fileHasPdfSignature = async (file: File) => {
  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...bytes) === "%PDF-";
};

const visibilityLabel = (update: PolicyUpdateSummary) => {
  if (update.source !== "uploaded") return "Published";
  if (update.visibilityStatus === "published") return "Published";
  if (update.visibilityStatus === "unpublished") return "Unpublished";
  return "Draft";
};

const visibilityClassName = (update: PolicyUpdateSummary) => {
  const status = update.source === "uploaded" ? update.visibilityStatus || "draft" : "published";
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "unpublished") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-800";
};

const generationLabel = (update: PolicyUpdateSummary) => {
  if (update.source !== "uploaded") return "";
  if (update.generationStatus === "generated") return "Generated";
  if (update.generationStatus === "failed") return "Generation failed";
  return "Needs content";
};

const generationClassName = (update: PolicyUpdateSummary) => {
  if (update.generationStatus === "generated") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (update.generationStatus === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
};

function PolicyUpdateSendHistoryCard({
  send,
  onSendToSelected,
  canSendToSelected,
  isSendingToSelected,
}: {
  send: PolicyUpdateSendHistoryItem;
  onSendToSelected: (send: PolicyUpdateSendHistoryItem) => void;
  canSendToSelected: boolean;
  isSendingToSelected: boolean;
}) {
  const stats = send.stats;
  const audienceLabel =
    send.audienceMode === "selected_members" ? "Selected members" : "All active members";
  const deliveryMetrics = [
    ["Recipients", stats.recipientCount],
    ["Sent", stats.sentCount],
    ["Failed", stats.failedCount],
  ] as const;
  const engagementMetrics = [
    ["Opens", stats.openCount],
    ["Clicks", stats.clickCount],
    ["Unsubs", stats.unsubscribeCount],
    ["Possible forwards", stats.possibleForwardOpenCount],
  ] as const;

  return (
    <article className="overflow-hidden rounded-2xl border bg-white/95 shadow-sm">
      <div className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-[var(--brand-ink)]">
                {send.shortTitle || send.title}
              </h3>
              <span className="rounded-full bg-[var(--brand-ice)] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--brand-denim)]">
                {send.categoryLabel}
              </span>
              {send.source === "legacy_email_log" ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Reconstructed
                </span>
              ) : null}
              {!send.engagementTracked ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-800">
                  Delivery only
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Sent {formatDateTime(send.sentAt)} · {audienceLabel}
            </p>
            {send.subject ? (
              <p className="mt-3 text-sm font-medium leading-6 text-slate-700">{send.subject}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              title={
                canSendToSelected
                  ? "Send this previous update to selected subscribers"
                  : "Choose selected subscribers and select recipients first"
              }
              disabled={!canSendToSelected || isSendingToSelected}
              onClick={() => onSendToSelected(send)}
            >
              {isSendingToSelected ? <MailCheck className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
              Selected
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/updates/${send.updateSlug}`} target="_blank" rel="noopener noreferrer">
                Portal view
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t bg-slate-50/80 px-4 py-3 sm:grid-cols-3 lg:grid-cols-7">
        {deliveryMetrics.map(([label, value]) => (
          <div key={label}>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
            <div className="mt-1 text-sm font-semibold text-[var(--brand-ink)]">{value.toLocaleString()}</div>
          </div>
        ))}
        {engagementMetrics.map(([label, value]) => (
          <div key={label}>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
            <div className="mt-1 text-sm font-semibold text-[var(--brand-ink)]">
              {typeof value === "number" ? value.toLocaleString() : "—"}
            </div>
          </div>
        ))}
      </div>
      {!send.engagementTracked ? (
        <div className="border-t bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          Engagement stats are unavailable for this reconstructed send because the email was sent before tracking
          tokens were attached to policy-update emails.
        </div>
      ) : (
        <div className="border-t px-4 py-3 text-xs leading-5 text-slate-500">
          Possible forwards are inferred from multiple distinct hashed opener fingerprints on a single recipient
          tracking token. Email privacy proxies can affect this signal.
        </div>
      )}
      {send.failurePreview.length ? (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          <div className="font-semibold">Recent failures</div>
          <ul className="mt-2 space-y-1">
            {send.failurePreview.map((failure) => (
              <li key={`${send.id}-${failure.email}-${failure.error}`}>
                {failure.email || "Unknown"}: {failure.error || "Failed"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function PolicyUpdateMailer({ initialUpdates }: Props) {
  const [updates, setUpdates] = useState<PolicyUpdateSummary[]>(initialUpdates);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [audienceRecipients, setAudienceRecipients] = useState<AudienceRecipient[]>([]);
  const [statsBySlug, setStatsBySlug] = useState<Record<string, PolicyUpdateEmailStats>>({});
  const [sendHistory, setSendHistory] = useState<PolicyUpdateSendHistoryItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState(initialUpdates[0]?.slug || "");
  const [audienceMode, setAudienceMode] = useState<"all_active_members" | "selected_members">("all_active_members");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [audienceQuery, setAudienceQuery] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState<"weekly" | "special">("weekly");
  const [uploadPublishedAt, setUploadPublishedAt] = useState(todayInputValue);
  const [uploadSummary, setUploadSummary] = useState("");
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingPrevious, setSendingPrevious] = useState<Record<string, boolean>>({});
  const [visibilityUpdatingSlug, setVisibilityUpdatingSlug] = useState<string | null>(null);
  const [generatingContentSlug, setGeneratingContentSlug] = useState<string | null>(null);
  const [draftSending, setDraftSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  const selectedUpdate = useMemo(
    () => updates.find((update) => update.slug === selectedSlug) || updates[0] || null,
    [selectedSlug, updates],
  );
  const selectedVisibilityStatus =
    selectedUpdate?.source === "uploaded" ? selectedUpdate.visibilityStatus || "draft" : "published";
  const selectedCanSendMembers = selectedVisibilityStatus === "published";
  const selectedHasGeneratedContent = selectedUpdate?.generationStatus === "generated";
  const selectedStats = selectedUpdate ? statsBySlug[selectedUpdate.slug] || emptyStats : emptyStats;
  const selectedRecipients = useMemo(() => {
    const selected = new Set(selectedRecipientIds);
    return audienceRecipients.filter((recipient) => selected.has(recipient.id));
  }, [audienceRecipients, selectedRecipientIds]);
  const filteredAudienceRecipients = useMemo(() => {
    const normalized = audienceQuery.trim().toLowerCase();
    if (!normalized) return audienceRecipients;
    return audienceRecipients.filter((recipient) =>
      [recipient.name, recipient.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [audienceQuery, audienceRecipients]);
  const selectedAudienceLabel =
    audienceMode === "all_active_members"
      ? `${recipientCount ?? 0} active member${recipientCount === 1 ? "" : "s"}`
      : `${selectedRecipientIds.length} selected member${selectedRecipientIds.length === 1 ? "" : "s"}`;
  const audienceReady =
    audienceMode === "all_active_members" ? !!recipientCount : selectedRecipientIds.length > 0;

  const loadState = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/policy-updates", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<ApiState> & { error?: string };
      if (!res.ok) throw new Error(body?.error || "Failed to load policy update sender");
      setUpdates(body.updates || []);
      setRecipientCount(typeof body.recipientCount === "number" ? body.recipientCount : 0);
      setAudienceRecipients(body.recipients || []);
      setStatsBySlug(body.statsBySlug || {});
      setSendHistory(body.sendHistory || []);
      if (body.updates?.length) {
        setSelectedSlug((current) =>
          current && body.updates?.some((update) => update.slug === current)
            ? current
            : body.updates?.[0]?.slug || "",
        );
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load policy update sender");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedRecipientIds((current) => {
      const validIds = new Set(audienceRecipients.map((recipient) => recipient.id));
      return current.filter((id) => validIds.has(id));
    });
  }, [audienceRecipients]);

  const handleUploadFileChange = (file: File | null) => {
    setUploadFile(file);
    setUploadNotice(null);
    setUploadError(null);
    if (file && !uploadTitle.trim()) {
      setUploadTitle(titleFromFileName(file.name));
    }
  };

  const uploadPolicyUpdate = async () => {
    if (!uploadFile) {
      setUploadError("Choose a PDF file to upload.");
      return;
    }
    const looksLikePdf =
      uploadFile.type === "application/pdf" || uploadFile.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      setUploadError("Only PDF uploads are allowed.");
      return;
    }
    if (uploadFile.size > MAX_POLICY_UPDATE_UPLOAD_BYTES) {
      setUploadError("PDF upload must be 25 MB or smaller.");
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);
    setUploadNotice(null);
    setUploadError(null);
    try {
      if (!(await fileHasPdfSignature(uploadFile))) {
        throw new Error("Uploaded file is not a valid PDF.");
      }

      const metadata = {
        title: uploadTitle.trim(),
        category: uploadCategory,
        publishedAt: uploadPublishedAt,
        summary: uploadSummary.trim(),
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        contentType: uploadFile.type || "application/pdf",
      };

      const prepareRes = await fetch("/api/admin/policy-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepareUpload",
          ...metadata,
        }),
      });
      const prepared = (await prepareRes.json().catch(() => ({}))) as UploadPrepareResponse;
      if (!prepareRes.ok || !prepared.upload?.uploadUrl || !prepared.upload?.slug || !prepared.upload?.s3Key) {
        throw new Error(prepared?.error || "Failed to prepare policy update upload.");
      }

      const uploadRes = await fetch(prepared.upload.uploadUrl, {
        method: "PUT",
        headers: prepared.upload.headers || { "Content-Type": "application/pdf" },
        body: uploadFile,
      });
      if (!uploadRes.ok) {
        throw new Error(`Storage upload failed with status ${uploadRes.status}.`);
      }

      const completeRes = await fetch("/api/admin/policy-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "completeUpload",
          slug: prepared.upload.slug,
          s3Key: prepared.upload.s3Key,
          ...(prepared.metadata || metadata),
        }),
      });
      const body = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) throw new Error(body?.error || "Failed to finish policy update upload.");

      const uploadedSlug = body?.update?.slug || "";
      setUploadNotice(`Uploaded draft: ${body?.update?.shortTitle || uploadTitle || uploadFile.name}.`);
      setUploadFile(null);
      setUploadTitle("");
      setUploadSummary("");
      setUploadInputKey((current) => current + 1);
      await loadState();
      if (uploadedSlug) setSelectedSlug(uploadedSlug);
    } catch (err: any) {
      setUploadError(err?.message || "Failed to upload policy update PDF");
    } finally {
      setUploading(false);
    }
  };

  const changeSelectedVisibility = async (action: "publishUpdate" | "unpublishUpdate") => {
    if (!selectedUpdate || selectedUpdate.source !== "uploaded") return;
    const verb = action === "publishUpdate" ? "publish" : "unpublish";
    if (!window.confirm(`${verb === "publish" ? "Publish" : "Unpublish"} "${selectedUpdate.shortTitle || selectedUpdate.title}"?`)) {
      return;
    }

    setVisibilityUpdatingSlug(selectedUpdate.slug);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/policy-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          slug: selectedUpdate.slug,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Failed to ${verb} policy update`);
      await loadState();
      setSelectedSlug(selectedUpdate.slug);
      setConfirmSend(false);
      setUploadNotice(
        action === "publishUpdate"
          ? `Published ${body?.update?.shortTitle || selectedUpdate.shortTitle}.`
          : `Unpublished ${body?.update?.shortTitle || selectedUpdate.shortTitle}.`,
      );
    } catch (err: any) {
      setError(err?.message || `Failed to ${verb} policy update`);
    } finally {
      setVisibilityUpdatingSlug(null);
    }
  };

  const generateSelectedContent = async () => {
    if (!selectedUpdate || selectedUpdate.source !== "uploaded") return;
    if (
      selectedUpdate.generationStatus === "generated" &&
      !window.confirm(`Regenerate page content for "${selectedUpdate.shortTitle || selectedUpdate.title}"?`)
    ) {
      return;
    }

    setGeneratingContentSlug(selectedUpdate.slug);
    setError(null);
    setResult(null);
    setUploadNotice(null);
    try {
      const res = await fetch("/api/admin/policy-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generateContent",
          slug: selectedUpdate.slug,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to generate policy update content");
      await loadState();
      setSelectedSlug(selectedUpdate.slug);
      setUploadNotice(`Generated page content for ${body?.update?.shortTitle || selectedUpdate.shortTitle}.`);
    } catch (err: any) {
      setError(err?.message || "Failed to generate policy update content");
      await loadState();
      setSelectedSlug(selectedUpdate.slug);
    } finally {
      setGeneratingContentSlug(null);
    }
  };

  const sendUpdate = async () => {
    if (!selectedUpdate || !confirmSend || !audienceReady) return;
    if (!selectedCanSendMembers) {
      setError("Publish this update before sending it to subscribers.");
      setConfirmSend(false);
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/policy-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedUpdate.slug,
          confirmSend: true,
          audienceMode,
          recipientIds: audienceMode === "selected_members" ? selectedRecipientIds : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to send policy update");
      setResult(body);
      setConfirmSend(false);
      await loadState();
    } catch (err: any) {
      setError(err?.message || "Failed to send policy update");
    } finally {
      setSending(false);
    }
  };

  const toggleRecipient = (recipientId: string) => {
    setSelectedRecipientIds((current) =>
      current.includes(recipientId)
        ? current.filter((id) => id !== recipientId)
        : [...current, recipientId],
    );
    setConfirmSend(false);
  };

  const selectVisibleRecipients = () => {
    setSelectedRecipientIds((current) => {
      const next = new Set(current);
      for (const recipient of filteredAudienceRecipients) next.add(recipient.id);
      return Array.from(next);
    });
    setConfirmSend(false);
  };

  const clearSelectedRecipients = () => {
    setSelectedRecipientIds([]);
    setConfirmSend(false);
  };

  const sendDraft = async () => {
    if (!selectedUpdate || !draftEmail.trim()) return;
    setDraftSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/policy-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedUpdate.slug,
          confirmSend: true,
          draftRecipientEmail: draftEmail.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to send policy update draft");
      setResult(body);
      await loadState();
    } catch (err: any) {
      setError(err?.message || "Failed to send policy update draft");
    } finally {
      setDraftSending(false);
    }
  };

  const sendPreviousUpdate = async (send: PolicyUpdateSendHistoryItem) => {
    if (audienceMode !== "selected_members" || !selectedRecipientIds.length) {
      setError("Select at least one active subscriber before sending a previous update.");
      return;
    }
    if (
      !window.confirm(
        `Send "${send.shortTitle || send.title || "this previous update"}" to ${selectedRecipientIds.length} selected subscriber${
          selectedRecipientIds.length === 1 ? "" : "s"
        }?`,
      )
    ) {
      return;
    }

    setSendingPrevious((current) => ({ ...current, [send.id]: true }));
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/policy-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: send.updateSlug,
          confirmSend: true,
          audienceMode: "selected_members",
          recipientIds: selectedRecipientIds,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to send previous policy update");
      setResult(body);
      setConfirmSend(false);
      await loadState();
    } catch (err: any) {
      setError(err?.message || "Failed to send previous policy update");
    } finally {
      setSendingPrevious((current) => ({ ...current, [send.id]: false }));
    }
  };

  return (
    <section className="glass-surface p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="section-eyebrow text-[var(--brand-denim)]">Member updates</p>
          <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Policy update email sender</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Send a PGPZ-branded weekly memo or special update to active members with unsuppressed email addresses.
            Nothing sends automatically; this tool sends only after manual confirmation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border bg-white px-4 py-2 text-sm font-semibold text-[var(--brand-ink)]">
            {recipientCount === null ? "Loading recipients" : `${recipientCount} recipients`}
          </div>
          <Button type="button" variant="outline" onClick={loadState} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.42fr_1fr]">
        <div className="rounded-2xl border bg-white/85 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Available updates
          </div>
          <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-denim)]">
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              Upload update PDF
            </div>
            <div className="mt-3 space-y-3">
              <input
                key={uploadInputKey}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => handleUploadFileChange(event.target.files?.[0] || null)}
                className="w-full rounded-md border bg-white px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[var(--brand-ink)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--zcash-gold)]"
              />
              <input
                type="text"
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Update title"
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <select
                  value={uploadCategory}
                  onChange={(event) => setUploadCategory(event.target.value === "special" ? "special" : "weekly")}
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                >
                  <option value="weekly">Weekly memo</option>
                  <option value="special">Featured update</option>
                </select>
                <input
                  type="date"
                  value={uploadPublishedAt}
                  onChange={(event) => setUploadPublishedAt(event.target.value)}
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                />
              </div>
              <textarea
                value={uploadSummary}
                onChange={(event) => setUploadSummary(event.target.value)}
                placeholder="Optional email and page summary"
                rows={3}
                className="w-full resize-y rounded-md border bg-white px-3 py-2 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploading || !uploadFile}
                onClick={uploadPolicyUpdate}
              >
                <UploadCloud className={cn("h-4 w-4", uploading && "animate-pulse")} />
                {uploading ? "Uploading..." : "Upload PDF"}
              </Button>
              {uploadNotice ? <p className="text-xs leading-5 text-emerald-700">{uploadNotice}</p> : null}
              {uploadError ? <p className="text-xs leading-5 text-rose-700">{uploadError}</p> : null}
            </div>
          </div>
          <div className="space-y-2">
            {updates.map((update) => {
              const stats = statsBySlug[update.slug] || emptyStats;
              return (
                <button
                  key={update.slug}
                  type="button"
                  onClick={() => {
                    setSelectedSlug(update.slug);
                    setConfirmSend(false);
                    setResult(null);
                  }}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    selectedUpdate?.slug === update.slug
                      ? "border-[rgba(245,168,0,0.72)] bg-[var(--brand-ice)]"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="flex flex-wrap gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-denim)]">
                        {update.categoryLabel}
                      </span>
                      {update.source === "uploaded" ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-600">
                          Uploaded
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em]",
                          visibilityClassName(update),
                        )}
                      >
                        {visibilityLabel(update)}
                      </span>
                      {update.source === "uploaded" ? (
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em]",
                            generationClassName(update),
                          )}
                        >
                          {generationLabel(update)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-[var(--brand-ink)]">
                      {update.shortTitle}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{update.displayDate}</span>
                    {update.source === "uploaded" && update.fileName ? (
                      <span className="mt-1 block truncate text-xs text-slate-500">{update.fileName}</span>
                    ) : null}
                    <span className="mt-2 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <span>Sent {stats.sent}</span>
                      <span>Drafts {stats.draftSent}</span>
                      {stats.failed ? <span className="text-rose-700">Failed {stats.failed}</span> : null}
                    </span>
                  </span>
                </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border bg-white/90 p-5">
          {selectedUpdate ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex rounded-full bg-[var(--brand-ink)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold)]">
                    {selectedUpdate.categoryLabel}
                  </div>
                  <div
                    className={cn(
                      "mt-2 inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]",
                      visibilityClassName(selectedUpdate),
                    )}
                  >
                    {visibilityLabel(selectedUpdate)}
                  </div>
                  {selectedUpdate.source === "uploaded" ? (
                    <div
                      className={cn(
                        "mt-2 inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]",
                        generationClassName(selectedUpdate),
                      )}
                    >
                      {generationLabel(selectedUpdate)}
                    </div>
                  ) : null}
                  <h3 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">
                    {selectedUpdate.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selectedUpdate.summary}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {selectedUpdate.source === "uploaded" ? (
                    <Button
                      type="button"
                      variant={selectedHasGeneratedContent ? "outline" : "default"}
                      onClick={generateSelectedContent}
                      disabled={generatingContentSlug === selectedUpdate.slug}
                    >
                      <Sparkles className={cn("h-4 w-4", generatingContentSlug === selectedUpdate.slug && "animate-pulse")} />
                      {generatingContentSlug === selectedUpdate.slug
                        ? "Generating..."
                        : selectedHasGeneratedContent
                          ? "Regenerate"
                          : "Generate content"}
                    </Button>
                  ) : null}
                  <Button variant="outline" asChild>
                    <Link href={selectedUpdate.portalPath} target="_blank" rel="noopener noreferrer">
                      Portal view
                    </Link>
                  </Button>
                  {selectedUpdate.source === "uploaded" && selectedVisibilityStatus !== "published" ? (
                    <Button
                      type="button"
                      onClick={() => changeSelectedVisibility("publishUpdate")}
                      disabled={visibilityUpdatingSlug === selectedUpdate.slug}
                    >
                      <CheckCircle2 className={cn("h-4 w-4", visibilityUpdatingSlug === selectedUpdate.slug && "animate-pulse")} />
                      Publish
                    </Button>
                  ) : null}
                  {selectedUpdate.source === "uploaded" && selectedVisibilityStatus === "published" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => changeSelectedVisibility("unpublishUpdate")}
                      disabled={visibilityUpdatingSlug === selectedUpdate.slug}
                    >
                      <EyeOff className={cn("h-4 w-4", visibilityUpdatingSlug === selectedUpdate.slug && "animate-pulse")} />
                      Unpublish
                    </Button>
                  ) : null}
                </div>
              </div>

              {selectedUpdate.source === "uploaded" && !selectedHasGeneratedContent ? (
                <div
                  className={cn(
                    "rounded-xl border px-4 py-3 text-sm leading-6",
                    selectedUpdate.generationStatus === "failed"
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : "border-amber-200 bg-amber-50 text-amber-950",
                  )}
                >
                  {selectedUpdate.generationStatus === "failed" ? (
                    <>
                      <span className="font-semibold">Generation failed.</span>{" "}
                      {selectedUpdate.generationError || "Review the upload and try again."}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">Generate page content before publishing.</span>{" "}
                      Until then, the draft preview uses the basic upload metadata and fallback page copy.
                    </>
                  )}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Email subject</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--brand-ink)]">{selectedUpdate.emailSubject}</div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Portal link</div>
                  <div className="mt-2 truncate text-sm font-medium text-[var(--brand-denim)]">{selectedUpdate.portalPath}</div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <BarChart3 className="h-4 w-4" />
                  Message stats
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  {[
                    ["Member sends", selectedStats.sent.toLocaleString()],
                    ["Draft sends", selectedStats.draftSent.toLocaleString()],
                    ["Failures", selectedStats.failed.toLocaleString()],
                    ["Last sent", formatDateTime(selectedStats.lastSentAt)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border bg-slate-50 p-3">
                      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--brand-ink)]">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Audience</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Send this update to all active subscribers or to selected subscribers only.
                    </p>
                  </div>
                  <div className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-[var(--brand-ink)]">
                    {selectedAudienceLabel}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAudienceMode("all_active_members");
                      setConfirmSend(false);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-3 text-left text-sm transition",
                      audienceMode === "all_active_members"
                        ? "border-[rgba(245,168,0,0.62)] bg-white shadow-sm"
                        : "border-slate-200 bg-white/60 hover:bg-white",
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold text-[var(--brand-ink)]">
                      <Send className="h-4 w-4" />
                      All active members
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Full subscriber distribution.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAudienceMode("selected_members");
                      setConfirmSend(false);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-3 text-left text-sm transition",
                      audienceMode === "selected_members"
                        ? "border-[rgba(245,168,0,0.62)] bg-white shadow-sm"
                        : "border-slate-200 bg-white/60 hover:bg-white",
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold text-[var(--brand-ink)]">
                      <UsersRound className="h-4 w-4" />
                      Selected subscribers
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Useful for newer members or catch-up sends.
                    </span>
                  </button>
                </div>

                {audienceMode === "selected_members" ? (
                  <div className="mt-4 rounded-lg border bg-white p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          value={audienceQuery}
                          onChange={(event) => setAudienceQuery(event.target.value)}
                          placeholder="Search active member name or email"
                          className="w-full rounded-md border bg-white py-2 pl-9 pr-3 text-sm"
                        />
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={selectVisibleRecipients}>
                          Select visible
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={clearSelectedRecipients}>
                          Clear
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 max-h-60 overflow-y-auto rounded-md border">
                      {filteredAudienceRecipients.length ? (
                        filteredAudienceRecipients.map((recipient) => {
                          const checked = selectedRecipientIds.includes(recipient.id);
                          return (
                            <label
                              key={recipient.id}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0",
                                checked ? "bg-[var(--brand-ice)]" : "bg-white hover:bg-slate-50",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4"
                                checked={checked}
                                onChange={() => toggleRecipient(recipient.id)}
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-semibold text-[var(--brand-ink)]">
                                  {recipient.name || recipient.email}
                                </span>
                                <span className="block truncate text-xs text-slate-500">{recipient.email}</span>
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <div className="px-3 py-4 text-sm text-slate-500">No active recipients match that search.</div>
                      )}
                    </div>
                    {selectedRecipients.length ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Selected: {selectedRecipients.map((recipient) => recipient.email).join(", ")}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-amber-700">Select at least one active subscriber before sending.</p>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Draft send</div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="email"
                    value={draftEmail}
                    onChange={(event) => setDraftEmail(event.target.value)}
                    placeholder="member@example.com"
                    className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={draftSending || !draftEmail.trim()}
                    onClick={sendDraft}
                  >
                    {draftSending ? <MailCheck className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                    {draftSending ? "Sending..." : "Send draft"}
                  </Button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Sends only to this address. If the email matches a PGPZ Community profile, the greeting uses that profile name.
                  {selectedCanSendMembers ? "" : " Portal and PDF links require admin access until this update is published."}
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-[rgba(245,168,0,0.32)] bg-[var(--brand-ice)] p-4 text-sm leading-6 text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={confirmSend}
                  onChange={(event) => setConfirmSend(event.target.checked)}
                  disabled={!audienceReady || !selectedCanSendMembers}
                />
                <span>
                  {selectedCanSendMembers
                    ? `I understand this will send the selected update to ${selectedAudienceLabel} with unsuppressed emails. I have reviewed the portal page and email subject.`
                    : "Publish this update before sending it to subscribers."}
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={!confirmSend || sending || !audienceReady || !selectedCanSendMembers}
                  onClick={sendUpdate}
                >
                  {sending ? <MailCheck className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                  {sending
                    ? "Sending..."
                    : audienceMode === "selected_members"
                      ? "Send update to selected"
                      : "Send selected update"}
                </Button>
                <p className="text-xs text-slate-500">
                  Sends are logged per recipient in the email log table.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">No policy updates are configured.</div>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border bg-white/90 p-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--brand-ink)]">Sent update history</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Policy update sends are listed here with delivery totals, engagement stats when tracking was available,
              and a selected-subscriber catch-up send action.
            </p>
            <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {sendHistory.length} send{sendHistory.length === 1 ? "" : "s"}
            </span>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={loadState} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh stats
          </Button>
        </div>
        {loading && !sendHistory.length ? (
          <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">Loading sent updates...</div>
        ) : sendHistory.length ? (
          <div className="space-y-3">
            {sendHistory.map((send) => (
              <PolicyUpdateSendHistoryCard
                key={send.id}
                send={send}
                onSendToSelected={sendPreviousUpdate}
                canSendToSelected={audienceMode === "selected_members" && selectedRecipientIds.length > 0}
                isSendingToSelected={!!sendingPrevious[send.id]}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
            Sent weekly and featured updates will show here after they are distributed to members.
          </div>
        )}
      </div>

      {result ? (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {result.draft
            ? `Sent draft to ${result.recipientEmail || "draft recipient"} for ${result.title}`
            : `Sent ${result.sent} of ${result.recipientCount} emails for ${result.title}`}
          {result.failed ? `; ${result.failed} failed.` : "."}
          {result.draft && result.resolvedRecipientName ? ` Greeting name: ${result.resolvedRecipientName}.` : ""}
        </div>
      ) : null}
      {error ? (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}
    </section>
  );
}
