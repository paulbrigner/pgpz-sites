import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { ArrowLeft, Download, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getUploadedPolicyUpdateRecord,
  uploadedPolicyUpdateToPolicyUpdate,
} from "@/lib/admin/policy-update-uploads";
import { getMemberAccess } from "@/lib/member-access";
import { isPolicyUpdateRelevantPostImage, policyUpdateImageHref } from "@/lib/policy-update-images";
import { isPgpzProgressSummarySection, progressSummaryItems } from "@/lib/policy-update-progress-summary";
import {
  isPolicyUpdateSocialPostSection,
  policyUpdateSectionHeadingLink,
  splitPolicyUpdateSocialPostHeading,
} from "@/lib/policy-update-sections";
import {
  getPolicyUpdate,
  policyUpdates,
  type PolicyUpdateImage,
  type PolicyUpdateLink,
  type PolicyUpdateSection,
} from "@/lib/policy-updates";

export const dynamic = "force-dynamic";

/* eslint-disable @next/next/no-img-element */

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return policyUpdates.map((update) => ({ slug: update.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const staticUpdate = getPolicyUpdate(slug);
  const uploadedRecord = staticUpdate ? null : await getUploadedPolicyUpdateRecord(slug);
  const update = staticUpdate || (uploadedRecord ? uploadedPolicyUpdateToPolicyUpdate(uploadedRecord) : null);
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

function isRelevantPostsMarker(text: string) {
  return /^Relevant Posts?:$/i.test(text.trim());
}

function PolicyUpdateParagraph({
  paragraph,
  links,
}: {
  paragraph: string;
  links?: PolicyUpdateLink[];
}) {
  if (isRelevantPostsMarker(paragraph)) {
    return <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Relevant Posts</h2>;
  }

  return <p>{renderLinkedText(paragraph, links)}</p>;
}

function hasRelevantPostsMarker(section: PolicyUpdateSection) {
  return [...section.body, ...(section.bodyAfterBullets || [])].some(isRelevantPostsMarker);
}

function hasRelevantPostImages(section: PolicyUpdateSection) {
  return section.images?.some(isPolicyUpdateRelevantPostImage) || false;
}

function PgpzProgressSummaryBlock({ section }: { section: PolicyUpdateSection }) {
  const progressItems = progressSummaryItems(section);

  return (
    <section className="space-y-4">
      <PolicyUpdateSectionHeading section={section} className="text-2xl font-semibold text-[var(--brand-ink)]">
        {section.heading}
      </PolicyUpdateSectionHeading>
      <div className="rounded-lg border border-[rgba(245,168,0,0.42)] bg-[#fff7df] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
        <div className="space-y-4 text-sm leading-7 text-slate-800">
          {section.body.map((paragraph) => (
            <p key={paragraph} className="font-semibold text-[var(--brand-ink)]">
              {renderLinkedText(paragraph, section.links)}
            </p>
          ))}
          {progressItems.length ? (
            <div className="space-y-4">
              {progressItems.map((summary) => {
                return (
                  <div key={summary.label} className="space-y-2">
                    <p className="font-semibold text-[var(--brand-ink)]">{summary.label}</p>
                    {summary.details?.length ? (
                      <ul className="list-disc space-y-1 pl-6">
                        {summary.details.map((detail) => (
                          <li key={detail.text}>
                            {renderLinkedText(detail.text, section.links)}
                            {detail.children?.length ? (
                              <ul className="mt-1 list-disc space-y-1 pl-6">
                                {detail.children.map((child) => (
                                  <li key={child}>{renderLinkedText(child, section.links)}</li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PolicyUpdateSectionImages({
  images,
  imageHrefFallback,
  variant = "default",
}: {
  images: PolicyUpdateImage[];
  imageHrefFallback?: string | null;
  variant?: "default" | "social";
}) {
  const isSocial = variant === "social";

  return (
    <div className={isSocial ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>
      {images.map((image) => {
        const href = policyUpdateImageHref(image, imageHrefFallback);
        const isCompact =
          typeof image.width === "number" &&
          typeof image.height === "number" &&
          image.width <= 500 &&
          image.height <= 500;
        return (
          <figure
            key={image.src}
            className={[
              "overflow-hidden rounded-2xl border border-[rgba(245,168,0,0.28)] p-3",
              isSocial ? "mx-auto max-w-[44rem] bg-white" : "bg-[var(--brand-ice)]",
              !isSocial && isCompact ? "max-w-xs" : "",
              !isSocial && !isCompact ? "sm:col-span-2" : "",
            ].join(" ")}
          >
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="block">
                <PolicyUpdateImageElement image={image} isCompact={isCompact} isSocial={isSocial} />
              </a>
            ) : (
              <PolicyUpdateImageElement image={image} isCompact={isCompact} isSocial={isSocial} />
            )}
          </figure>
        );
      })}
    </div>
  );
}

function PolicyUpdateImageElement({
  image,
  isCompact,
  isSocial,
}: {
  image: PolicyUpdateImage;
  isCompact: boolean;
  isSocial: boolean;
}) {
  return (
    <img
      src={image.src}
      alt={image.alt}
      width={image.width}
      height={image.height}
      className={[
        "mx-auto h-auto w-full rounded-xl border border-slate-200 bg-white object-contain",
        isSocial ? "max-h-[38rem]" : isCompact ? "max-w-[15rem]" : "max-h-[34rem]",
      ].join(" ")}
      loading="lazy"
    />
  );
}

function PolicyUpdateSectionHeading({
  section,
  children,
  className,
}: {
  section: PolicyUpdateSection;
  children: ReactNode;
  className: string;
}) {
  const headingLink = policyUpdateSectionHeadingLink(section);

  return (
    <h2 className={className}>
      {headingLink ? (
        <a
          href={headingLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--brand-ink)] underline decoration-[var(--zcash-gold)] decoration-2 underline-offset-4 hover:text-[var(--brand-denim)]"
        >
          {children}
        </a>
      ) : (
        children
      )}
    </h2>
  );
}

function PolicyUpdateSectionBlock({
  section,
}: {
  section: PolicyUpdateSection;
}) {
  if (isPgpzProgressSummarySection(section)) {
    return <PgpzProgressSummaryBlock section={section} />;
  }

  const socialHeading = splitPolicyUpdateSocialPostHeading(section.heading);
  const isSocialPostSection = isPolicyUpdateSocialPostSection(section);
  const heading = socialHeading?.title || (socialHeading ? "" : section.heading);
  const headingLink = policyUpdateSectionHeadingLink(section);
  const imageHrefFallback = headingLink?.href || section.links?.[0]?.href || null;
  const renderRelevantPostsImageLabel = !hasRelevantPostsMarker(section) && hasRelevantPostImages(section);

  if (isSocialPostSection) {
    return (
      <section className="space-y-5 border-l-4 border-[var(--zcash-gold)] bg-[var(--brand-ice)] px-5 py-5">
        <p className="section-eyebrow text-[var(--brand-denim)]">{socialHeading?.label || "Source post"}</p>
        {section.images?.length ? (
          <PolicyUpdateSectionImages images={section.images} imageHrefFallback={imageHrefFallback} variant="social" />
        ) : null}
        {heading || section.body.length ? (
          <div className="space-y-4">
            {heading ? (
              <PolicyUpdateSectionHeading
                section={section}
                className="text-xl font-semibold leading-snug text-[var(--brand-ink)] lg:text-2xl"
              >
                {heading}
              </PolicyUpdateSectionHeading>
            ) : null}
            <div className="space-y-4 text-sm leading-7 text-slate-700">
              {section.body.map((paragraph) => (
                <PolicyUpdateParagraph key={paragraph} paragraph={paragraph} links={section.links} />
              ))}
            </div>
          </div>
        ) : null}
        {section.table ? (
          <PolicyUpdateTable table={section.table} />
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
              <PolicyUpdateParagraph key={paragraph} paragraph={paragraph} links={section.links} />
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <PolicyUpdateSectionHeading section={section} className="text-2xl font-semibold text-[var(--brand-ink)]">
        {section.heading}
      </PolicyUpdateSectionHeading>
      <div className="space-y-4 text-sm leading-7 text-slate-700">
        {section.body.map((paragraph) => (
          <PolicyUpdateParagraph key={paragraph} paragraph={paragraph} links={section.links} />
        ))}
      </div>
      {renderRelevantPostsImageLabel ? (
        <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Relevant Posts</h2>
      ) : null}
      {section.images?.length ? (
        <PolicyUpdateSectionImages images={section.images} imageHrefFallback={imageHrefFallback} />
      ) : null}
      {section.table ? <PolicyUpdateTable table={section.table} /> : null}
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
            <PolicyUpdateParagraph key={paragraph} paragraph={paragraph} links={section.links} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PolicyUpdateTable({ table }: { table: NonNullable<PolicyUpdateSection["table"]> }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[rgba(245,168,0,0.28)] bg-white">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[0.82rem] leading-6 lg:min-w-0">
        <colgroup>
          <col style={{ width: "29%" }} />
          <col style={{ width: "33%" }} />
          <col style={{ width: "38%" }} />
        </colgroup>
        <thead className="bg-[var(--brand-ink)] text-white">
          <tr>
            {table.columns.map((column) => (
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
          {table.rows.map((row) => (
            <tr key={row.join("|")} className="border-t border-slate-200">
              {row.map((cell, index) => (
                <td
                  key={`${row[0]}-${index}`}
                  className="whitespace-pre-line break-words align-top border-r border-slate-200 px-4 py-4 text-slate-700 last:border-r-0"
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
  );
}

export default async function UpdateDetailPage({ params }: Props) {
  const { slug } = await params;
  const staticUpdate = getPolicyUpdate(slug);
  const uploadedRecord = staticUpdate ? null : await getUploadedPolicyUpdateRecord(slug);
  const update = staticUpdate || (uploadedRecord ? uploadedPolicyUpdateToPolicyUpdate(uploadedRecord) : null);
  if (!update) notFound();

  const access = await getMemberAccess();
  const isAdmin = access.user?.isAdmin === true;
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(update.portalPath)}`);
  }

  if (uploadedRecord?.visibilityStatus !== "published" && !isAdmin) {
    notFound();
  }

  if (!access.isMember && !isAdmin) {
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

      {uploadedRecord && uploadedRecord.visibilityStatus !== "published" && isAdmin ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
          <span className="font-semibold">
            {uploadedRecord.visibilityStatus === "draft" ? "Draft preview" : "Unpublished preview"}:
          </span>{" "}
          only admins can view this page and its PDF until the update is published from the admin update
          distribution screen.
        </div>
      ) : null}

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
            <img
              src={update.coverImage}
              alt={`${update.shortTitle} cover`}
              className="h-full min-h-[18rem] w-full object-contain p-4"
            />
          </div>
        </header>

        <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.36fr)] lg:p-8">
          <div className="order-2 space-y-8 lg:order-1">
            {update.sections.map((section, index) => (
              <Fragment key={`${section.heading}-${index}`}>
                {index > 0 ? (
                  <hr className="border-0 border-t border-[rgba(245,168,0,0.34)]" aria-hidden="true" />
                ) : null}
                <PolicyUpdateSectionBlock section={section} />
              </Fragment>
            ))}
          </div>

          <aside className="order-1 space-y-5 lg:order-2">
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
