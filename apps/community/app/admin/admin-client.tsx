"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Ban,
  ChevronDown,
  ChevronRight,
  MailCheck,
  MailPlus,
  PowerOff,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  StickyNote,
  Trash2,
  UserCheck,
} from "lucide-react";
import { SensitiveDataText, useAdminSensitiveData } from "@/components/admin/sensitive-data";
import type { AdminMember, AdminRoster } from "@/lib/admin/roster";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  initialRoster: AdminRoster | null;
  currentAdminId?: string | null;
};

type SortKey = "firstName" | "lastName" | "joinedAt";
type SortDirection = "asc" | "desc";
type ProfileDraft = {
  firstName: string;
  lastName: string;
  xHandle: string;
  linkedinUrl: string;
};

const profileInputClass =
  "w-full rounded-md border bg-white px-3 py-2 text-sm leading-5 text-slate-800 outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(31,76,111,0.18)]";

const profileDraftFromMember = (member: AdminMember): ProfileDraft => ({
  firstName: member.firstName || "",
  lastName: member.lastName || "",
  xHandle: member.xHandle || "",
  linkedinUrl: member.linkedinUrl || "",
});

const normalizeProfileDraft = (draft: ProfileDraft): ProfileDraft => ({
  firstName: draft.firstName.trim(),
  lastName: draft.lastName.trim(),
  xHandle: draft.xHandle.trim(),
  linkedinUrl: draft.linkedinUrl.trim(),
});

