"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  MailCheck,
  MailPlus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  StickyNote,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { SensitiveDataText } from "@/components/admin/sensitive-data";
import type { AdminMember, AdminRoster } from "@/lib/admin/roster";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  initialRoster: AdminRoster | null;
  currentAdminId?: string | null;
};

type CreateMemberForm = {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  linkedinUrl: string;
  xHandle: string;
  memberDirectoryOptIn: boolean;
  sendInvitation: boolean;
};

const emptyCreateForm: CreateMemberForm = {
  email: "",
  firstName: "",
  lastName: "",
  company: "",
  jobTitle: "",
  linkedinUrl: "",
  xHandle: "",
  memberDirectoryOptIn: true,
  sendInvitation: true,
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const displayName = (member: AdminMember) =>
  member.name || [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || "Unnamed member";

const statusLabel = (member: AdminMember) => {
  if (member.membershipStatus === "active") return "Active";
  if (member.membershipStatus === "invited") return "Invited";
  return "Unapproved";
};

export default function AdminClient({ initialRoster, currentAdminId }: Props) {
  const [roster, setRoster] = useState<AdminRoster | null>(initialRoster);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "invited" | "none" | "manual">("all");
  const [loading, setLoading] = useState(!initialRoster);
  const [error, setError] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState<Record<string, boolean>>({});
  const [approvalLoading, setApprovalLoading] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [notesSaving, setNotesSaving] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateMemberForm>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRoster = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/members?${params.toString()}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load roster");
      setRoster(body);
    } catch (err: any) {
      setError(err?.message || "Failed to load roster");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    setNotesDrafts((current) => {
      const next: Record<string, string> = {};
      for (const member of roster?.members || []) {
        next[member.id] = current[member.id] ?? member.adminNotes ?? "";
      }
      return next;
    });
  }, [roster]);

  const filteredMembers = useMemo(() => {
    const members = (roster?.members || []).filter((member) => member.id !== currentAdminId);
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) => {
      const haystack = [
        member.name,
        member.email,
        member.firstName,
        member.lastName,
        member.company,
        member.jobTitle,
        member.linkedinUrl,
        member.xHandle,
        member.membershipProvider,
        member.manualApprovalStatus,
        member.adminNotes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [currentAdminId, query, roster]);

  const sendEmail = async (member: AdminMember, type: "welcome" | "invitation") => {
    setEmailSending((current) => ({ ...current, [`${member.id}:${type}`]: true }));
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, type }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Failed to send ${type} email`);
      setNotice(`${type === "welcome" ? "Welcome" : "Invitation"} email sent to ${member.email || displayName(member)}.`);
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || `Failed to send ${type} email`);
    } finally {
      setEmailSending((current) => ({ ...current, [`${member.id}:${type}`]: false }));
    }
  };

  const approveManual = async (member: AdminMember) => {
    setApprovalLoading((current) => ({ ...current, [member.id]: true }));
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/members/manual-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to approve manual request");
      setNotice(`Manual approval granted for ${member.email || displayName(member)}.`);
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || "Failed to approve manual request");
    } finally {
      setApprovalLoading((current) => ({ ...current, [member.id]: false }));
    }
  };

  const saveAdminNotes = async (member: AdminMember) => {
    setNotesSaving((current) => ({ ...current, [member.id]: true }));
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.id,
          adminNotes: notesDrafts[member.id] ?? "",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to save admin notes");
      setNotice(`Admin notes saved for ${member.email || displayName(member)}.`);
      setRoster((current) => {
        if (!current) return current;
        return {
          ...current,
          members: current.members.map((item) =>
            item.id === member.id
              ? {
                  ...item,
                  adminNotes: body.adminNotes ?? null,
                  adminNotesUpdatedAt: body.adminNotesUpdatedAt ?? item.adminNotesUpdatedAt,
                  adminNotesUpdatedBy: body.adminNotesUpdatedBy ?? item.adminNotesUpdatedBy,
                }
              : item,
          ),
        };
      });
    } catch (err: any) {
      setError(err?.message || "Failed to save admin notes");
    } finally {
      setNotesSaving((current) => ({ ...current, [member.id]: false }));
    }
  };

  const createMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to add invited member");
      const userId = body?.member?.id;
      if (createForm.sendInvitation && userId) {
        const emailRes = await fetch("/api/admin/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, type: "invitation" }),
        });
        const emailBody = await emailRes.json().catch(() => ({}));
        if (!emailRes.ok) {
          throw new Error(
            `Member was added, but the invitation email failed: ${emailBody?.error || emailRes.statusText}`,
          );
        }
      }
      setNotice(
        createForm.sendInvitation
          ? `Invited ${createForm.email.trim().toLowerCase()} and sent an activation email.`
          : `Added ${createForm.email.trim().toLowerCase()} in invited state.`,
      );
      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || "Failed to add invited member");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["Total", roster?.meta.total ?? 0],
          ["Active", roster?.meta.active ?? 0],
          ["Invited", roster?.meta.invited ?? 0],
          ["Unapproved", roster?.meta.none ?? 0],
          ["Manual pending", roster?.meta.manualPending ?? 0],
          ["Admins", roster?.meta.admins ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-white/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-lg border bg-white/85 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Manual member onboarding</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Add a member in invited state, then send an activation email when ready.
            </p>
          </div>
          <Button type="button" onClick={() => setCreateOpen((open) => !open)}>
            <UserPlus className="h-4 w-4" />
            {createOpen ? "Close form" : "Add member"}
          </Button>
        </div>
        {createOpen ? (
          <form onSubmit={createMember} className="mt-5 grid gap-3">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Email</span>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">First name</span>
                <input
                  required
                  value={createForm.firstName}
                  onChange={(event) => setCreateForm((current) => ({ ...current, firstName: event.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Last name</span>
                <input
                  required
                  value={createForm.lastName}
                  onChange={(event) => setCreateForm((current) => ({ ...current, lastName: event.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Corporate affiliation</span>
                <input
                  required
                  value={createForm.company}
                  onChange={(event) => setCreateForm((current) => ({ ...current, company: event.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Job title</span>
                <input
                  required
                  value={createForm.jobTitle}
                  onChange={(event) => setCreateForm((current) => ({ ...current, jobTitle: event.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">LinkedIn URL</span>
                <input
                  value={createForm.linkedinUrl}
                  onChange={(event) => setCreateForm((current) => ({ ...current, linkedinUrl: event.target.value }))}
                  placeholder="https://www.linkedin.com/in/username"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">X handle</span>
                <input
                  value={createForm.xHandle}
                  onChange={(event) => setCreateForm((current) => ({ ...current, xHandle: event.target.value }))}
                  placeholder="@pgpz"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border bg-white/70 p-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={createForm.memberDirectoryOptIn}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, memberDirectoryOptIn: event.target.checked }))
                  }
                  className="mt-1 h-4 w-4 accent-[var(--zcash-gold)]"
                />
                <span>List this member in the active member directory after activation.</span>
              </label>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={createForm.sendInvitation}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, sendInvitation: event.target.checked }))
                  }
                  className="mt-1 h-4 w-4 accent-[var(--zcash-gold)]"
                />
                <span>Send activation invitation now.</span>
              </label>
            </div>
            <div>
              <Button type="submit" isLoading={creating}>
                <UserPlus className="h-4 w-4" />
                Add invited member
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <div className="rounded-lg border bg-white/85 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, affiliation, title, LinkedIn, X, or notes"
              className="w-full rounded-md border py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["active", "Active"],
              ["invited", "Invited"],
              ["none", "Unapproved"],
              ["manual", "Manual requests"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value as typeof statusFilter)}
                className={cn(
                  "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]",
                  statusFilter === value
                    ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-[var(--zcash-gold)]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400",
                )}
              >
                {label}
              </button>
            ))}
            <Button type="button" variant="outline" onClick={loadRoster} disabled={loading}>
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-white/90">
        <div className="hidden grid-cols-[1.1fr_0.8fr_0.9fr_0.85fr_1.15fr] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:grid">
          <div>Member</div>
          <div>Status</div>
          <div>Affiliation</div>
          <div>Email</div>
          <div>Actions</div>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading roster...</div>
        ) : filteredMembers.length ? (
          <div className="divide-y">
            {filteredMembers.map((member) => {
              const active = member.membershipStatus === "active";
              const invited = member.membershipStatus === "invited";
              const welcomeSent = !!member.welcomeEmailSentAt;
              const inviteSent = !!member.invitationEmailSentAt;
              const manualPending = member.manualApprovalStatus === "pending" && !active;
              const expanded = !!expandedRows[member.id];
              const notesDraft = notesDrafts[member.id] ?? member.adminNotes ?? "";
              const notesChanged = notesDraft.trim() !== (member.adminNotes || "");
              return (
                <div key={member.id} className="text-sm">
                  <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.1fr_0.8fr_0.9fr_0.85fr_1.15fr]">
                    <div className="space-y-1">
                      <div className="font-semibold text-[var(--brand-ink)]">
                        <SensitiveDataText value={displayName(member)} kind="name" />
                      </div>
                      <div className="text-xs text-slate-500">
                        <SensitiveDataText value={member.email || "No email"} kind="email" />
                      </div>
                      {member.linkedinUrl ? (
                        <Link className="text-xs text-[var(--brand-denim)] underline" href={member.linkedinUrl} target="_blank" rel="noopener noreferrer">
                          LinkedIn
                        </Link>
                      ) : null}
                      {member.xHandle ? (
                        <Link
                          className="ml-2 text-xs text-[var(--brand-denim)] underline"
                          href={`https://x.com/${member.xHandle.replace(/^@/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {member.xHandle}
                        </Link>
                      ) : null}
                    </div>
                    <div>
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                        active
                          ? "bg-teal-50 text-[var(--brand-teal)]"
                          : invited
                            ? "bg-[var(--brand-ice)] text-[var(--brand-denim)]"
                            : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]",
                      )}>
                        {active ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {statusLabel(member)}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">{formatDate(member.membershipVerifiedAt)}</div>
                      {manualPending ? (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--zcash-gold-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--zcash-gold-deep)]">
                          <UserCheck className="h-3.5 w-3.5" />
                          Manual requested
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-[var(--brand-ink)]">{member.company || "—"}</div>
                      <div className="text-xs text-slate-500">{member.jobTitle || "—"}</div>
                      {member.memberDirectoryOptIn ? (
                        <div className="text-xs text-[var(--brand-denim)]">Directory opt-in</div>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {active ? (
                        <div
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                            welcomeSent ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          <MailCheck className="h-3.5 w-3.5" />
                          {welcomeSent ? "Welcome sent" : "Welcome pending"}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                            inviteSent ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          <MailCheck className="h-3.5 w-3.5" />
                          {inviteSent ? "Invite sent" : "Invite pending"}
                        </div>
                      )}
                      <div className="text-xs text-slate-500">
                        {active
                          ? welcomeSent
                            ? `Sent ${formatDate(member.welcomeEmailSentAt)}`
                            : "Not sent"
                          : inviteSent
                            ? `Sent ${formatDate(member.invitationEmailSentAt)}`
                            : "Not sent"}
                      </div>
                      {member.emailSuppressed ? (
                        <div className="text-xs text-rose-700">Suppressed</div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {manualPending ? (
                        <Button
                          size="sm"
                          disabled={approvalLoading[member.id]}
                          isLoading={!!approvalLoading[member.id]}
                          onClick={() => approveManual(member)}
                        >
                          <UserCheck className="h-4 w-4" />
                          Approve
                        </Button>
                      ) : null}
                      {active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!member.email}
                          isLoading={!!emailSending[`${member.id}:welcome`]}
                          onClick={() => sendEmail(member, "welcome")}
                        >
                          <MailPlus className="h-4 w-4" />
                          {welcomeSent ? "Resend welcome" : "Send welcome"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!member.email}
                          isLoading={!!emailSending[`${member.id}:invitation`]}
                          onClick={() => sendEmail(member, "invitation")}
                        >
                          <MailPlus className="h-4 w-4" />
                          {inviteSent ? "Resend invite" : "Send invite"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        aria-expanded={expanded}
                        onClick={() => setExpandedRows((current) => ({ ...current, [member.id]: !expanded }))}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Details
                      </Button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="border-t bg-slate-50/70 px-4 py-4">
                      <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.35fr]">
                        <div className="space-y-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Profile details
                          </div>
                          <dl className="space-y-2 text-xs text-slate-600">
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">First name</dt>
                              <dd className="text-right text-slate-800">
                                <SensitiveDataText value={member.firstName || "—"} kind="name" />
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Last name</dt>
                              <dd className="text-right text-slate-800">
                                <SensitiveDataText value={member.lastName || "—"} kind="name" />
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Company</dt>
                              <dd className="text-right text-slate-800">{member.company || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Job title</dt>
                              <dd className="text-right text-slate-800">{member.jobTitle || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">LinkedIn</dt>
                              <dd className="max-w-[14rem] truncate text-right">
                                {member.linkedinUrl ? (
                                  <Link className="text-[var(--brand-denim)] underline" href={member.linkedinUrl} target="_blank" rel="noopener noreferrer">
                                    Open profile
                                  </Link>
                                ) : "—"}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">X handle</dt>
                              <dd className="max-w-[14rem] truncate text-right">
                                {member.xHandle ? (
                                  <Link
                                    className="text-[var(--brand-denim)] underline"
                                    href={`https://x.com/${member.xHandle.replace(/^@/, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {member.xHandle}
                                  </Link>
                                ) : "—"}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <div className="space-y-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Membership state
                          </div>
                          <dl className="space-y-2 text-xs text-slate-600">
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Provider</dt>
                              <dd className="text-right text-slate-800">{member.membershipProvider || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Manual status</dt>
                              <dd className="text-right text-slate-800">{member.manualApprovalStatus}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Manual approved</dt>
                              <dd className="text-right text-slate-800">{formatDate(member.manualApprovalApprovedAt)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Invitation status</dt>
                              <dd className="text-right text-slate-800">{member.invitationStatus || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Invitation accepted</dt>
                              <dd className="text-right text-slate-800">{formatDate(member.invitationAcceptedAt)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Last email</dt>
                              <dd className="text-right text-slate-800">
                                {member.lastEmailType ? `${member.lastEmailType} · ${formatDate(member.lastEmailSentAt)}` : "—"}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              <StickyNote className="h-4 w-4" />
                              Admin notes
                            </div>
                            {member.adminNotesUpdatedAt ? (
                              <div className="text-xs text-slate-500">
                                Updated {formatDate(member.adminNotesUpdatedAt)}
                              </div>
                            ) : null}
                          </div>
                          <textarea
                            value={notesDraft}
                            onChange={(event) =>
                              setNotesDrafts((current) => ({ ...current, [member.id]: event.target.value }))
                            }
                            maxLength={4000}
                            rows={5}
                            aria-label={`Admin notes for ${displayName(member)}`}
                            placeholder="Add internal context for follow-up, eligibility review, or policy engagement notes."
                            className="min-h-28 w-full resize-y rounded-md border bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(47,111,104,0.18)]"
                          />
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-slate-500">{notesDraft.length}/4000</div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!notesChanged || notesSaving[member.id]}
                              isLoading={!!notesSaving[member.id]}
                              onClick={() => saveAdminNotes(member)}
                            >
                              <Save className="h-4 w-4" />
                              Save notes
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-600">No members match this view.</div>
        )}
      </div>
    </div>
  );
}
