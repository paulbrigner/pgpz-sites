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
  UserPlus,
} from "lucide-react";
import { SensitiveDataText, useAdminSensitiveData } from "@/components/admin/sensitive-data";
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

type InvitationTemplateState = {
  subject: string;
  body: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
};

type SortKey = "firstName" | "lastName" | "company" | "joinedAt";
type SortDirection = "asc" | "desc";
type ProfileDraft = {
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  linkedinUrl: string;
  xHandle: string;
  memberDirectoryOptIn: boolean;
};

const profileInputClass =
  "w-full rounded-md border bg-white px-3 py-2 text-sm leading-5 text-slate-800 outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(47,111,104,0.18)]";

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

const profileDraftFromMember = (member: AdminMember): ProfileDraft => ({
  firstName: member.firstName || "",
  lastName: member.lastName || "",
  company: member.company || "",
  jobTitle: member.jobTitle || "",
  linkedinUrl: member.linkedinUrl || "",
  xHandle: member.xHandle || "",
  memberDirectoryOptIn: member.memberDirectoryOptIn,
});

const normalizeProfileDraft = (draft: ProfileDraft): ProfileDraft => ({
  firstName: draft.firstName.trim(),
  lastName: draft.lastName.trim(),
  company: draft.company.trim(),
  jobTitle: draft.jobTitle.trim(),
  linkedinUrl: draft.linkedinUrl.trim(),
  xHandle: draft.xHandle.trim(),
  memberDirectoryOptIn: draft.memberDirectoryOptIn,
});

