"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search, UsersRound } from "lucide-react";
import {
  policyInterestGroupLabel,
  policyInterestGroupOptions,
} from "@/lib/policy-interest-groups";

type DirectoryMember = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  xHandle: string | null;
  policyInterestGroups: string[];
};

export default function MembersClient({ initialMembers }: { initialMembers: DirectoryMember[] }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const members = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialMembers.filter((member) => {
      if (group !== "all" && !member.policyInterestGroups.includes(group)) return false;
      if (!needle) return true;
      return [
        member.name,
        member.email,
        member.company,
        member.jobTitle,
        member.xHandle,
        ...member.policyInterestGroups.map(policyInterestGroupLabel),
      ].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [group, initialMembers, query]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-14">
      <section className="coalition-hero">
        <div className="coalition-hero__frame">
          <p className="section-eyebrow text-white/70">Member directory</p>
          <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Find Coalition collaborators.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/78">
            Search members who opted into the directory by organization, role, contact, or policy interest.
          </p>
        </div>
      </section>

      <section className="rounded-lg border bg-white/90 p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_18rem]">
          <label className="relative">
            <span className="sr-only">Search members</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search members, companies, roles..."
              className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm"
            />
          </label>
          <label>
            <span className="sr-only">Filter by policy group</span>
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
            >
              <option value="all">All policy groups</option>
              {policyInterestGroupOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-sm text-slate-500">{members.length} opted-in member{members.length === 1 ? "" : "s"}</p>
      </section>

      {members.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => (
            <article key={member.id} className="rounded-lg border bg-white/90 p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[var(--brand-ink)]">{member.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {[member.jobTitle, member.company].filter(Boolean).join(" at ") || "Coalition member"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {member.policyInterestGroups.map((id) => (
                  <Link
                    key={id}
                    href={`/groups/${id}`}
                    className="rounded-full bg-[var(--zcash-gold-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--zcash-gold-deep)]"
                  >
                    {policyInterestGroupLabel(id)}
                  </Link>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3 text-sm">
                <a className="font-medium text-[var(--brand-denim)] underline" href={`mailto:${member.email}`}>Email</a>
                {member.linkedinUrl ? (
                  <Link className="inline-flex items-center gap-1 font-medium text-[var(--brand-denim)] underline" href={member.linkedinUrl} target="_blank" rel="noopener noreferrer">
                    LinkedIn <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
                {member.xHandle ? (
                  <Link className="font-medium text-[var(--brand-denim)] underline" href={`https://x.com/${member.xHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">
                    {member.xHandle}
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-lg border bg-white/90 p-8 text-center shadow-sm">
          <UsersRound className="mx-auto h-7 w-7 text-slate-400" />
          <h2 className="mt-3 text-lg font-semibold text-[var(--brand-ink)]">No matching members</h2>
          <p className="mt-2 text-sm text-slate-600">Try a broader search or another policy group.</p>
        </section>
      )}
    </div>
  );
}
