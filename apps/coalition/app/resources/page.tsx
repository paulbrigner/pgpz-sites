import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Library } from "lucide-react";
import ResourceSubmissionForm from "@/components/resources/ResourceSubmissionForm";
import { getMemberAccess } from "@/lib/member-access";
import { listApprovedResourceSubmissions } from "@/lib/resource-submissions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Member Resources | PGPZ Coalition",
  description: "Resources reviewed and approved for PGPZ Coalition members.",
};

export default async function ResourcesPage() {
  const access = await getMemberAccess();
  if (!access.authenticated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/resources")}`);
  }
  if (!access.isMember) redirect("/");
  const resources = await listApprovedResourceSubmissions();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-14">
      <section className="coalition-hero">
        <div className="coalition-hero__frame">
          <p className="section-eyebrow text-white/70">Member library</p>
          <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">
            Reviewed Coalition resources.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/78">
            Member submissions appear here after an administrator reviews and approves them.
          </p>
        </div>
      </section>

      <section
        id="submit-resource"
        aria-labelledby="submit-resource-heading"
        className="glass-surface p-5 sm:p-6 lg:p-8"
      >
        <p className="section-eyebrow text-[var(--brand-denim)]">Share a resource</p>
        <h2
          id="submit-resource-heading"
          className="mt-3 text-2xl font-semibold text-[var(--brand-ink)]"
        >
          Submit a resource for review
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Share useful policy research, meeting context, partner updates, or campaign materials.
          A PGPZ administrator will review each submission before it appears in the member library.
        </p>
        <ResourceSubmissionForm />
      </section>

      <section aria-labelledby="approved-resources-heading" className="space-y-4">
        <div>
          <p className="section-eyebrow text-[var(--brand-denim)]">Member library</p>
          <h2
            id="approved-resources-heading"
            className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]"
          >
            Approved resources
          </h2>
        </div>
        {resources.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {resources.map((resource) => (
              <article
                key={resource.id}
                className="rounded-lg border bg-white/90 p-5 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-[var(--brand-ink)]">
                  {resource.title}
                </h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {resource.details}
                </p>
                {resource.url ? (
                  <Link
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand-denim)] underline"
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open resource <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-white/90 p-8 text-center shadow-sm">
            <Library className="mx-auto h-7 w-7 text-slate-400" />
            <h3 className="mt-3 text-lg font-semibold text-[var(--brand-ink)]">
              No approved resources yet
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Approved member submissions will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
