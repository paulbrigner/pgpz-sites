"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function ProfileSettingsPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const ready = status !== "loading";
  const authenticated = status === "authenticated";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [initial, setInitial] = useState<
    { firstName: string; lastName: string; xHandle: string; linkedinUrl: string } | null
  >(null);

  const sessionUser = session?.user as any | undefined;
  const currentEmail = typeof sessionUser?.email === "string" ? sessionUser.email : "";

  useEffect(() => {
    if (!authenticated || !sessionUser) return;
    const next = {
      firstName: (sessionUser.firstName as string) || "",
      lastName: (sessionUser.lastName as string) || "",
      xHandle: (sessionUser.xHandle as string) || "",
      linkedinUrl: (sessionUser.linkedinUrl as string) || "",
    };
    setFirstName(next.firstName);
    setLastName(next.lastName);
    setXHandle(next.xHandle);
    setLinkedinUrl(next.linkedinUrl);
    setNewEmail(currentEmail || "");
    setInitial(next);
  }, [authenticated, sessionUser, currentEmail]);

  useEffect(() => {
    try {
      router.prefetch("/");
    } catch {
      // ignore prefetch errors
    }
  }, [router]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      if (!firstName.trim()) throw new Error("First name is required");
      if (!lastName.trim()) throw new Error("Last name is required");
      if (linkedinUrl.trim()) {
        try {
          const url = new URL(linkedinUrl.trim());
          if (!/^https?:$/.test(url.protocol)) throw new Error();
        } catch {
          throw new Error("LinkedIn URL must be http(s)");
        }
      }
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          xHandle: xHandle.trim(),
          linkedinUrl: linkedinUrl.trim(),
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || res.statusText || "Update failed");
      }
      const next = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        xHandle: xHandle.trim(),
        linkedinUrl: linkedinUrl.trim(),
      };
      setMessage("Profile updated");
      setInitial(next);
      await update({});
    } catch (err: any) {
      setError(err?.message || "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  };

  const isDirty = () => {
    if (!initial) return false;
    return (
      firstName.trim() !== initial.firstName ||
      lastName.trim() !== initial.lastName ||
      xHandle.trim() !== initial.xHandle ||
      linkedinUrl.trim() !== initial.linkedinUrl
    );
  };

  const onRequestEmailChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailSubmitting(true);
    setEmailMessage(null);
    setEmailError(null);
    try {
      const target = newEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
        throw new Error("Enter a valid email address.");
      }
      if (currentEmail && target === currentEmail.toLowerCase()) {
        throw new Error("Enter a different email to change it.");
      }
      const res = await fetch("/api/profile/request-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || res.statusText || "Failed to send verification email");
      }
      setEmailMessage("Check your new email for a confirmation link. We will switch your account after you verify.");
    } catch (err: any) {
      setEmailError(err?.message || "Failed to start email change");
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleBack = () => {
    if (isDirty()) {
      const proceed = confirm("You have unsaved changes. Leave without saving?");
      if (!proceed) return;
    }
    router.push("/");
  };

  if (!ready) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!authenticated) {
    return (
      <div className="space-y-4">
        <p>You need to sign in to edit your profile.</p>
        <Button onClick={() => router.push("/signin?callbackUrl=/settings/profile")}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleBack}>
          Back to Home
        </Button>
      </div>

      {message ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-lg border bg-white/80 p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Profile information</h2>
          <p className="text-sm text-muted-foreground">
            Keep your contact and social details current for PGPZ community membership and updates.
          </p>
        </div>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="firstName" className="text-sm font-medium">
                First name
              </label>
              <input
                id="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="lastName" className="text-sm font-medium">
                Last name
              </label>
              <input
                id="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="xHandle" className="text-sm font-medium">
              X handle
            </label>
            <input
              id="xHandle"
              value={xHandle}
              onChange={(event) => setXHandle(event.target.value)}
              placeholder="@handle"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="linkedin" className="text-sm font-medium">
              LinkedIn URL
            </label>
            <input
              id="linkedin"
              value={linkedinUrl}
              onChange={(event) => setLinkedinUrl(event.target.value)}
              placeholder="https://www.linkedin.com/in/username"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save changes"}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border bg-white/80 p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Email</h2>
          <p className="text-sm text-muted-foreground">
            Current email: {currentEmail ? <span className="font-mono">{currentEmail}</span> : "Not set"}.
            We will send a confirmation link to the new address before switching your account.
          </p>
        </div>
        {emailMessage ? (
          <Alert className="mt-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Verification sent</AlertTitle>
            <AlertDescription>{emailMessage}</AlertDescription>
          </Alert>
        ) : null}
        {emailError ? (
          <Alert className="mt-4" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{emailError}</AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={onRequestEmailChange} className="mt-5 space-y-3">
          <div className="space-y-2">
            <label htmlFor="newEmail" className="text-sm font-medium">
              New email
            </label>
            <input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={emailSubmitting}>
            {emailSubmitting ? "Sending..." : "Send verification link"}
          </Button>
          <p className="text-xs text-muted-foreground">
            After you click the link we send, sign in again with the new email.
          </p>
        </form>
      </section>
    </div>
  );
}
