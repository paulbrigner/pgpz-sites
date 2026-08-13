"use client";

import { useMemo, useState } from "react";
import { KeyRound, RefreshCcw, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { buttonStyles } from "@pgpz/ui";

export type BoardManagedUser = {
  id: string;
  email: string;
  name: string;
  role: "member" | "chair" | "board-support" | "admin" | "executive-director" | "legal-counsel";
  status: "invited" | "active" | "deactivated";
  passkeyCount: number;
  createdAt: string;
  updatedAt: string;
};

const roleLabels: Record<BoardManagedUser["role"], string> = {
  member: "Director",
  chair: "Board Chair",
  "board-support": "Board Support",
  admin: "Board Chair",
  "executive-director": "Executive Director",
  "legal-counsel": "Legal Counsel",
};

const assignableRoles = ["member", "chair", "board-support", "executive-director", "legal-counsel"] as const;

const statusLabels: Record<BoardManagedUser["status"], string> = {
  invited: "Invited",
  active: "Active",
  deactivated: "Deactivated",
};

function displayDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Unknown";
}

function confirmationFor(action: string, user: BoardManagedUser) {
  if (action === "deactivate") return `DEACTIVATE ${user.email}`;
  if (action === "reactivate") return `REACTIVATE ${user.email}`;
  if (action === "revoke_sessions") return `REVOKE ${user.email}`;
  if (action === "set_role") return `CHANGE ROLE ${user.email}`;
  return "";
}

export function BoardUserManager({
  initialUsers,
  currentUserEmail,
}: {
  initialUsers: BoardManagedUser[];
  currentUserEmail: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | BoardManagedUser["status"]>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ email: "", name: "", role: "member" as BoardManagedUser["role"] });

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      if (status !== "all" && user.status !== status) return false;
      return !needle || `${user.name} ${user.email} ${roleLabels[user.role]}`.toLowerCase().includes(needle);
    });
  }, [query, status, users]);

  const refresh = async () => {
    setBusy("refresh");
    setError(null);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Unable to load Board users.");
      setUsers(Array.isArray(body?.users) ? body.users : []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load Board users.");
    } finally {
      setBusy(null);
    }
  };

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Unable to add the Board user.");
      setUsers((current) => [body.user, ...current.filter((user) => user.id !== body.user.id)]);
      setCreateForm({ email: "", name: "", role: "member" });
      setCreating(false);
      setNotice(`${body.user.email} can now request a passwordless sign-in link.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to add the Board user.");
    } finally {
      setBusy(null);
    }
  };

  const mutateUser = async (
    user: BoardManagedUser,
    action: "set_role" | "deactivate" | "reactivate" | "revoke_sessions",
    role?: BoardManagedUser["role"],
  ) => {
    const expected = confirmationFor(action, user);
    const confirmation = window.prompt(`Type ${expected} to continue.`);
    if (confirmation !== expected) return;
    setBusy(`${action}:${user.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, action, role, confirmation }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Unable to update the Board user.");
      if (body.user) {
        setUsers((current) => current.map((candidate) => candidate.id === body.user.id ? body.user : candidate));
      }
      setNotice(body?.message || "Board access updated.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update the Board user.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      <section className="grid gap-3 sm:grid-cols-4" aria-label="Board user summary">
        {([
          ["Total", users.length],
          ["Active", users.filter((user) => user.status === "active").length],
          ["Invited", users.filter((user) => user.status === "invited").length],
          ["Deactivated", users.filter((user) => user.status === "deactivated").length],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[var(--border)] bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white/85 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--foreground)]">
              <Users className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
              Board access roster
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Roles and access state are effective immediately and preserved in the audit ledger.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={refresh} disabled={busy !== null} className={buttonStyles({ variant: "outline", size: "sm" })}>
              <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Refresh
            </button>
            <button type="button" onClick={() => setCreating((value) => !value)} className={buttonStyles({ size: "sm" })}>
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Add user
            </button>
          </div>
        </div>

        {creating ? (
          <form onSubmit={createUser} className="mt-5 grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--primary-soft)] p-5 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">Name<input required value={createForm.name} onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))} className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-3 font-normal" /></label>
            <label className="grid gap-2 text-sm font-semibold">Email<input required type="email" value={createForm.email} onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))} className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-3 font-normal" /></label>
            <label className="grid gap-2 text-sm font-semibold">Role<select value={createForm.role} onChange={(event) => setCreateForm((form) => ({ ...form, role: event.target.value as BoardManagedUser["role"] }))} className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-3 font-normal">{assignableRoles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}</select></label>
            <div className="flex items-end"><button disabled={busy !== null} className={buttonStyles({ size: "sm" })}>Create passwordless user</button></div>
          </form>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="relative"><span className="sr-only">Search Board users</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email, or role" className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-white pl-10 pr-3 text-sm" /></label>
          <label><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="deactivated">Deactivated</option></select></label>
        </div>

        {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="mt-4 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-ink)]">{notice}</p> : null}

        <ul className="mt-5 divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)]">
          {filteredUsers.map((user) => {
            const isExpanded = expanded[user.id] === true;
            const isSelf = user.email === currentUserEmail;
            return (
              <li key={user.id} className="bg-white/90">
                <button type="button" onClick={() => setExpanded((current) => ({ ...current, [user.id]: !isExpanded }))} aria-expanded={isExpanded} className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5">
                  <span className="min-w-0"><span className="block truncate font-semibold text-[var(--foreground)]">{user.name || user.email}</span><span className="block truncate text-sm text-[var(--muted)]">{user.email}</span></span>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-2"><span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">{roleLabels[user.role]}</span><span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold">{statusLabels[user.status]}</span></span>
                </button>
                {isExpanded ? (
                  <div className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-5 sm:px-5">
                    <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Passkeys</dt><dd className="mt-1 flex items-center gap-1.5"><KeyRound className="h-4 w-4" aria-hidden="true" />{user.passkeyCount}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Access record updated</dt><dd className="mt-1">{displayDate(user.updatedAt)}</dd></div></dl>
                    <div className="mt-5 flex flex-wrap items-end gap-3">
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"><span>{user.name || user.email} role</span><select aria-label={`${user.name || user.email} role`} value={user.role === "admin" ? "chair" : user.role} disabled={isSelf || busy !== null} onChange={(event) => void mutateUser(user, "set_role", event.target.value as BoardManagedUser["role"])} className="h-10 rounded-xl border border-[var(--border-strong)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--foreground)]">{assignableRoles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}</select></label>
                      <button type="button" disabled={busy !== null} onClick={() => void mutateUser(user, "revoke_sessions")} className={buttonStyles({ variant: "outline", size: "sm" })}><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Revoke sessions</button>
                      {user.status === "deactivated" ? <button type="button" disabled={busy !== null} onClick={() => void mutateUser(user, "reactivate")} className={buttonStyles({ variant: "outline", size: "sm" })}>Reactivate</button> : <button type="button" disabled={isSelf || busy !== null} onClick={() => void mutateUser(user, "deactivate")} className={buttonStyles({ variant: "outline", size: "sm" })}>Deactivate</button>}
                    </div>
                    {isSelf ? <p className="mt-3 text-xs text-[var(--muted)]">Your own role and access cannot be changed from this screen.</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!filteredUsers.length ? <p className="py-8 text-center text-sm text-[var(--muted)]">No Board users match these filters.</p> : null}
      </section>
    </div>
  );
}
