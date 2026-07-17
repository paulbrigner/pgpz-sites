import { visibleSiteNavigation } from "@pgpz/core";
import { Container, buttonStyles } from "@pgpz/ui";
import { Menu } from "lucide-react";
import Link from "next/link";
import { referenceSiteConfig } from "@/config/site";
import { ReferenceMark } from "./ReferenceMark";

const navigation = visibleSiteNavigation(referenceSiteConfig);

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(246,247,242,0.88)] backdrop-blur-xl">
      <Container className="flex min-h-16 items-center justify-between gap-5 py-2">
        <Link
          href="/"
          className="group inline-flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          aria-label="PGPZ Reference home"
        >
          <ReferenceMark compact />
          <span>
            <span className="block text-sm font-bold tracking-[-0.01em] text-[var(--foreground)]">
              PGPZ Reference
            </span>
            <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Executable example
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={buttonStyles({ variant: "quiet", size: "sm" })}>
              {item.label}
            </Link>
          ))}
        </nav>

        <details className="relative md:hidden">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border-strong)] bg-white text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] [&::-webkit-details-marker]:hidden">
            <Menu className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Open navigation</span>
          </summary>
          <nav
            className="absolute right-0 top-12 flex w-56 flex-col gap-1 rounded-2xl border border-[var(--border)] bg-white p-2 shadow-xl"
            aria-label="Mobile navigation"
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </details>
      </Container>
    </header>
  );
}
