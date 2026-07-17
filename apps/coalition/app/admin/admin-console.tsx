"use client";

import { useState } from "react";
import { Activity, Mail, Newspaper, Users } from "lucide-react";
import AdminClient from "./admin-client";
import { AccessLogPanel } from "@/components/admin/AccessLogPanel";
import { NewsletterMailer } from "@/components/admin/NewsletterMailer";
import { PolicyUpdateMailer } from "@/components/admin/PolicyUpdateMailer";
import type { PolicyUpdateSummary } from "@/lib/policy-updates";
import { cn } from "@/lib/utils";

type AdminTab = "users" | "updates" | "newsletters" | "access";

type Props = {
  initialUpdates: PolicyUpdateSummary[];
  currentAdminId?: string | null;
};

const tabs: Array<{
  id: AdminTab;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    id: "users",
    label: "User management",
    description: "Membership, verification, welcome emails, and notes",
    icon: Users,
  },
  {
    id: "updates",
    label: "Update distribution",
    description: "Send weekly and special policy resources",
    icon: Mail,
  },
  {
    id: "newsletters",
    label: "Newsletters",
    description: "Draft, publish, and review message stats",
    icon: Newspaper,
  },
  {
    id: "access",
    label: "Access log",
    description: "Recent member logins and page views",
    icon: Activity,
  },
];

export function AdminConsole({ initialUpdates, currentAdminId }: Props) {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-white/85 p-2 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex min-h-24 items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
                  active
                    ? "border-[rgba(245,168,0,0.62)] bg-[var(--brand-ice)] shadow-sm"
                    : "border-transparent bg-white/40 hover:border-slate-200 hover:bg-white",
                )}
                aria-pressed={active}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                    active ? "bg-[var(--brand-ink)] text-[var(--zcash-gold)]" : "bg-slate-100 text-slate-500",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--brand-ink)]">{tab.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{tab.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "users" ? <AdminClient initialRoster={null} currentAdminId={currentAdminId} /> : null}
      {activeTab === "updates" ? <PolicyUpdateMailer initialUpdates={initialUpdates} /> : null}
      {activeTab === "newsletters" ? <NewsletterMailer /> : null}
      {activeTab === "access" ? <AccessLogPanel /> : null}
    </div>
  );
}
