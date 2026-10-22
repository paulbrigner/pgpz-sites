import { Suspense } from "react";
import { Container, Surface } from "@pgpz/ui";
import { SignInForm } from "./signin-form";
import { BOARD_PASSWORDLESS_AUTH_ENABLED, BOARD_PASSWORD_AUTH_ENABLED } from "@/lib/config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveBoardMemberState } from "@/lib/session";
import { resolveSafeCallbackUrl } from "@/lib/callback-url";

export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const state = await resolveBoardMemberState(await headers());
  if (state.status === "member") {
    const params = await searchParams;
    const callbackUrl = resolveSafeCallbackUrl(typeof params.callbackUrl === "string" ? params.callbackUrl : null);
    redirect(`/account/security?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <Surface className="w-full max-w-md overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-8 py-7">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">
            Private portal
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            Board sign in
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Sign in with your passkey, or use an email link to begin first-time setup. A passkey is required to open Board content.
          </p>
        </div>
        <Suspense>
          <SignInForm passwordlessEnabled={BOARD_PASSWORDLESS_AUTH_ENABLED} passwordEnabled={BOARD_PASSWORD_AUTH_ENABLED} />
        </Suspense>
      </Surface>
    </Container>
  );
}