const profileDraftChanged = (draft: ProfileDraft, member: AdminMember) => {
  const normalized = normalizeProfileDraft(draft);
  const current = profileDraftFromMember(member);
  return (
    normalized.firstName !== current.firstName ||
    normalized.lastName !== current.lastName ||
    normalized.xHandle !== current.xHandle ||
    normalized.linkedinUrl !== current.linkedinUrl
  );
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

const displayName = (member: AdminMember) =>
  member.name || [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || "Unnamed member";

const memberActionTarget = (member: AdminMember) => member.email || member.id;

const memberActionConfirmationPhrase = (member: AdminMember, verb: "OPT OUT" | "DEACTIVATE" | "DELETE") =>
  verb === "DEACTIVATE" ? "DEACTIVATE" : `${verb} ${memberActionTarget(member)}`;

const promptForMemberAction = (member: AdminMember, verb: "OPT OUT" | "DEACTIVATE" | "DELETE") => {
  const phrase = memberActionConfirmationPhrase(member, verb);
  const entered = window.prompt(`Type ${phrase} to continue.`);
  return entered === phrase ? phrase : null;
};

const memberNeedsAction = (member: AdminMember) => {
  if (member.accountStatus === "deactivated") return false;
  const active = member.membershipStatus === "active";
  return (member.manualApprovalStatus === "pending" && !active) ||
    (active && !member.welcomeEmailSentAt && !!member.email && !member.emailSuppressed);
};

const compareText = (a: string | null, b: string | null, direction: SortDirection = "asc") => {
  const aText = (a || "").trim();
  const bText = (b || "").trim();
  if (aText && !bText) return -1;
  if (!aText && bText) return 1;
  const compare = aText.localeCompare(bText, undefined, { sensitivity: "base" });
  return direction === "desc" ? -compare : compare;
};

const compareJoinedAt = (a: string | null, b: string | null, direction: SortDirection = "asc") => {
  const aTime = a ? Date.parse(a) : NaN;
  const bTime = b ? Date.parse(b) : NaN;
  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);
  if (aValid && !bValid) return -1;
  if (!aValid && bValid) return 1;
  if (!aValid && !bValid) return 0;
  const compare = aTime - bTime;
  return direction === "desc" ? -compare : compare;
};

export default function AdminClient({ initialRoster, currentAdminId }: Props) {
  const { sensitiveDataVisible } = useAdminSensitiveData();
  const [roster, setRoster] = useState<AdminRoster | null>(initialRoster);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "none" | "manual">("all");
  const [loading, setLoading] = useState(!initialRoster);
  const [error, setError] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState<Record<string, boolean>>({});
  const [approvalLoading, setApprovalLoading] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [profileDrafts, setProfileDrafts] = useState<Record<string, ProfileDraft>>({});
  const [profileSaving, setProfileSaving] = useState<Record<string, boolean>>({});
  const [memberActionLoading, setMemberActionLoading] = useState<Record<string, boolean>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [notesSaving, setNotesSaving] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>("lastName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [actionsFirst, setActionsFirst] = useState(false);
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

  useEffect(() => {
    setProfileDrafts((current) => {
      const next: Record<string, ProfileDraft> = {};
      for (const member of roster?.members || []) {
        next[member.id] = current[member.id] ?? profileDraftFromMember(member);
      }
      return next;
    });
  }, [roster]);

  const filteredMembers = useMemo(() => {
    let members = (roster?.members || []).filter((member) => member.id !== currentAdminId);
    const normalized = query.trim().toLowerCase();
    if (normalized) {
      members = members.filter((member) => {
        const haystack = [
          member.name,
          member.email,
          member.firstName,
          member.lastName,
          member.xHandle,
          member.linkedinUrl,
          member.membershipProofPostUrl,
          member.membershipProvider,
          member.manualApprovalStatus,
          member.accountStatus,
          member.emailSuppressedReason,
          member.emailBounceReason,
          member.adminNotes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      });
    }

    return [...members].sort((a, b) => {
      if (actionsFirst) {
        const actionCompare = Number(memberNeedsAction(b)) - Number(memberNeedsAction(a));
        if (actionCompare) return actionCompare;
      }

      let compare = 0;
      if (sortKey === "joinedAt") {
        compare = compareJoinedAt(a.joinedAt, b.joinedAt, sortDirection);
      } else if (sortKey === "firstName") {
        compare = compareText(a.firstName || a.name || a.email, b.firstName || b.name || b.email, sortDirection);
      } else {
        compare = compareText(a.lastName || a.name || a.email, b.lastName || b.name || b.email, sortDirection);
      }

      return compare || compareText(a.lastName || a.name || a.email, b.lastName || b.name || b.email);
    });
  }, [actionsFirst, currentAdminId, query, roster, sortDirection, sortKey]);

  const actionNeededCount = useMemo(
    () => (roster?.members || []).filter((member) => member.id !== currentAdminId && memberNeedsAction(member)).length,
    [currentAdminId, roster],
  );

  const sendWelcome = async (member: AdminMember) => {
    setEmailSending((current) => ({ ...current, [member.id]: true }));
    setNotice(null);
    try {
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, type: "welcome" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to send welcome email");
      setNotice(`Welcome email sent to ${member.email || displayName(member)}.`);
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || "Failed to send welcome email");
    } finally {
      setEmailSending((current) => ({ ...current, [member.id]: false }));
    }
  };

  const approveManual = async (member: AdminMember) => {
    setApprovalLoading((current) => ({ ...current, [member.id]: true }));
    setNotice(null);
    try {
      const res = await fetch("/api/admin/members/manual-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to approve member manually");
      setNotice(`Manual approval granted for ${member.email || displayName(member)}.`);
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || "Failed to approve member manually");
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

  const saveMemberProfile = async (member: AdminMember) => {
    const draft = profileDrafts[member.id] ?? profileDraftFromMember(member);
    const normalized = normalizeProfileDraft(draft);
    setProfileSaving((current) => ({ ...current, [member.id]: true }));
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.id,
          profile: normalized,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to save member profile");
      setNotice(`Profile saved for ${member.email || displayName(member)}.`);
      const savedDraft = {
        firstName: body.firstName || "",
        lastName: body.lastName || "",
        xHandle: body.xHandle || "",
        linkedinUrl: body.linkedinUrl || "",
      };
      setProfileDrafts((current) => ({ ...current, [member.id]: savedDraft }));
      setRoster((current) => {
        if (!current) return current;
        return {
          ...current,
          members: current.members.map((item) =>
            item.id === member.id
              ? {
                  ...item,
                  name: body.name ?? `${savedDraft.firstName} ${savedDraft.lastName}`.trim(),
                  firstName: body.firstName ?? null,
                  lastName: body.lastName ?? null,
                  xHandle: body.xHandle ?? null,
                  linkedinUrl: body.linkedinUrl ?? null,
                }
              : item,
          ),
        };
      });
    } catch (err: any) {
      setError(err?.message || "Failed to save member profile");
    } finally {
      setProfileSaving((current) => ({ ...current, [member.id]: false }));
    }
  };

  const optOutMemberEmail = async (member: AdminMember) => {
    const confirmation = promptForMemberAction(member, "OPT OUT");
    if (!confirmation) return;

    const actionKey = `${member.id}:email_opt_out`;
    setMemberActionLoading((current) => ({ ...current, [actionKey]: true }));
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, action: "email_opt_out", confirmation }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to turn off email");
      setNotice(`Email turned off for ${member.email || displayName(member)}.`);
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || "Failed to turn off email");
    } finally {
      setMemberActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  };

  const deactivateMember = async (member: AdminMember) => {
    const confirmation = promptForMemberAction(member, "DEACTIVATE");
    if (!confirmation) return;

    const actionKey = `${member.id}:deactivate`;
    setMemberActionLoading((current) => ({ ...current, [actionKey]: true }));
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, action: "deactivate", confirmation }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to deactivate user");
      setNotice(`User deactivated for ${member.email || displayName(member)}.`);
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || "Failed to deactivate user");
    } finally {
      setMemberActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  };

  const deleteMember = async (member: AdminMember) => {
    const confirmation = promptForMemberAction(member, "DELETE");
    if (!confirmation) return;

    const actionKey = `${member.id}:delete`;
    setMemberActionLoading((current) => ({ ...current, [actionKey]: true }));
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, confirmation }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to delete user");
      setNotice(`Deleted ${member.email || displayName(member)}.`);
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || "Failed to delete user");
    } finally {
      setMemberActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ["Total", roster?.meta.total ?? 0],
          ["Active", roster?.meta.active ?? 0],
          ["Unverified", roster?.meta.none ?? 0],
          ["Manual pending", roster?.meta.manualPending ?? 0],
          ["Admins", roster?.meta.admins ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-white/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white/85 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, X handle, proof URL, or notes"
              className="w-full rounded-md border py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["active", "Active"],
              ["none", "Unverified"],
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            Sort
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="bg-transparent normal-case tracking-normal text-slate-800 outline-none"
            >
              <option value="lastName">Last name</option>
              <option value="firstName">First name</option>
              <option value="joinedAt">Date joined</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            Order
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as SortDirection)}
              className="bg-transparent normal-case tracking-normal text-slate-800 outline-none"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            <input
              type="checkbox"
              checked={actionsFirst}
              onChange={(event) => setActionsFirst(event.target.checked)}
              className="h-4 w-4 accent-[var(--zcash-gold)]"
            />
            Actions first ({actionNeededCount})
          </label>
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
        <div className="hidden grid-cols-[1.05fr_0.75fr_0.85fr_0.75fr_0.85fr_1fr] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:grid">
          <div>Member</div>
          <div>Status</div>
          <div>Verification</div>
          <div>Joined</div>
          <div>Welcome</div>
          <div>Actions</div>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading roster...</div>
        ) : filteredMembers.length ? (
          <div className="divide-y">
            {filteredMembers.map((member) => {
              const deactivated = member.accountStatus === "deactivated";
              const active = member.membershipStatus === "active";
              const welcomeSent = !!member.welcomeEmailSentAt;
              const manualPending = member.manualApprovalStatus === "pending" && !active && !deactivated;
              const manualApproved = member.membershipProvider === "manual" || member.manualApprovalStatus === "approved";
              const expanded = !!expandedRows[member.id];
              const profileDraft = profileDrafts[member.id] ?? profileDraftFromMember(member);
              const profileChanged = profileDraftChanged(profileDraft, member);
              const notesDraft = notesDrafts[member.id] ?? member.adminNotes ?? "";
              const notesChanged = notesDraft.trim() !== (member.adminNotes || "");
              return (
                <div
                  key={member.id}
                  className="text-sm"
                >
                  <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.05fr_0.75fr_0.85fr_0.75fr_0.85fr_1fr]">
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
                    </div>
                    <div>
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                        deactivated
                          ? "bg-slate-100 text-slate-600"
                          : active
                            ? "bg-teal-50 text-[var(--brand-teal)]"
                            : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]",
                      )}>
                        {active && !deactivated ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {deactivated ? "Deactivated" : active ? "Active" : "Unverified"}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">
                        {deactivated ? formatDate(member.deactivatedAt) : formatDate(member.membershipVerifiedAt)}
                      </div>
                      {manualPending ? (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--zcash-gold-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--zcash-gold-deep)]">
                          <UserCheck className="h-3.5 w-3.5" />
                          Manual requested
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium">
                        {manualApproved ? "Manual approval" : member.xHandle || "—"}
                      </div>
                      {member.membershipProofPostUrl ? (
                        <Link className="text-xs text-[var(--brand-denim)] underline" href={member.membershipProofPostUrl} target="_blank" rel="noopener noreferrer">
                          Proof post
                        </Link>
                      ) : null}
                      {manualPending && member.manualApprovalRequestedAt ? (
                        <div className="text-xs text-slate-500">
                          Requested {formatDate(member.manualApprovalRequestedAt)}
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-[var(--brand-ink)]">{formatDateTime(member.joinedAt)}</div>
                      <div className="text-xs text-slate-500">Joined</div>
                    </div>
                    <div className="space-y-2">
                      {welcomeSent ? (
                        <>
                          <div
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
                            title={`Welcome email sent ${formatDate(member.welcomeEmailSentAt)}`}
                          >
                            <MailCheck className="h-3.5 w-3.5" />
                            Welcome sent
                          </div>
                          <div className="text-xs text-slate-500">
                            Sent {formatDate(member.welcomeEmailSentAt)}
                          </div>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={emailSending[member.id] || !member.email || deactivated}
                          isLoading={!!emailSending[member.id]}
                          onClick={() => sendWelcome(member)}
                        >
                          <MailPlus className="h-4 w-4" />
                          Send welcome
                        </Button>
                      )}
                      {member.emailSuppressed ? (
                        <div className="text-xs text-rose-700">Suppressed</div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!active ? (
                        <Button
                          size="sm"
                          disabled={approvalLoading[member.id] || deactivated}
                          isLoading={!!approvalLoading[member.id]}
                          onClick={() => approveManual(member)}
                        >
                          <UserCheck className="h-4 w-4" />
                          Approve manually
                        </Button>
                      ) : null}
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
                      <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1fr_1.35fr]">
                        <div className="space-y-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Profile details
                          </div>
                          <div className="grid gap-3">
                            <label className="space-y-1 text-xs text-slate-600">
                              <span className="font-medium text-slate-500">First name</span>
                              <input
                                value={profileDraft.firstName}
                                onChange={(event) =>
                                  setProfileDrafts((current) => ({
                                    ...current,
                                    [member.id]: { ...profileDraft, firstName: event.target.value },
                                  }))
                                }
                                className={cn(profileInputClass, !sensitiveDataVisible && "blur-[0.12rem]")}
                              />
                            </label>
                            <label className="space-y-1 text-xs text-slate-600">
                              <span className="font-medium text-slate-500">Last name</span>
                              <input
                                value={profileDraft.lastName}
                                onChange={(event) =>
                                  setProfileDrafts((current) => ({
                                    ...current,
                                    [member.id]: { ...profileDraft, lastName: event.target.value },
                                  }))
                                }
                                className={cn(profileInputClass, !sensitiveDataVisible && "blur-[0.12rem]")}
                              />
                            </label>
                            <label className="space-y-1 text-xs text-slate-600">
                              <span className="font-medium text-slate-500">X handle</span>
                              <input
                                value={profileDraft.xHandle}
                                onChange={(event) =>
                                  setProfileDrafts((current) => ({
                                    ...current,
                                    [member.id]: { ...profileDraft, xHandle: event.target.value },
                                  }))
                                }
                                placeholder="@handle"
                                className={profileInputClass}
                              />
                            </label>
                            <label className="space-y-1 text-xs text-slate-600">
                              <span className="font-medium text-slate-500">LinkedIn URL</span>
                              <input
                                value={profileDraft.linkedinUrl}
                                onChange={(event) =>
                                  setProfileDrafts((current) => ({
                                    ...current,
                                    [member.id]: { ...profileDraft, linkedinUrl: event.target.value },
                                  }))
                                }
                                placeholder="https://www.linkedin.com/in/username"
                                className={profileInputClass}
                              />
                            </label>
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!profileChanged || profileSaving[member.id]}
                                isLoading={!!profileSaving[member.id]}
                                onClick={() => saveMemberProfile(member)}
                              >
                                <Save className="h-4 w-4" />
                                Save profile
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Membership evidence
                          </div>
                          <dl className="space-y-2 text-xs text-slate-600">
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Account</dt>
                              <dd className="text-right text-slate-800">{deactivated ? "Deactivated" : "Active"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Provider</dt>
                              <dd className="text-right text-slate-800">{member.membershipProvider || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Joined</dt>
                              <dd className="text-right text-slate-800">{formatDateTime(member.joinedAt)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Proof post ID</dt>
                              <dd className="max-w-[14rem] truncate text-right text-slate-800">{member.membershipProofPostId || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Retention</dt>
                              <dd className="text-right text-slate-800">{member.proofRetentionPolicy || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Manual approved</dt>
                              <dd className="text-right text-slate-800">{formatDate(member.manualApprovalApprovedAt)}</dd>
                            </div>
                          </dl>
                          <div className="rounded-md border border-rose-200 bg-white p-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
                              Account controls
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={deactivated || member.isAdmin || memberActionLoading[`${member.id}:deactivate`]}
                                isLoading={!!memberActionLoading[`${member.id}:deactivate`]}
                                onClick={() => deactivateMember(member)}
                              >
                                <PowerOff className="h-4 w-4" />
                                Deactivate
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!deactivated || member.isAdmin || memberActionLoading[`${member.id}:delete`]}
                                isLoading={!!memberActionLoading[`${member.id}:delete`]}
                                onClick={() => deleteMember(member)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete user
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Email delivery
                          </div>
                          <dl className="space-y-2 text-xs text-slate-600">
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Status</dt>
                              <dd className="text-right text-slate-800">
                                {member.emailSuppressed ? "Opted out" : "Enabled"}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Last email</dt>
                              <dd className="text-right text-slate-800">
                                {member.lastEmailType ? `${member.lastEmailType} · ${formatDate(member.lastEmailSentAt)}` : "—"}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Welcome</dt>
                              <dd className="text-right text-slate-800">{formatDate(member.welcomeEmailSentAt)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Bounce</dt>
                              <dd className="max-w-[14rem] truncate text-right text-slate-800">{member.emailBounceReason || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Opt-out date</dt>
                              <dd className="text-right text-slate-800">{formatDate(member.emailSuppressedAt)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-500">Opt-out reason</dt>
                              <dd className="max-w-[14rem] truncate text-right text-slate-800">{member.emailSuppressedReason || "—"}</dd>
                            </div>
                          </dl>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              !!member.emailSuppressed ||
                              !member.email ||
                              memberActionLoading[`${member.id}:email_opt_out`]
                            }
                            isLoading={!!memberActionLoading[`${member.id}:email_opt_out`]}
                            onClick={() => optOutMemberEmail(member)}
                          >
                            <Ban className="h-4 w-4" />
                            Turn off email
                          </Button>
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
                            className="min-h-28 w-full resize-y rounded-md border bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(31,76,111,0.18)]"
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
