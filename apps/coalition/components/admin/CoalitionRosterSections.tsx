import { ChevronRight, MailPlus, RefreshCcw, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminRoster } from "@/lib/admin/roster";
import { cn } from "@/lib/utils";

export type CoalitionInvitationTemplateState = {
  subject: string;
  body: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
};

export type CoalitionRosterStatusFilter = "all" | "active" | "invited" | "none" | "manual";
export type CoalitionRosterSortKey = "firstName" | "lastName" | "company" | "joinedAt";
export type CoalitionRosterSortDirection = "asc" | "desc";

export function CoalitionRosterSummary({ meta }: { meta: AdminRoster["meta"] | undefined }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {[
        ["Total", meta?.total ?? 0],
        ["Active", meta?.active ?? 0],
        ["Invited", meta?.invited ?? 0],
        ["Unapproved", meta?.none ?? 0],
        ["Approval ready", meta?.manualPending ?? 0],
        ["Admins", meta?.admins ?? 0],
      ].map(([label, value]) => (
        <div key={label} className="rounded-lg border bg-white/80 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function CoalitionInvitationTemplateEditor({
  template,
  draft,
  onDraftChange,
  loading,
  saving,
  changed,
  onReload,
  onSave,
  draftEmail,
  onDraftEmailChange,
  draftSending,
  onSendDraft,
  formatDate,
}: {
  template: CoalitionInvitationTemplateState | null;
  draft: { subject: string; body: string };
  onDraftChange: (draft: { subject: string; body: string }) => void;
  loading: boolean;
  saving: boolean;
  changed: boolean;
  onReload: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  draftEmail: string;
  onDraftEmailChange: (email: string) => void;
  draftSending: boolean;
  onSendDraft: () => void | Promise<void>;
  formatDate: (value: string | null) => string;
}) {
  return (
    <details className="group rounded-lg border bg-white/85">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90"
        />
        <div>
          <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Invitation email template</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Edit the language used when sending activation invitations to invited coalition members.
          </p>
          <div className="mt-2 text-xs font-medium text-slate-500">
            {loading
              ? "Loading template..."
              : template?.isDefault
                ? "Using the default launch invitation."
                : `Last updated ${formatDate(template?.updatedAt || null)}.`}
          </div>
        </div>
      </summary>
      <div className="border-t p-4">
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={loading || saving} onClick={onReload}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Reload
          </Button>
          <Button
            type="button"
            disabled={!changed || loading || saving}
            isLoading={saving}
            onClick={onSave}
          >
            <Save className="h-4 w-4" />
            Save template
          </Button>
        </div>
        <div className="mt-5 grid gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Subject</span>
            <input
              value={draft.subject}
              onChange={(event) => onDraftChange({ ...draft, subject: event.target.value })}
              maxLength={180}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Body</span>
            <textarea
              value={draft.body}
              onChange={(event) => onDraftChange({ ...draft, body: event.target.value })}
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
                value={draftEmail}
                onChange={(event) => onDraftEmailChange(event.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={!draftEmail.trim() || loading || saving || draftSending}
              isLoading={draftSending}
              onClick={onSendDraft}
            >
              <MailPlus className="h-4 w-4" />
              Email draft
            </Button>
            <p className="text-xs leading-5 text-slate-600 md:col-span-2">
              Draft sends use the current unsaved subject and body with a preview activation link.
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}

export function CoalitionRosterControls({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  loading,
  onRefresh,
  sortKey,
  onSortKeyChange,
  sortDirection,
  onSortDirectionChange,
  actionsFirst,
  onActionsFirstChange,
  actionNeededCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: CoalitionRosterStatusFilter;
  onStatusFilterChange: (value: CoalitionRosterStatusFilter) => void;
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  sortKey: CoalitionRosterSortKey;
  onSortKeyChange: (value: CoalitionRosterSortKey) => void;
  sortDirection: CoalitionRosterSortDirection;
  onSortDirectionChange: (value: CoalitionRosterSortDirection) => void;
  actionsFirst: boolean;
  onActionsFirstChange: (value: boolean) => void;
  actionNeededCount: number;
}) {
  return (
    <div className="rounded-lg border bg-white/85 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-xl flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
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
            ["manual", "Approval ready"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onStatusFilterChange(value as CoalitionRosterStatusFilter)}
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
          <Button type="button" variant="outline" onClick={onRefresh} disabled={loading}>
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
            onChange={(event) => onSortKeyChange(event.target.value as CoalitionRosterSortKey)}
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
            onChange={(event) => onSortDirectionChange(event.target.value as CoalitionRosterSortDirection)}
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
            onChange={(event) => onActionsFirstChange(event.target.checked)}
            className="h-4 w-4 accent-[var(--zcash-gold)]"
          />
          Actions first ({actionNeededCount})
        </label>
      </div>
    </div>
  );
}
