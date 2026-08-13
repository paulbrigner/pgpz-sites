import { Container, Surface } from "@pgpz/ui";
import { requireBoardMember } from "@/lib/session";
import { PasskeyManager } from "@/components/security/PasskeyManager";

export const metadata = { title: "Sign-in security" };

export default async function SecurityPage() {
  const member = await requireBoardMember("/account/security");
  if (!member) return null;
  return <Container className="py-10 sm:py-14"><div className="max-w-3xl"><h1 className="text-4xl font-semibold tracking-[-0.04em]">Sign-in security</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Register a passkey for phishing-resistant sign-in. Keep email access or another passkey available for recovery.</p><Surface className="mt-8 p-6 sm:p-8"><h2 className="text-xl font-semibold">Your passkeys</h2><div className="mt-5"><PasskeyManager /></div></Surface></div></Container>;
}
