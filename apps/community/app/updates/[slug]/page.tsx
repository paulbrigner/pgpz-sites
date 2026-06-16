import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Download, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMemberAccess } from "@/lib/member-access";
import { getPolicyUpdate, policyUpdates, type PolicyUpdateLink, type PolicyUpdateSection } from "@/lib/policy-updates";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return policyUpdates.map((update) => ({ slug: update.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const update = getPolicyUpdate(slug);
  if (!update) return {};
  return {
    title: `${update.shortTitle} | PGPZ Community`,
    description: update.summary,
  };
}

function MembershipRequired() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5">
      <section className="glass-surface p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <p className="section-eyebrow text-[var(--brand-denim)]">Member update</p>
            <h1 className="text-3xl font-semibold text-[var(--brand-ink)]">Membership required</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              This policy update is available to active PGPZ Community members.
              Complete membership verification from the home page to read the full update.
            </p>
            <Button asChild>
              <Link href="/">Return to member home</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function renderLinkedText(text: string, links: PolicyUpdateLink[] = []) {
  const matches = links
    .map((link) => ({ link, index: text.indexOf(link.text) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (!matches.length) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;

  matches.forEach(({ link, index }, matchIndex) => {
    if (index < cursor) return;

    if (index > cursor) nodes.push(text.slice(cursor, index));

    nodes.push(
      <a
        key={`${link.href}-${matchIndex}`}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[var(--brand-denim)] underline decoration-[rgba(245,168,0,0.5)] underline-offset-4 hover:text-[var(--brand-ink)]"
      >
        {link.text}
      </a>,
    );

    cursor = index + link.text.length;
  });

  if (cursor < text.length) nodes.push(text.slice(cursor));

  return nodes;
}

function PolicyUpdateSectionBlock({
  section,
}: {
  section: PolicyUpdateSection;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">{section.heading}</h2>
      <div className="space-y-4 text-sm leading-7 text-slate-700">
        {section.body.map((paragraph) => (
          <p key={paragraph}>{renderLinkedText(paragraph, section.links)}</p>
        ))}
      </div>
      {section.table ? (
        <div className="overflow-x-auto rounded-2xl border border-[rgba(245,168,0,0.28)] bg-white">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[0.82rem] leading-6 lg:min-w-0">
            <colgroup>
              <col style={{ width: "29%" }} />
              <col style={{ width: "33%" }} />
              <col style={{ width: "38%" }} />
            </colgroup>
            <thead className="bg-[var(--brand-ink)] text-white">
              <tr>
                {section.table.columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="break-words border-r border-white/15 px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] last:border-r-0"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row) => (
                <tr key={row.join("|")} className="border-t border-slate-200">
                  {row.map((cell, index) => (
                    <td
                      key={`${row[0]}-${index}`}
                      className="break-words align-top border-r border-slate-200 px-4 py-4 text-slate-700 last:border-r-0"
                    >
                      {index === 0 ? (
                        <span className="font-semibold text-[var(--brand-ink)]">{cell}</span>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {section.bullets?.length ? (
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700">
          {section.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {section.bodyAfterBullets?.length ? (
        <div className="space-y-4 text-sm leading-7 text-slate-700">
          {section.bodyAfterBullets.map((paragraph) => (
            <p key={paragraph}>{renderLinkedText(paragraph, section.links)}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default async function UpdateDetailPage({ params }: Props) {
  const { slug } = await params;
  const update = getPolicyUpdate(slug);
  if (!update) notFound();

  const access = await getMemberAccess();
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(update.portalPath)}`);
  }

  if (!access.isMember) {
    return <MembershipRequired />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-14">
      <div>
        <Button variant="outline" asChild>
          <Link href="/updates">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to archive
          </Link>
        </Button>
      </div>

      <article className="overflow-hidden rounded-[1.5rem] border border-[rgba(245,168,0,0.28)] bg-white shadow-[0_26px_46px_-30px_rgba(30,30,30,0.38)]">
        <header className="grid gap-6 bg-[linear-gradient(135deg,var(--brand-ink),#2A2111)] p-6 text-white lg:grid-cols-[1fr_0.36fr] lg:p-8">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[rgba(245,168,0,0.16)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--zcash-gold-soft)]">
                {update.categoryLabel}
              </span>
              <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                {update.displayDate}
              </span>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight">{update.title}</h1>
            <p className="max-w-3xl text-base leading-7 text-white/78">{update.summary}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                className="bg-[var(--zcash-gold)] text-[var(--brand-ink)] hover:bg-[var(--zcash-gold-soft)]"
                asChild
              >
                <Link href={update.pdfHref} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Open PDF resource
                </Link>
              </Button>
            </div>
          </div>
          <div className="relative min-h-[18rem] overflow-hidden rounded-2xl border border-white/20 bg-white/95">
            <Image
              src={update.coverImage}
              alt={`${update.shortTitle} cover`}
              fill
              sizes="(min-width: 1024px) 300px, 100vw"
              className="object-contain p-4"
              priority
            />
          </div>
        </header>

        <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.36fr)] lg:p-8">
          <div className="space-y-8">
            {update.sections.map((section, index) => (
              <PolicyUpdateSectionBlock key={`${section.heading}-${index}`} section={section} />
            ))}
          </div>

          <aside className="space-y-5">
            <div className="rounded-2xl border bg-[var(--brand-ice)] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-denim)]">Key takeaways</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                {update.keyTakeaways.map((item) => (
                  <li key={item} className="border-b border-[rgba(245,168,0,0.18)] pb-3 last:border-b-0 last:pb-0">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-denim)]">Action items</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                {update.actionItems.map((item) => (
                  <li key={item} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}
