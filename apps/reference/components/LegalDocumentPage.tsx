import { Badge, Container, Surface } from "@pgpz/ui";
import type { ReferenceLegalDocument } from "@/content/legal";

export function LegalDocumentPage({ document }: { document: ReferenceLegalDocument }) {
  return (
    <Container className="pb-20 pt-8 sm:pt-12">
      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-6 py-8 sm:px-10 sm:py-10">
          <Badge tone="accent">{document.eyebrow}</Badge>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
            {document.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">{document.summary}</p>
        </div>
        <div className="grid gap-9 px-6 py-9 sm:px-10 sm:py-12">
          {document.sections.map((section) => (
            <section key={section.title} className="grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">{section.title}</h2>
              <div className="space-y-4">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-7 text-[var(--muted)]">{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Surface>
    </Container>
  );
}
