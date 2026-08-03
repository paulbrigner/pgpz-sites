"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { buttonStyles } from "@pgpz/ui";
import { signOut } from "@/lib/auth-client";

export function SignOutButton({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    const result = await signOut();
    // Better Auth resolves the sign-out request; only treat an explicit
    // error result as failure so we never redirect as if it succeeded.
    if (result?.error) {
      setError("Sign-out failed. Please try again.");
      setSigningOut(false);
      return;
    }
    router.push("/signin");
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className={buttonStyles({ variant: "outline", size: "sm", className: "disabled:opacity-60" })}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        {signingOut ? "Signing out…" : label}
      </button>
      {error ? (
        <span role="alert" className="text-xs font-semibold text-red-700">{error}</span>
      ) : null}
    </span>
  );
}
