"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MemberDirectoryEntry } from "@pgpz/member-directory";

export default function MembersClient({ initialMembers }: { initialMembers: MemberDirectoryEntry[] }) {
  const [query, setQuery] = useState("");
  const members = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? initialMembers.filter((member) => [member.name, member.headline, member.bio, member.xHandle].some((value) => value?.toLowerCase().includes(needle)))
      : initialMembers;
  }, [initialMembers, query]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-14">
      <section className="glass-surface p-8">
        <p className="section-eyebrow">Member directory</p>
        <h1 className="mt-3 text-4xl font-semibold">Meet Community members.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Only active members can see profiles whose owners explicitly opted in.</p>
      </section>
      <label className="rounded-lg border bg-white/90 p-5 shadow-sm">
        <span className="sr-only">Search members</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members…" className="h-10 w-full rounded-md border bg-white px-3 text-sm" />
      </label>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => (
          <article key={member.slug} className="rounded-lg border bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-semibold"><Link href={`/members/${member.slug}`} className="underline-offset-4 hover:underline">{member.name}</Link></h2>
            <p className="mt-1 text-sm text-slate-600">{member.headline || "Community member"}</p>
            {member.bio ? <p className="mt-4 text-sm leading-6 text-slate-600">{member.bio}</p> : null}
          </article>
        ))}
      </section>
      {!members.length ? <p className="rounded-lg border bg-white/90 p-8 text-center text-sm text-slate-600">No matching opted-in members.</p> : null}
    </div>
  );
}
