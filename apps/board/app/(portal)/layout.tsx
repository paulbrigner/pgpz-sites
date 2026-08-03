import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Container } from "@pgpz/ui";
import { resolveActiveMembership } from "@pgpz/core/server";
import { LockKeyhole } from "lucide-react";
import { boardMembershipAdapter } from "@/config/server";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const headerList = await headers();
  const session = await auth.api.getSession({
    headers: headerList,
    query: { disableRefresh: true },
  });

  if (!session?.user) {
    const pathname = headerList.get("x-pathname") || "/";
    redirect(`/signin?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  const membership = await resolveActiveMembership(boardMembershipAdapter, {
    email: session.user.email ?? undefined,
  });

  if (!membership.active) {
    return (
      <Container className="flex min-h-[70vh] items-center justify-center py-16">
        <div className="w-full max-w-md rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--accent-ink)]">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            This account is not on the board roster
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--accent-ink)]">
            The email <strong>{session.user.email}</strong> is signed in but is not listed in
            <code className="mx-1 rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs">BOARD_MEMBER_EMAILS</code>.
            Contact the board administrator if you believe this is a mistake.
          </p>
          <div className="mt-6">
            <SignOutButton label="Sign out and return to the sign-in page" />
          </div>
        </div>
      </Container>
    );
  }

  return <>{children}</>;
}
