"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { buttonStyles } from "@pgpz/ui";
import { signOut } from "@/lib/auth-client";

export function SignOutButton({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/signin");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className={buttonStyles({ variant: "outline", size: "sm", className: "disabled:opacity-60" })}
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
      {signingOut ? "Signing out…" : label}
    </button>
  );
}
