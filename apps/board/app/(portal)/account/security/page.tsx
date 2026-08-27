import { Badge, Container, Surface } from "@pgpz/ui";
import { requireBoardMember } from "@/lib/session";
import { PasskeyManager } from "@/components/security/PasskeyManager";
import { getBoardPasskeyCount } from "@/lib/passkey-enrollment";
import { hasBoardPasskeySession } from "@/lib/passkey-step-up";
import { headers } from "next/headers";
import { resolveSafeCallbackUrl } from "@/lib/callback-url";

export const metadata = { title: "Sign-in security" };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const member = await requireBoardMember("/account/security");
  if (!member) return null;
  const params = await searchParams;
  const continueTo = resolveSafeCallbackUrl(typeof params.callbackUrl === "string" ? params.callbackUrl : null);
  const [passkeyCount, passkeySession] = await Promise.all([
    getBoardPasskeyCount(member.id),
    hasBoardPasskeySession(await headers(), member.id),
  ]);
  return <Container className="py-10 sm:py-14"><div className="max-w-3xl">{passkeyCount === 0 || !passkeySession ? <Badge tone="accent">Required before continuing</Badge> : null}<h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Sign-in security</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Register a passkey for phishing-resistant sign-in. Email links remain available for verified recovery, and a second passkey is recommended as a backup.</p><Surface className="mt-8 p-6 sm:p-8"><h2 className="text-xl font-semibold">Your passkeys</h2><div className="mt-5"><PasskeyManager verificationRequired={!passkeySession} continueTo={continueTo} /></div></Surface></div></Container>;
}
