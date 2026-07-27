"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSignature,
  Loader2,
  Mail,
  RefreshCw,
  Upload,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type CampaignSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  recipient: string;
  deadlineAt: string;
  status: "draft" | "open" | "closed" | "delivered" | "archived";
  effectiveStatus: "draft" | "open" | "closed" | "delivered" | "archived";
  currentDocument: {
    version: number;
    sha256: string;
    fileName: string;
    fileSize: number;
    changeType: "initial" | "minor" | "material";
    changeSummary: string;
    uploadedAt: string;
  };
  notices: Array<{
    id: string;
    subject: string;
    changeType: string;
    sentAt: string;
    sentCount: number;
    failedCount: number;
  }>;
  signerCount: number;
  currentSignerCount: number;
  reconfirmationCount: number;
};

type Message = {
  tone: "success" | "error" | "warning";
  text: string;
};

const toLocalDateTime = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const defaultDeadline = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(17, 0, 0, 0);
  return toLocalDateTime(date.toISOString());
};

async function responseJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "The letter campaign request failed.");
  }
  return body;
}

function CampaignCard({
  campaign,
  onChanged,
}: {
  campaign: CampaignSummary;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState(campaign.title);
  const [summary, setSummary] = useState(campaign.summary);
  const [recipient, setRecipient] = useState(campaign.recipient);
  const [deadlineAt, setDeadlineAt] = useState(
    toLocalDateTime(campaign.deadlineAt),
  );
  const [status, setStatus] = useState(campaign.status);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [revisionType, setRevisionType] = useState<"minor" | "material">(
    "minor",
  );
  const [changeSummary, setChangeSummary] = useState("");
  const [noticeSubject, setNoticeSubject] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeType, setNoticeType] = useState<
    "status" | "minor" | "material" | "delivered"
  >("status");
  const [attachLatest, setAttachLatest] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  async function saveSettings() {
    setBusy("settings");
    setMessage(null);
    try {
      await responseJson(
        await fetch("/api/admin/letter-campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            campaignId: campaign.id,
            title,
            summary,
            recipient,
            deadlineAt: new Date(deadlineAt).toISOString(),
            status,
          }),
        }),
      );
      setMessage({ tone: "success", text: "Campaign settings saved." });
      await onChanged();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Save failed.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function uploadRevision(event: React.FormEvent) {
    event.preventDefault();
    if (!revisionFile) return;
    setBusy("revision");
    setMessage(null);
    const form = new FormData();
    form.set("action", "revision");
    form.set("campaignId", campaign.id);
    form.set("changeType", revisionType);
    form.set("changeSummary", changeSummary);
    form.set("file", revisionFile);
    try {
      await responseJson(
        await fetch("/api/admin/letter-campaigns", {
          method: "POST",
          body: form,
        }),
      );
      setRevisionFile(null);
      setChangeSummary("");
      setNoticeType(revisionType);
      setNoticeSubject(
        revisionType === "material"
          ? `Action required: review the revised ${campaign.title}`
          : `A minor revision was made to ${campaign.title}`,
      );
      setAttachLatest(true);
      setMessage({
        tone: revisionType === "material" ? "warning" : "success",
        text:
          revisionType === "material"
            ? "Material revision uploaded. Existing signers are no longer current; send the reconfirmation notice next."
            : "Minor revision uploaded. Send a change notice to the signers next.",
      });
      await onChanged();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Revision upload failed.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function sendNotice(event: React.FormEvent) {
    event.preventDefault();
    if (
      !window.confirm(
        `Send this update to ${campaign.signerCount} signer${campaign.signerCount === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    setBusy("notice");
    setMessage(null);
    try {
      const result = await responseJson(
        await fetch("/api/admin/letter-campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sendNotice",
            campaignId: campaign.id,
            noticeId: crypto.randomUUID(),
            subject: noticeSubject,
            message: noticeMessage,
            changeType: noticeType,
            attachLatestDocument: attachLatest,
          }),
        }),
      );
      setNoticeSubject("");
      setNoticeMessage("");
      setMessage({
        tone: result.failedCount ? "warning" : "success",
        text: `${result.sentCount} update email${result.sentCount === 1 ? "" : "s"} sent${result.failedCount ? `; ${result.failedCount} failed` : ""}.`,
      });
      await onChanged();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Notice delivery failed.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--brand-ink)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--zcash-gold)]">
              {campaign.effectiveStatus}
            </span>
            <span className="text-xs text-slate-500">
              PDF v{campaign.currentDocument.version} ·{" "}
              {campaign.currentDocument.changeType}
            </span>
          </div>
          <h3 className="mt-3 text-xl font-semibold text-[var(--brand-ink)]">
            {campaign.title}
          </h3>
          <p className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <UsersRound className="h-4 w-4" aria-hidden="true" />
              {campaign.currentSignerCount} current / {campaign.signerCount} total
            </span>
            {campaign.reconfirmationCount ? (
              <span className="font-semibold text-amber-700">
                {campaign.reconfirmationCount} need reconfirmation
              </span>
            ) : null}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/letters/${campaign.slug}`} target="_blank">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
            Member view
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/admin/letter-campaigns?campaignId=${encodeURIComponent(campaign.id)}&format=csv`}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export signers
          </a>
        </Button>
      </div>

      {message ? (
        <div
          className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : message.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {message.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden="true" />
          )}
          {message.text}
        </div>
      ) : null}

      <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--brand-ink)]">
          Campaign settings
        </summary>
        <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Title
            <Input
              className="mt-1.5"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Summary
            <Textarea
              className="mt-1.5 min-h-24"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Addressed to
            <Input
              className="mt-1.5"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Deadline
            <Input
              type="datetime-local"
              className="mt-1.5"
              value={deadlineAt}
              onChange={(event) => setDeadlineAt(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as CampaignSummary["status"])
              }
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="delivered">Delivered</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <Button
            type="button"
            onClick={saveSettings}
            disabled={busy !== null}
            className="sm:col-span-2 sm:w-fit"
          >
            {busy === "settings" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Save settings
          </Button>
        </div>
      </details>

      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--brand-ink)]">
          Upload a revised PDF
        </summary>
        <form
          onSubmit={uploadRevision}
          className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2"
        >
          <label className="text-sm font-medium text-slate-700">
            Change classification
            <select
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={revisionType}
              onChange={(event) =>
                setRevisionType(event.target.value as "minor" | "material")
              }
            >
              <option value="minor">
                Minor — existing sign-ons remain current
              </option>
              <option value="material">
                Material — reconfirmation required
              </option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Revised PDF
            <Input
              type="file"
              accept="application/pdf,.pdf"
              className="mt-1.5"
              onChange={(event) =>
                setRevisionFile(event.target.files?.[0] || null)
              }
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            What changed
            <Textarea
              className="mt-1.5 min-h-24"
              value={changeSummary}
              onChange={(event) => setChangeSummary(event.target.value)}
              required
            />
          </label>
          <Button
            type="submit"
            disabled={busy !== null || !revisionFile}
            className="sm:col-span-2 sm:w-fit"
          >
            {busy === "revision" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Upload version {campaign.currentDocument.version + 1}
          </Button>
        </form>
      </details>

      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--brand-ink)]">
          Email the signers
        </summary>
        <form
          onSubmit={sendNotice}
          className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2"
        >
          <label className="text-sm font-medium text-slate-700">
            Update type
            <select
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={noticeType}
              onChange={(event) =>
                setNoticeType(
                  event.target.value as
                    | "status"
                    | "minor"
                    | "material"
                    | "delivered",
                )
              }
            >
              <option value="status">Status update</option>
              <option value="minor">Minor document change</option>
              <option value="material">
                Material change / reconfirmation
              </option>
              <option value="delivered">Letter delivered</option>
            </select>
          </label>
          <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={attachLatest || noticeType === "minor" || noticeType === "material"}
              disabled={noticeType === "minor" || noticeType === "material"}
              onChange={(event) => setAttachLatest(event.target.checked)}
            />
            Attach the current PDF
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Subject
            <Input
              className="mt-1.5"
              value={noticeSubject}
              onChange={(event) => setNoticeSubject(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Message
            <Textarea
              className="mt-1.5 min-h-28"
              value={noticeMessage}
              onChange={(event) => setNoticeMessage(event.target.value)}
              required
            />
          </label>
          <Button
            type="submit"
            disabled={busy !== null || !campaign.signerCount}
            className="sm:col-span-2 sm:w-fit"
          >
            {busy === "notice" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Send to {campaign.signerCount} signer
            {campaign.signerCount === 1 ? "" : "s"}
          </Button>
        </form>
      </details>

      {campaign.notices.length ? (
        <div className="mt-4 text-xs leading-5 text-slate-500">
          Last update:{" "}
          {campaign.notices[campaign.notices.length - 1]?.subject} ·{" "}
          {campaign.notices[campaign.notices.length - 1]?.sentCount} sent
        </div>
      ) : null}
    </article>
  );
}

export function LetterCampaignPanel() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [recipient, setRecipient] = useState("");
  const [deadlineAt, setDeadlineAt] = useState(defaultDeadline);
  const [status, setStatus] = useState<"draft" | "open">("draft");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await responseJson(
        await fetch("/api/admin/letter-campaigns", { cache: "no-store" }),
      );
      setCampaigns(body.campaigns.filter(Boolean));
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Campaigns could not load.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          campaign.effectiveStatus === "open" ||
          campaign.status === "draft",
      ).length,
    [campaigns],
  );

  async function createCampaign(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setCreating(true);
    setMessage(null);
    const form = new FormData();
    form.set("action", "create");
    form.set("title", title);
    form.set("slug", slug);
    form.set("summary", summary);
    form.set("recipient", recipient);
    form.set("deadlineAt", new Date(deadlineAt).toISOString());
    form.set("status", status);
    form.set("file", file);
    try {
      await responseJson(
        await fetch("/api/admin/letter-campaigns", {
          method: "POST",
          body: form,
        }),
      );
      setTitle("");
      setSlug("");
      setSummary("");
      setRecipient("");
      setDeadlineAt(defaultDeadline());
      setStatus("draft");
      setFile(null);
      setMessage({
        tone: "success",
        text: "Letter campaign created. Review it in draft before opening sign-ons.",
      });
      await load();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Campaign creation failed.",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-denim)]">
              Coalition campaigns
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">
              Letter review and sign-ons
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Publish an immutable PDF draft, enforce its deadline, collect
              individual or organization sign-ons, and notify signers about
              revisions or delivery.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {activeCount} active or draft
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {message ? (
        <div
          className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : message.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {message.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden="true" />
          )}
          {message.text}
        </div>
      ) : null}

      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer items-center gap-3 px-5 py-4 text-sm font-semibold text-[var(--brand-ink)]">
          <FileSignature className="h-5 w-5" aria-hidden="true" />
          Create a letter campaign
        </summary>
        <form
          onSubmit={createCampaign}
          className="grid gap-4 border-t border-slate-200 p-5 sm:grid-cols-2"
        >
          <label className="text-sm font-medium text-slate-700">
            Letter title
            <Input
              className="mt-1.5"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            URL slug
            <Input
              className="mt-1.5"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="clarity-act-zcash-letter"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Member-facing summary
            <Textarea
              className="mt-1.5 min-h-24"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Addressed to
            <Input
              className="mt-1.5"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="Senate leadership, agency officials, or other recipients"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sign-on deadline
            <Input
              type="datetime-local"
              className="mt-1.5"
              value={deadlineAt}
              onChange={(event) => setDeadlineAt(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Initial status
            <select
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "draft" | "open")
              }
            >
              <option value="draft">Draft — admin preview only</option>
              <option value="open">Open — members can sign immediately</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Exact PDF to review and sign
            <Input
              type="file"
              accept="application/pdf,.pdf"
              className="mt-1.5"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              required
            />
          </label>
          <Button
            type="submit"
            className="sm:col-span-2 sm:w-fit"
            disabled={creating || !file}
          >
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Create campaign
          </Button>
        </form>
      </details>

      {loading && !campaigns.length ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Loading campaigns…
        </div>
      ) : campaigns.length ? (
        <div className="space-y-5">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onChanged={load}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No letter campaigns have been created.
        </div>
      )}
    </section>
  );
}
