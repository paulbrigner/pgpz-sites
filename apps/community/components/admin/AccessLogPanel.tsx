"use client";

import Link from "next/link";
import { createAccessLogPanel } from "@pgpz/access-log/client";
import { SensitiveDataText } from "@/components/admin/sensitive-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const AccessLogPanel = createAccessLogPanel({
  Button,
  Link,
  SensitiveDataText,
  cn,
});
