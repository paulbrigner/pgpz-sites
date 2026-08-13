import { getSessionCookie } from "better-auth/cookies";
import { cookies } from "next/headers";
import Link from "next/link";
import { Container } from "@pgpz/ui";
import { LockKeyhole } from "lucide-react";
import { SignOutButton } from "./SignOutButton";
import { BoardMark } from "./BoardMark";

export async function SiteHeader() {
  const cookieStore = await cookies();
  const signedIn = Boolean(getSessionCookie(new Headers({ cookie: cookieStore.toString() })));

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(246,250,242,0.9)] backdrop-blur-xl">
      <Container className="flex min-h-16 items-center justify-between gap-5 py-2">
        <Link
          href="/"
          className="group inline-flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          aria-label="PGPZ Board home"
        >
          <BoardMark />
          <span className="border-l border-[var(--border-strong)] pl-3">
            <span className="block text-sm font-bold tracking-[-0.01em] text-[var(--foreground)]">Board</span>
            <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Directors&apos; portal</span>
          </span>
        </Link>

        {signedIn ? (
          <SignOutButton label="Sign out" />
        ) : (
          <span className="hidden items-center gap-2 text-xs font-semibold text-[var(--muted)] sm:inline-flex">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
            Private
          </span>
        )}
      </Container>
    </header>
  );
}
