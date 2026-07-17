import { Container } from "@pgpz/ui";
import Link from "next/link";
import { referenceSiteConfig } from "@/config/site";
import { ReferenceMark } from "./ReferenceMark";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-white/70 py-10">
      <Container className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <ReferenceMark compact />
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">{referenceSiteConfig.legal.entityName}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Non-production · Synthetic content · No outbound services
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Legal navigation">
          <Link className="footer-link" href={referenceSiteConfig.legal.termsUrl}>Terms</Link>
          <Link className="footer-link" href={referenceSiteConfig.legal.privacyUrl}>Privacy</Link>
          {referenceSiteConfig.legal.guidelinesUrl ? (
            <Link className="footer-link" href={referenceSiteConfig.legal.guidelinesUrl}>Reference notice</Link>
          ) : null}
        </nav>
      </Container>
    </footer>
  );
}
