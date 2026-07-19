import { RefreshCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminRoster } from "@/lib/admin/roster";
import { cn } from "@/lib/utils";

export type CommunityRosterStatusFilter = "all" | "active" | "none" | "manual";
export type CommunityRosterSortKey = "firstName" | "lastName" | "joinedAt";
export type CommunityRosterSortDirection = "asc" | "desc";

export function CommunityRosterOverview({
  meta,
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
  meta: AdminRoster["meta"] | undefined;
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: CommunityRosterStatusFilter;
  onStatusFilterChange: (value: CommunityRosterStatusFilter) => void;
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  sortKey: CommunityRosterSortKey;
  onSortKeyChange: (value: CommunityRosterSortKey) => void;
  sortDirection: CommunityRosterSortDirection;
  onSortDirectionChange: (value: CommunityRosterSortDirection) => void;
  actionsFirst: boolean;
  onActionsFirstChange: (value: boolean) => void;
  actionNeededCount: number;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ["Total", meta?.total ?? 0],
          ["Active", meta?.active ?? 0],
          ["Unverified", meta?.none ?? 0],
          ["Manual pending", meta?.manualPending ?? 0],
          ["Admins", meta?.admins ?? 0],
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
              onChange={(event) => onQueryChange(event.target.value)}
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
                onClick={() => onStatusFilterChange(value as CommunityRosterStatusFilter)}
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
              onChange={(event) => onSortKeyChange(event.target.value as CommunityRosterSortKey)}
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
              onChange={(event) => onSortDirectionChange(event.target.value as CommunityRosterSortDirection)}
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
    </>
  );
}
