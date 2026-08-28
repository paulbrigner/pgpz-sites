import { getSessionCookie } from "better-auth/cookies";
import { cookies } from "next/headers";
import Link from "next/link";
import { Container } from "@pgpz/ui";
import { boardSiteConfig } from "@/config/site";
import { BoardMark } from "./BoardMark";

export async function SiteFooter() {
  const cookieStore = await cookies();
  const signedIn = Boolean(getSessionCookie(new Headers({ cookie: cookieStore.toString() })));

  return (
    <footer className="border-t border-[var(--border)] bg-white/70 py-10">
      <Container className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <BoardMark compact />
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">{boardSiteConfig.legal.entityName}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Board portal</p>
          </div>
        </div>
        {signedIn ? (
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Portal information">
            <Link className="footer-link" href="/governance-safeguards">How records are protected</Link>
            <Link className="footer-link" href={boardSiteConfig.legal.termsUrl}>Terms</Link>
            <Link className="footer-link" href={boardSiteConfig.legal.privacyUrl}>Privacy</Link>
          </nav>
        ) : (
          // Both legal pages are inside the authenticated portal, so linking
          // them here would bounce anonymous visitors straight back to
          // sign-in. Keep the anonymous footer link-free.
          <p className="text-xs leading-5 text-[var(--muted)]">
            Sign in to access portal terms and the privacy notice.
          </p>
        )}
      </Container>
    </footer>
  );
}
