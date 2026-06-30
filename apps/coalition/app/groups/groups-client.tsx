"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  normalizePolicyInterestGroups,
  policyInterestGroupOptions,
  policyInterestGroupPath,
} from "@/lib/policy-interest-groups";
import { cn } from "@/lib/utils";
import { useAppSession } from "@/lib/use-app-session";

type Props = {
  displayName: string;
  initialSelected: string[];
};

const sameSelection = (a: string[], b: string[]) => a.join(",") === b.join(",");

export default function GroupsClient({ displayName, initialSelected }: Props) {
  const { update } = useAppSession();
  const [selected, setSelected] = useState(() => normalizePolicyInterestGroups(initialSelected));
  const [savedSelected, setSavedSelected] = useState(() => normalizePolicyInterestGroups(initialSelected));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changed = !sameSelection(selected, savedSelected);

  const toggleGroup = (groupId: string, checked: boolean) => {
    setNotice(null);
    setError(null);
    setSelected((current) => {
      const next = checked ? [...current, groupId] : current.filter((id) => id !== groupId);
      return normalizePolicyInterestGroups(next);
    });
  };

  const saveSelections = async () => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/profile/policy-interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyInterestGroups: selected }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save policy groups");
      const saved = normalizePolicyInterestGroups(body?.policyInterestGroups);
      setSelected(saved);
      setSavedSelected(saved);
      setNotice("Policy groups saved.");
      await update({});
    } catch (err: any) {
      setError(err?.message || "Could not save policy groups");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="coalition-hero">
        <div className="coalition-hero__frame">
          <div className="max-w-3xl space-y-5">
            <p className="section-eyebrow text-white/70">Policy groups</p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Topic workspaces for member coordination.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-white/78">
              Pick the areas where you want to participate, then open the topic pages for policy context and coordination.
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-[var(--zcash-gold-soft)]">
              <span className="rounded-full border border-white/20 px-3 py-1">
                {selected.length} selected
              </span>
              <span className="rounded-full border border-white/20 px-3 py-1">
                {displayName}
              </span>
            </div>
          </div>
        </div>
      </section>

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <section className="rounded-lg border bg-white/90 p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="section-eyebrow text-[var(--brand-denim)]">Selections</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">Your policy groups</h2>
          </div>
          <Button type="button" disabled={!changed || saving} isLoading={saving} onClick={saveSelections}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save groups
          </Button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {policyInterestGroupOptions.map((group) => {
            const checked = selected.includes(group.id);
            return (
              <article
                key={group.id}
                className={cn(
                  "rounded-lg border bg-white p-4 transition",
                  checked
                    ? "border-[rgba(47,111,104,0.48)] shadow-[0_16px_32px_-28px_rgba(16,40,39,0.46)]"
                    : "border-slate-200",
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    id={`group-${group.id}`}
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => toggleGroup(group.id, event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[var(--zcash-gold)]"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`group-${group.id}`} className="cursor-pointer text-lg font-semibold text-[var(--brand-ink)]">
                      {group.label}
                    </label>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{group.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {group.focusAreas.map((focus) => (
                        <span
                          key={focus}
                          className="rounded-full border border-[rgba(245,168,0,0.28)] bg-[var(--zcash-gold-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--zcash-gold-deep)]"
                        >
                          {focus}
                        </span>
                      ))}
                    </div>
                    <Link
                      href={policyInterestGroupPath(group.id)}
                      className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-denim)] underline"
                    >
                      Open topic page
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                  {checked ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--brand-teal)]" aria-hidden="true" /> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
