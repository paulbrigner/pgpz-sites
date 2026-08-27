"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
import { buttonStyles } from "@pgpz/ui";
import { betterAuthClient } from "@/lib/auth-client";
import { verifyBoardPasskey } from "@/lib/step-up-client";

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

  async function addPasskey() {
    setBusy(true);
    setMessage(null);
    try {
      if (visiblePasskeys.length > 0) await verifyBoardPasskey();
      const result = await betterAuthClient.passkey.addPasskey({ name: name.trim() || undefined });
      setMessage(result.error ? "Passkey registration was not completed." : "Passkey registered.");
      if (result.data) {
        setAddedPasskeys((current) => [...current.filter((passkey) => passkey.id !== result.data.id), result.data]);
        setRemovedPasskeyIds((current) => current.filter((id) => id !== result.data.id));
        setName("");
      }
    } catch {
      setMessage("Passkey registration was not completed.");
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: string) {
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey verification was not completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Passkey name (optional)" className="h-11 flex-1 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm" />
        <button type="button" onClick={addPasskey} disabled={busy} className={buttonStyles({ className: "justify-center" })}><Plus className="h-4 w-4" />Add passkey</button>
      </div>
      {passkeys.isPending ? <p className="text-sm text-[var(--muted)]">Loading passkeys…</p> : null}
      {visiblePasskeys.length ? (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {visiblePasskeys.map((passkey) => <li key={passkey.id} className="flex items-center justify-between gap-4 p-4"><div className="flex items-center gap-3"><KeyRound className="h-4 w-4" /><div><p className="font-semibold">{passkey.name || "Passkey"}</p><p className="text-xs text-[var(--muted)]">Added {new Date(passkey.createdAt).toLocaleDateString()}</p></div></div><button type="button" disabled={busy} onClick={() => removePasskey(passkey.id)} className="text-sm font-semibold text-[var(--accent-ink)] underline">Remove</button></li>)}
        </ul>
      ) : !passkeys.isPending ? <p className="rounded-xl bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">No passkeys are registered yet.</p> : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      {visiblePasskeys.length > 0 && !verified ? (
        <button type="button" onClick={() => void verifyAndContinue()} disabled={busy} className={buttonStyles({ className: "w-fit" })}>Verify passkey to continue</button>
      ) : null}
    </div>
  );
}
