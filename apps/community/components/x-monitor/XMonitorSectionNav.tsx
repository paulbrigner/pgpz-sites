import Link from "next/link";
import { Activity, BookOpenText } from "lucide-react";
import { cn } from "@/lib/utils";

type XMonitorSection = "monitor" | "briefings";

const sections = [
  {
    id: "monitor" as const,
    href: "/x-monitor",
    label: "Live Monitor",
    description: "Posts, summaries, and trends",
    icon: Activity,
  },
  {
    id: "briefings" as const,
    href: "/x-monitor/briefings",
    label: "Topic Briefings",
    description: "Curated answers",
    icon: BookOpenText,
  },
];

export function XMonitorSectionNav({ active }: { active: XMonitorSection }) {
  return (
    <nav aria-label="X Monitor sections" className="glass-surface p-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          const selected = active === section.id;
          return (
            <Link
              key={section.id}
              href={section.href}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 transition",
                selected
                  ? "border-[rgba(245,168,0,0.62)] bg-[var(--brand-ink)] text-white shadow-sm"
                  : "border-transparent bg-white/65 text-[var(--brand-ink)] hover:border-[rgba(245,168,0,0.4)] hover:bg-white",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  selected
                    ? "bg-[rgba(245,168,0,0.18)] text-[var(--zcash-gold)]"
                    : "bg-[var(--brand-ice)] text-[var(--brand-denim)]",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{section.label}</span>
                <span className={cn("mt-0.5 block text-xs", selected ? "text-white/70" : "text-slate-500")}>
                  {section.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
