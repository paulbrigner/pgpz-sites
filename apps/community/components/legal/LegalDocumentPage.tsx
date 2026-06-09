import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { LegalDocument } from "@/lib/legal";
import { COMMUNITY_GUIDELINES_PATH, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal-config";
import { Button } from "@/components/ui/button";

type Props = {
  document: LegalDocument;
};

export function LegalDocumentPage({ document }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5">
      <section className="glass-surface p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <p className="section-eyebrow text-[var(--brand-denim)]">{document.eyebrow}</p>
            <h1 className="text-3xl font-semibold text-[var(--brand-ink)] sm:text-4xl">
              {document.title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              {document.description}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={document.pdfPath} target="_blank" rel="noopener noreferrer">
              View PDF
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="muted-card p-6 sm:p-8">
        <div className="flex flex-wrap gap-3 border-b border-[rgba(245,168,0,0.22)] pb-5 text-sm">
          <Link className="font-medium text-[var(--brand-denim)] underline" href={TERMS_PATH}>
            Terms of Service
          </Link>
          <span className="text-slate-400">/</span>
          <Link className="font-medium text-[var(--brand-denim)] underline" href={PRIVACY_PATH}>
            Privacy Policy
          </Link>
          <span className="text-slate-400">/</span>
          <Link className="font-medium text-[var(--brand-denim)] underline" href={COMMUNITY_GUIDELINES_PATH}>
            Community Guidelines
          </Link>
        </div>

        <div className="mt-7 space-y-8">
          {document.sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-xl font-semibold text-[var(--brand-ink)]">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-7 text-slate-600">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
