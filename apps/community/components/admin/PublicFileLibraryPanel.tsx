"use client";

import { createPublicFileLibraryPanel } from "@pgpz/public-files/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PublicFileLibraryPanel = createPublicFileLibraryPanel({ Button, cn });
