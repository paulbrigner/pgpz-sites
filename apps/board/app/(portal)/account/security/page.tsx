import { Badge, Container, Surface } from "@pgpz/ui";
import { requireBoardMember } from "@/lib/session";
import { PasskeyManager } from "@/components/security/PasskeyManager";
import { getBoardPasskeyCount } from "@/lib/passkey-enrollment";
import { hasBoardPasskeySession } from "@/lib/passkey-step-up";
import { headers } from "next/headers";
import { resolveSafeCallbackUrl } from "@/lib/callback-url";
import Link from "next/link";

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
  const firstPasskey = passkeyCount === 0;
  return (
    <Container className="py-10 sm:py-14">
      <div className="max-w-3xl">
        {firstPasskey || !passkeySession ? <Badge tone="accent">Required before continuing</Badge> : null}
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">{firstPasskey ? "Set up your passkey" : passkeyCount !== null && !passkeySession ? "Verify your passkey" : "Sign-in security"}</h1>
        {firstPasskey ? (
          <div className="mt-3 text-sm leading-6 text-[var(--muted)]">
            <p>Your account is signed in. Create a passkey, then verify it to open Board content.</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              <li>Create your passkey with the button below.</li>
              <li>Follow your device or passkey provider&apos;s PIN, fingerprint, or face verification instructions.</li>
              <li>Select &ldquo;Verify passkey to continue&rdquo; to finish signing in.</li>
            </ol>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{!passkeySession ? "Your account is signed in. A registered passkey must still be verified before you can open Board content." : "Manage your passkeys for phishing-resistant sign-in."}</p>
        )}
        {passkeyCount === null ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Your passkey enrollment status is temporarily unavailable. Check the passkey list below before continuing.</p> : null}
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">A second passkey is recommended as a backup. If you have lost all your registered passkeys, contact the Board Chair or Executive Director for a reset.</p>
        {passkeySession ? <Link href={continueTo} className="mt-4 inline-flex text-sm font-semibold text-[var(--primary)] underline">Continue to the Board portal</Link> : null}
        <Surface className="mt-8 p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Your passkeys</h2>
          <div className="mt-5"><PasskeyManager verificationRequired={!passkeySession} continueTo={continueTo} /></div>
        </Surface>
      </div>
    </Container>
  );
}
