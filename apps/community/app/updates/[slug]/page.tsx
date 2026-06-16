import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMemberAccess } from "@/lib/member-access";
import { getPolicyUpdate, policyUpdates } from "@/lib/policy-updates";

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 pb-14">
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

        <div className="grid gap-6 p-6 lg:grid-cols-[0.72fr_0.28fr] lg:p-8">
          <div className="space-y-8">
            {update.sections.map((section) => (
              <section key={section.heading} className="space-y-4">
                <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">{section.heading}</h2>
                <div className="space-y-4 text-sm leading-7 text-slate-700">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.table ? (
                  <div className="overflow-x-auto rounded-2xl border border-[rgba(245,168,0,0.28)] bg-white">
                    <table className="min-w-[720px] border-collapse text-left text-sm leading-6">
                      <thead className="bg-[var(--brand-ink)] text-white">
                        <tr>
                          {section.table.columns.map((column) => (
                            <th
                              key={column}
                              scope="col"
                              className="border-r border-white/15 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] last:border-r-0"
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
                                className="align-top border-r border-slate-200 px-4 py-4 text-slate-700 last:border-r-0"
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
              </section>
            ))}
          </div>

          <aside className="space-y-5">
            <div className="rounded-2xl border bg-[var(--brand-ice)] p-5">
              <p className="section-eyebrow text-[var(--brand-denim)]">Key takeaways</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                {update.keyTakeaways.map((item) => (
                  <li key={item} className="border-b border-[rgba(245,168,0,0.18)] pb-3 last:border-b-0 last:pb-0">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <p className="section-eyebrow text-[var(--brand-denim)]">Action items</p>
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
