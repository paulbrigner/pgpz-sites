"use client";

import type { ReactNode } from "react";
import { AccessTracker } from "@/components/access/AccessTracker";
import { AdminViewModeProvider } from "@/components/admin/AdminViewMode";
import { AppSessionProvider } from "@/lib/use-app-session";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppSessionProvider>
      <AdminViewModeProvider>
        <AccessTracker />
        {children}
      </AdminViewModeProvider>
    </AppSessionProvider>
  );
}
