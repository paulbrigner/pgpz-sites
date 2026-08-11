"use client";

import { usePathname } from "next/navigation";
import { createAccessTracker } from "@pgpz/access-log/client";
import { useAppSession } from "@/lib/use-app-session";

export const AccessTracker = createAccessTracker({ usePathname, useAppSession });
