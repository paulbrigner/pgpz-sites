import Link from "next/link";
import { Container } from "@pgpz/ui";
import { boardSiteConfig } from "@/config/site";
import { BoardMark } from "./BoardMark";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-white/70 py-10">
      <Container className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <BoardMark />
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">{boardSiteConfig.legal.entityName}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Private portal · Authorized board members only · Not indexed
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Legal navigation">
          <Link className="footer-link" href={boardSiteConfig.legal.termsUrl}>Terms</Link>
          <Link className="footer-link" href={boardSiteConfig.legal.privacyUrl}>Privacy</Link>
        </nav>
      </Container>
    </footer>
  );
}
