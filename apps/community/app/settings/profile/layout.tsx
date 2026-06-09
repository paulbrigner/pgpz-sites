import type { ReactNode } from "react";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">Profile Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage contact details and social profile links used by the PGPZ community.
        </p>
      </div>
      {children}
    </div>
  );
}
