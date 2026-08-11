"use client";

import { Eye, EyeOff } from "lucide-react";
import { useAdminSensitiveData } from "@pgpz/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export {
  AdminSensitiveDataProvider,
  formatSensitiveValue,
  maskSensitiveValue,
  SensitiveDataText,
  type SensitiveDataKind,
  useAdminSensitiveData,
} from "@pgpz/ui";

export function SensitiveDataToggleButton({ className }: { className?: string }) {
  const { sensitiveDataVisible, toggleSensitiveDataVisibility } = useAdminSensitiveData();
  const Icon = sensitiveDataVisible ? EyeOff : Eye;

  return (
    <Button
      type="button"
      variant="outlined-primary"
      size="sm"
      className={cn("w-full whitespace-nowrap sm:w-auto", className)}
      onClick={toggleSensitiveDataVisibility}
      aria-pressed={sensitiveDataVisible}
      aria-label={sensitiveDataVisible ? "Hide sensitive details" : "Show sensitive details"}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {sensitiveDataVisible ? "Hide names & emails" : "Show names & emails"}
    </Button>
  );
}
