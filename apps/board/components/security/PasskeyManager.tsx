"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
import { buttonStyles } from "@pgpz/ui";
import { betterAuthClient } from "@/lib/auth-client";
import { verifyBoardPasskey, BOARD_PASSKEY_VERIFICATION_ERROR } from "@/lib/step-up-client";

const REGISTRATION_ERROR = "Passkey setup was not completed. Try again and follow your device or passkey provider's instructions, including PIN, fingerprint, or face verification. If this keeps happening, contact the Board Chair or Executive Director.";

export function PasskeyManager({
  verificationRequired = false,
  continueTo = "/",
}: {
  verificationRequired?: boolean;
  continueTo?: string;
}) {
  const router = useRouter();
  const passkeys = betterAuthClient.useListPasskeys();
  const [addedPasskeys, setAddedPasskeys] = useState<Array<NonNullable<typeof passkeys.data>[number]>>([]);
  const [removedPasskeyIds, setRemovedPasskeyIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(!verificationRequired);

  const visiblePasskeys = Array.from(
    new Map(
      [...(passkeys.data ?? []), ...addedPasskeys]
        .filter((passkey) => !removedPasskeyIds.includes(passkey.id))
        .map((passkey) => [passkey.id, passkey]),
    ).values(),
  );
  const listUnavailable = passkeys.isPending || Boolean(passkeys.error) || !Array.isArray(passkeys.data);
  const listFailed = !passkeys.isPending && listUnavailable;
  const firstPasskey = !listUnavailable && visiblePasskeys.length === 0;

  async function addPasskey() {
    if (listUnavailable) return;
    setBusy(true);
    setMessage(null);
    try {
      if (visiblePasskeys.length > 0) await verifyBoardPasskey();
      const result = await betterAuthClient.passkey.addPasskey({ name: name.trim() || undefined });
      if (result.error || !result.data) {
        setMessage(REGISTRATION_ERROR);
        return;
      }
      setMessage(verificationRequired && !verified
        ? "Passkey created. Verify it to open the Board portal."
        : "Passkey registered.");
      setAddedPasskeys((current) => [...current.filter((passkey) => passkey.id !== result.data.id), result.data]);
      setRemovedPasskeyIds((current) => current.filter((id) => id !== result.data.id));
      setName("");
    } catch {
      setMessage(REGISTRATION_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: string) {
    if (listUnavailable) return;
    if (visiblePasskeys.length <= 1) {
      setMessage("Add another passkey before removing your only passkey.");
      return;
    }
    if (!window.confirm("Remove this passkey? Make sure you retain another sign-in method.")) return;
    setBusy(true);
    try {
      await verifyBoardPasskey();
      const result = await betterAuthClient.passkey.deletePasskey({ id });
      setMessage(result.error ? "The passkey could not be removed." : "Passkey removed.");
      if (!result.error) {
        setRemovedPasskeyIds((current) => [...new Set([...current, id])]);
        setAddedPasskeys((current) => current.filter((passkey) => passkey.id !== id));
      }
    } catch {
      setMessage("The passkey could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndContinue() {
    setBusy(true);
    setMessage(null);
    try {
      await verifyBoardPasskey();
      setVerified(true);
      setMessage("Passkey verified. Opening the Board portal…");
      router.replace(continueTo);
      router.refresh();
    } catch {
      setMessage(BOARD_PASSKEY_VERIFICATION_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      {firstPasskey ? <p className="rounded-xl bg-[var(--surface-muted)] p-4 text-sm leading-6">No passkeys are registered yet. Create your first passkey using your device, a password manager, or a security key. Then verify it to continue.</p> : null}
      {visiblePasskeys.length > 0 && !verified ? (
        <div className="grid gap-3 rounded-xl bg-[var(--surface-muted)] p-4">
          <p className="text-sm leading-6">Verify one of your registered passkeys to open the Board portal. If you have lost all your passkeys, contact the Board Chair or Executive Director for a reset before adding a replacement.</p>
          <button type="button" onClick={() => void verifyAndContinue()} disabled={busy} className={buttonStyles({ className: "w-fit" })}>Verify passkey to continue</button>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input aria-label="Passkey name (optional)" value={name} onChange={(event) => setName(event.target.value)} placeholder="Passkey name (optional)" disabled={busy || listUnavailable} className="h-11 flex-1 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm" />
        <button type="button" onClick={addPasskey} disabled={busy || listUnavailable} className={buttonStyles({ className: "justify-center disabled:opacity-60" })}><Plus className="h-4 w-4" />{firstPasskey ? "Create your first passkey" : "Add passkey"}</button>
      </div>
      {passkeys.isPending ? <p role="status" className="text-sm text-[var(--muted)]">Loading passkeys…</p> : null}
      {listFailed ? <div className="grid gap-3"><p role="alert" className="text-sm leading-6">We could not load your passkeys. Retry before creating or removing a passkey.</p><button type="button" onClick={() => void passkeys.refetch()} disabled={busy} className={buttonStyles({ variant: "secondary", className: "w-fit" })}>Retry loading passkeys</button></div> : null}
      {visiblePasskeys.length ? (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {visiblePasskeys.map((passkey) => <li key={passkey.id} className="flex items-center justify-between gap-4 p-4"><div className="flex items-center gap-3"><KeyRound className="h-4 w-4" /><div><p className="font-semibold">{passkey.name || "Passkey"}</p><p className="text-xs text-[var(--muted)]">Added {new Date(passkey.createdAt).toLocaleDateString()}</p></div></div><button type="button" disabled={busy || listUnavailable} onClick={() => removePasskey(passkey.id)} className="text-sm font-semibold text-[var(--accent-ink)] underline">Remove</button></li>)}
        </ul>
      ) : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </div>
  );
}
