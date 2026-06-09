"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import {
  AdminSensitiveDataProvider,
  SensitiveDataText,
  SensitiveDataToggleButton,
} from "@/components/admin/sensitive-data";

type Props = {
  children: ReactNode;
  name: string;
  email?: string | null;
};

export function AdminShell({ children, name, email }: Props) {
  return (
    <AdminSensitiveDataProvider>
      <div className="mx-auto max-w-6xl space-y-6 px-5 pb-14">
        <div className="glass-surface relative overflow-hidden border border-[rgba(245,168,0,0.28)] bg-white/85 p-6 shadow-[0_26px_46px_-26px_rgba(30,30,30,0.32)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <p className="section-eyebrow text-[var(--brand-denim)]">Admin Console</p>
              <h1 className="text-3xl font-semibold text-[var(--brand-ink)] sm:text-3xl">PGPZ Community</h1>
              <p className="text-sm text-muted-foreground">
                Signed in as <SensitiveDataText value={name} kind="name" fallback="Admin" />
                {email ? (
                  <>
                    {" - "}
                    <SensitiveDataText value={email} kind="email" />
                  </>
                ) : null}
                . Admin tools surface member verification health and messaging.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(245,168,0,0.42)] bg-[rgba(245,168,0,0.12)] px-4 py-2 text-[0.9rem] font-semibold text-[var(--brand-denim)] shadow-[0_10px_30px_-18px_rgba(30,30,30,0.35)]">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                Admin access
              </div>
              <SensitiveDataToggleButton />
            </div>
          </div>
        </div>
        {children}
      </div>
    </AdminSensitiveDataProvider>
  );
}
