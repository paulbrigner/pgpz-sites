import type { Metadata } from "next";
import { Container, Surface } from "@pgpz/ui";
import { readBoardEmailLinkToken, resolveBoardEmailLinkCallback } from "@/lib/email-link";
import { EmailLinkContinue } from "./email-link-continue";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Continue Board sign-in",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function EmailLinkPage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[]; callbackUrl?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = readBoardEmailLinkToken(params.token);
  const callbackUrl = resolveBoardEmailLinkCallback(params.callbackUrl);
  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <Surface className="w-full max-w-md px-8 py-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Private portal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Continue Board sign-in</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Select Continue to use your one-time email link. You can then set up a passkey or verify an existing one. A passkey is required before Board content opens.
        </p>
        <div className="mt-6"><EmailLinkContinue token={token} callbackUrl={callbackUrl} /></div>
      </Surface>
    </Container>
  );
}
