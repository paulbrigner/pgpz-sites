"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ProfileState = {
  eligible: boolean;
  published: boolean;
  slug: string;
  suggestedSlug: string;
  profilePath: string | null;
  version: number;
};

export function MemberProfileSettings() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [slug, setSlug] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/profile/member-profile", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Unable to load member profile.");
        if (!cancelled) { setProfile(body); setSlug(body.slug); setPublished(body.published); }
      })
      .catch((reason) => !cancelled && setError(reason.message));
    return () => { cancelled = true; };
  }, []);
  const save = async () => {
    if (!profile) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/profile/member-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, published, version: profile.version }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Unable to save member profile.");
      const next = body.profile as ProfileState;
      setProfile(next); setSlug(next.slug); setPublished(next.published);
      setMessage(next.published ? "Your profile is available to active Coalition members." : "Your member profile is hidden.");
    } catch (reason: any) { setError(reason?.message || "Unable to save member profile."); }
    finally { setSaving(false); }
  };
  return (
    <section id="member-profile" className="rounded-lg border bg-white/80 p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Member profile and directory</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose a protected vanity URL and whether other active Coalition members can see your directory profile.</p>
      {!profile ? <p className="mt-4 text-sm">Loading profile settings…</p> : (
        <div className="mt-5 space-y-4">
          <label className="block space-y-2 text-sm font-medium">Vanity URL<div className="flex items-center rounded-md border bg-white px-3"><span className="text-slate-500">/members/</span><input value={slug} onChange={(event) => setSlug(event.target.value)} className="min-w-0 flex-1 py-2 outline-none" /></div></label>
          <label className="flex gap-3 rounded-lg border bg-white/70 p-4 text-sm leading-6 text-slate-600"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--zcash-gold)]" />Show my name, affiliation, title, email, LinkedIn URL, X handle, and policy interests to active Coalition members.</label>
          <p className="text-xs text-slate-500">This page is protected, is not indexed, and is not visible to signed-out visitors.</p>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
          <div className="flex flex-wrap items-center gap-3"><Button type="button" onClick={save} disabled={saving || (published && !profile.eligible)}>{saving ? "Saving…" : "Save member profile"}</Button>{profile.profilePath ? <Link href={profile.profilePath} className="text-sm font-medium underline">View profile</Link> : null}</div>
        </div>
      )}
    </section>
  );
}
