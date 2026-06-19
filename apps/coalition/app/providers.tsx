"use client";

import { ReactNode, useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { AccessTracker } from "@/components/access/AccessTracker";

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <SessionProvider>
      <AccessTracker />
      {children}
    </SessionProvider>
  );
}
