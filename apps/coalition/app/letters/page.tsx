import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CheckCircle2, FileSignature } from "lucide-react";
import { LetterSummaryMarkdown } from "@/components/letters/LetterSummaryMarkdown";
import { isFeatureEnabled } from "@/config/features";
import { formatLetterDate } from "@/lib/letter-date";
import { getMemberAccess } from "@/lib/member-access";
import {
  listLetterCampaigns,
  listLetterSignOns,
} from "@/lib/letter-signons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coalition letters | PGPZ Coalition",
  description:
    "Review PGPZ Coalition letters, formally sign on, and follow delivery status.",
};

export default async function LettersPage() {
  if (!isFeatureEnabled("letterSignons")) redirect("/");
  const access = await getMemberAccess();
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/letters")}`);
  }
  if (!access.isMember) {
    return (
      <div className="mx-auto w-full max-w-4xl px-5 pb-14">
        <section className="glass-surface p-8">
          <FileSignature
            className="h-7 w-7 text-[var(--brand-denim)]"
            aria-hidden="true"
          />
          <h1 className="mt-4 text-3xl font-semibold text-[var(--brand-ink)]">
            Active membership required
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Coalition letter review and sign-on records are available to active
            PGPZ Coalition members.
          </p>
        </section>
      </div>
    );
  }

  const campaigns = (
    await listLetterCampaigns()
  ).filter(
    (campaign) =>
      campaign.status !== "draft" && campaign.status !== "archived",
  );
  const cards = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      signerCount: (await listLetterSignOns(campaign)).filter(
        (signOn) => signOn.current,
      ).length,
    })),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-16">
      <header className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--brand-denim)]">
          Coalition action
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--brand-ink)] sm:text-5xl">
          Letters and sign-ons
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Review the exact draft, add your individual or organization sign-on,
          and return here for revision and delivery updates.
        </p>
      </header>

      {cards.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {cards.map(({ campaign, signerCount }) => (
            <Link
              key={campaign.id}
              href={`/letters/${campaign.slug}`}
              className="glass-surface group block p-6 transition hover:-translate-y-0.5 hover:border-[rgba(47,111,104,0.52)] hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-full bg-[var(--brand-ink)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--zcash-gold)]">
                  {campaign.effectiveStatus}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {signerCount} {signerCount === 1 ? "signer" : "signers"}
                </span>
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-[var(--brand-ink)] group-hover:text-[var(--brand-denim)]">
                {campaign.title}
              </h2>
              {campaign.summary ? (
                <LetterSummaryMarkdown
                  compact
                  disableLinks
                  className="mt-3 max-h-[4.5rem] overflow-hidden"
                >
                  {campaign.summary}
                </LetterSummaryMarkdown>
              ) : null}
              <p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Sign-on deadline: {formatLetterDate(campaign.deadlineAt)}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <section className="glass-surface p-8 text-center">
          <FileSignature
            className="mx-auto h-8 w-8 text-slate-400"
            aria-hidden="true"
          />
          <h2 className="mt-4 text-xl font-semibold text-[var(--brand-ink)]">
            No letters are open for review
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            New Coalition sign-on opportunities will appear here.
          </p>
        </section>
      )}
    </div>
  );
}
