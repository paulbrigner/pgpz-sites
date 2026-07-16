"use client";

import { ReactNode, useEffect, useState } from "react";
import { AccessTracker } from "@/components/access/AccessTracker";
import { AdminViewModeProvider } from "@/components/admin/AdminViewMode";

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <AdminViewModeProvider>
      <AccessTracker />
      {children}
    </AdminViewModeProvider>
  );
}