const profileDraftChanged = (draft: ProfileDraft, member: AdminMember) => {
  const normalized = normalizeProfileDraft(draft);
  const current = profileDraftFromMember(member);
  return (
    normalized.firstName !== current.firstName ||
    normalized.lastName !== current.lastName ||
    normalized.company !== current.company ||
    normalized.jobTitle !== current.jobTitle ||
    normalized.linkedinUrl !== current.linkedinUrl ||
    normalized.xHandle !== current.xHandle ||
    normalized.memberDirectoryOptIn !== current.memberDirectoryOptIn
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

const statusLabel = (member: AdminMember) => {
  if (member.accountStatus === "deactivated") return "Deactivated";
  if (member.membershipStatus === "active") return "Active";
  if (member.membershipStatus === "invited") return "Invited";
  return "Unapproved";
};

const memberNeedsAction = (member: AdminMember) => {
  if (member.accountStatus === "deactivated") return false;
  const active = member.membershipStatus === "active";
  if (member.manualApprovalStatus === "pending" && !active) return true;
  if (active && !member.welcomeEmailSentAt && !!member.email && !member.emailSuppressed) return true;
  return !active && member.manualApprovalStatus !== "pending" && !!member.email && !member.emailSuppressed && !member.invitationEmailSentAt;
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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "invited" | "none" | "manual">("all");
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateMemberForm>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [invitationTemplate, setInvitationTemplate] = useState<InvitationTemplateState | null>(null);
  const [templateDraft, setTemplateDraft] = useState({ subject: "", body: "" });
  const [templateLoading, setTemplateLoading] = useState(true);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateDraftEmail, setTemplateDraftEmail] = useState("");
  const [templateDraftSending, setTemplateDraftSending] = useState(false);
  const [bulkInviting, setBulkInviting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("lastName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [actionsFirst, setActionsFirst] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadInvitationTemplate = async () => {
    setTemplateLoading(true);
    try {
      const res = await fetch("/api/admin/email-templates/invitation", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load invitation template");
      setInvitationTemplate(body);
      setTemplateDraft({
        subject: body.subject || "",
        body: body.body || "",
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load invitation template");
    } finally {
      setTemplateLoading(false);
    }
  };

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
    void loadInvitationTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          member.company,
          member.jobTitle,
          member.linkedinUrl,
          member.xHandle,
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
      } else if (sortKey === "company") {
        compare = compareText(a.company, b.company, sortDirection);
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

  const bulkInviteableMembers = useMemo(
    () =>
      (roster?.members || []).filter(
        (member) =>
          member.accountStatus !== "deactivated" &&
          member.membershipStatus !== "active" &&
          !!member.email &&
          !member.emailSuppressed &&
          !member.invitationEmailSentAt &&
          member.manualApprovalStatus !== "pending",
      ),
    [roster],
  );

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

  const inviteOutstandingMembers = async () => {
    const count = bulkInviteableMembers.length;
    if (!count) return;
    if (!window.confirm(`Send invitation emails to ${count} outstanding invite-able member${count === 1 ? "" : "s"}?`)) {
      return;
    }

    setBulkInviting(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/email/invitations/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSend: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to send outstanding invitations");
      setNotice(
        body?.failed
          ? `Sent ${body.sent || 0} invitation${body.sent === 1 ? "" : "s"}; ${body.failed} failed.`
          : `Sent ${body.sent || 0} outstanding invitation${body.sent === 1 ? "" : "s"}.`,
      );
      await loadRoster();
    } catch (err: any) {
      setError(err?.message || "Failed to send outstanding invitations");
    } finally {
      setBulkInviting(false);
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
        company: body.company || "",
        jobTitle: body.jobTitle || "",
        linkedinUrl: body.linkedinUrl || "",
        xHandle: body.xHandle || "",
        memberDirectoryOptIn: body.memberDirectoryOptIn === true,
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
                  company: body.company ?? null,
                  jobTitle: body.jobTitle ?? null,
                  linkedinUrl: body.linkedinUrl ?? null,
                  xHandle: body.xHandle ?? null,
                  memberDirectoryOptIn: body.memberDirectoryOptIn === true,
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

  const saveInvitationTemplate = async () => {
    setTemplateSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/email-templates/invitation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateDraft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to save invitation template");
      setInvitationTemplate(body);
      setTemplateDraft({
        subject: body.subject || "",
        body: body.body || "",
      });
      setNotice("Invitation email template saved.");
    } catch (err: any) {
      setError(err?.message || "Failed to save invitation template");
    } finally {
      setTemplateSaving(false);
    }
  };

  const sendInvitationTemplateDraft = async () => {
    setTemplateDraftSending(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/email-templates/invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...templateDraft,
          draftRecipientEmail: templateDraftEmail,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to email invitation template draft");
      setNotice(
        `Draft invitation template emailed to ${body?.recipientEmail || templateDraftEmail.trim().toLowerCase()}.`,
      );
    } catch (err: any) {
      setError(err?.message || "Failed to email invitation template draft");
    } finally {
      setTemplateDraftSending(false);
    }
  };

  const templateChanged =
    !!invitationTemplate &&
    (templateDraft.subject.trim() !== invitationTemplate.subject || templateDraft.body.trim() !== invitationTemplate.body);

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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Invitation email template</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Edit the language used when sending activation invitations to invited coalition members.
            </p>
            <div className="mt-2 text-xs font-medium text-slate-500">
              {templateLoading
                ? "Loading template..."
                : invitationTemplate?.isDefault
                  ? "Using the default launch invitation."
                  : `Last updated ${formatDate(invitationTemplate?.updatedAt || null)}.`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={templateLoading || templateSaving} onClick={loadInvitationTemplate}>
              <RefreshCcw className={cn("h-4 w-4", templateLoading && "animate-spin")} />
              Reload
            </Button>
            <Button
              type="button"
              disabled={!templateChanged || templateLoading || templateSaving}
              isLoading={templateSaving}
              onClick={saveInvitationTemplate}
            >
              <Save className="h-4 w-4" />
              Save template
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Subject</span>
            <input
              value={templateDraft.subject}
              onChange={(event) => setTemplateDraft((current) => ({ ...current, subject: event.target.value }))}
              maxLength={180}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Body</span>
            <textarea
              value={templateDraft.body}
              onChange={(event) => setTemplateDraft((current) => ({ ...current, body: event.target.value }))}
              maxLength={20000}
              rows={18}
              className="min-h-96 w-full resize-y rounded-md border px-3 py-2 font-mono text-sm leading-6"
            />
          </label>
          <div className="rounded-lg border bg-white/70 p-3 text-xs leading-5 text-slate-600">
            Available placeholders: <code>[Name]</code>, <code>[First Name]</code>, <code>[Last Name]</code>,{" "}
            <code>[Activation Link]</code>. A prominent activation button is inserted automatically after the greeting.
            {" "}Markdown supported: <code>**bold**</code>, <code>*italic*</code>, <code>`code`</code>, links, and simple lists.
          </div>
          <div className="grid gap-3 rounded-lg border bg-white/70 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Draft recipient email</span>
              <input
                type="email"
                value={templateDraftEmail}
                onChange={(event) => setTemplateDraftEmail(event.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={!templateDraftEmail.trim() || templateLoading || templateSaving || templateDraftSending}
              isLoading={templateDraftSending}
              onClick={sendInvitationTemplateDraft}
            >
              <MailPlus className="h-4 w-4" />
              Email draft
            </Button>
            <p className="text-xs leading-5 text-slate-600 md:col-span-2">
              Draft sends use the current unsaved subject and body with a preview activation link.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white/85 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Manual member onboarding</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Add a member in invited state, then send an activation email when ready.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!bulkInviteableMembers.length || bulkInviting}
              isLoading={bulkInviting}
              onClick={inviteOutstandingMembers}
            >
              <MailPlus className="h-4 w-4" />
              Invite outstanding ({bulkInviteableMembers.length})
            </Button>
            <Button type="button" onClick={() => setCreateOpen((open) => !open)}>
              <UserPlus className="h-4 w-4" />
              {createOpen ? "Close form" : "Add member"}
            </Button>
          </div>
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
              <option value="company">Company</option>
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
        <div className="hidden grid-cols-[1.05fr_0.75fr_0.85fr_0.75fr_0.85fr_1.05fr] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:grid">
          <div>Member</div>
          <div>Status</div>
          <div>Affiliation</div>
          <div>Joined</div>
          <div>Email</div>
          <div>Actions</div>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading roster...</div>
        ) : filteredMembers.length ? (
          <div className="divide-y">
            {filteredMembers.map((member) => {
              const deactivated = member.accountStatus === "deactivated";
              const active = member.membershipStatus === "active";
              const invited = member.membershipStatus === "invited" && !deactivated;
              const welcomeSent = !!member.welcomeEmailSentAt;
              const inviteSent = !!member.invitationEmailSentAt;
              const manualPending = member.manualApprovalStatus === "pending" && !active && !deactivated;
              const expanded = !!expandedRows[member.id];
              const profileDraft = profileDrafts[member.id] ?? profileDraftFromMember(member);
              const profileChanged = profileDraftChanged(profileDraft, member);
              const notesDraft = notesDrafts[member.id] ?? member.adminNotes ?? "";
              const notesChanged = notesDraft.trim() !== (member.adminNotes || "");
              return (
                <div key={member.id} className="text-sm">
                  <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.05fr_0.75fr_0.85fr_0.75fr_0.85fr_1.05fr]">
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
                        deactivated
                          ? "bg-slate-100 text-slate-600"
                          : active
                          ? "bg-teal-50 text-[var(--brand-teal)]"
                          : invited
                            ? "bg-[var(--brand-ice)] text-[var(--brand-denim)]"
                            : "bg-[var(--zcash-gold-soft)] text-[var(--zcash-gold-deep)]",
                      )}>
                        {active && !deactivated ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {statusLabel(member)}
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
                      <div className="font-medium text-[var(--brand-ink)]">{member.company || "—"}</div>
                      <div className="text-xs text-slate-500">{member.jobTitle || "—"}</div>
                      {member.memberDirectoryOptIn ? (
                        <div className="text-xs text-[var(--brand-denim)]">Directory opt-in</div>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-[var(--brand-ink)]">{formatDateTime(member.joinedAt)}</div>
                      <div className="text-xs text-slate-500">Joined</div>
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
                          disabled={!member.email || deactivated}
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
                          disabled={!member.email || deactivated}
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
                              <span className="font-medium text-slate-500">Corporate affiliation</span>
                              <input
                                value={profileDraft.company}
                                onChange={(event) =>
                                  setProfileDrafts((current) => ({
                                    ...current,
                                    [member.id]: { ...profileDraft, company: event.target.value },
                                  }))
                                }
                                className={profileInputClass}
                              />
                            </label>
                            <label className="space-y-1 text-xs text-slate-600">
                              <span className="font-medium text-slate-500">Job title</span>
                              <input
                                value={profileDraft.jobTitle}
                                onChange={(event) =>
                                  setProfileDrafts((current) => ({
                                    ...current,
                                    [member.id]: { ...profileDraft, jobTitle: event.target.value },
                                  }))
                                }
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
                                placeholder="@pgpz"
                                className={profileInputClass}
                              />
                            </label>
                            <label className="flex gap-3 rounded-md border bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                              <input
                                type="checkbox"
                                checked={profileDraft.memberDirectoryOptIn}
                                onChange={(event) =>
                                  setProfileDrafts((current) => ({
                                    ...current,
                                    [member.id]: { ...profileDraft, memberDirectoryOptIn: event.target.checked },
                                  }))
                                }
                                className="mt-0.5 h-4 w-4 accent-[var(--zcash-gold)]"
                              />
                              <span>Directory opt-in</span>
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
                            Membership state
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
                              <dt className="font-medium text-slate-500">Invitation</dt>
                              <dd className="text-right text-slate-800">{formatDate(member.invitationEmailSentAt)}</dd>
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
