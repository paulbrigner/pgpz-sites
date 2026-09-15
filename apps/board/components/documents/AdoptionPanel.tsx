import { Download, ShieldCheck } from "lucide-react";
import { orderedDocumentAdoptions, type LibraryDocument } from "@/lib/document-library";

function adoptionDate(value: string) {
  return new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
}

export function AdoptionPanel({ document }: { document: LibraryDocument }) {
  const adoptions = orderedDocumentAdoptions(document);
  const approved = adoptions[0];
  if (!approved) return null;
  const latestAdopted = adoptions.some((item) => item.versionId === document.currentVersionId);
  return <section aria-label={`Board-approved copy of ${document.title}`} className="mx-4 mb-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 sm:mx-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-semibold text-emerald-950"><ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />Board-approved copy · v{approved.sequence}</p>
        <p className="mt-1 text-sm text-emerald-950">Adopted {adoptionDate(approved.adoptedAt)} Eastern · {approved.signatureCount} of {approved.directorCount} director consents</p>
        {adoptions.length > 1 && <p className="mt-1 text-xs text-[var(--muted)]">Most recent Board approval. Earlier approvals are retained below.</p>}
      </div>
      <a href={approved.packetHref} className="inline-flex max-w-full items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]"><Download className="h-4 w-4 shrink-0" aria-hidden="true" />Download approved copy with signatures</a>
    </div>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm"><strong>Effective date / conditions:</strong> {approved.effectiveTerms || "See the signed resolution."}</p>
    {document.inEffect && document.inEffect.versionId !== approved.versionId && <p className="mt-2 text-sm">The separately designated in-effect copy is version {document.inEffect.sequence}.</p>}
    {!latestAdopted && <p className="mt-2 text-sm">The latest upload is not the Board-approved copy. This download uses the approved version {approved.sequence}.</p>}
    <p className="mt-2 text-xs text-[var(--muted)]">Includes the approved document, resolution and signed consents. Downloads as a PDF where supported, otherwise as a ZIP.</p>
    <details className="mt-3 border-t border-emerald-200 pt-3">
    <summary className="cursor-pointer text-sm font-semibold text-[var(--primary)]">Adoption records · {latestAdopted ? "latest upload adopted" : "earlier version adopted"}</summary>
    {!latestAdopted && <p className="mt-3 text-sm">The latest upload has no linked adoption record. Uploading a revision does not adopt it or supersede an earlier adopted version.</p>}
    <ul className="mt-3 grid gap-3">{adoptions.map((item) => <li key={`${item.meetingId}:${item.resolutionId}`} className="min-w-0 rounded-lg bg-white/85 p-3 text-sm">
      <p className="font-semibold">Version {item.sequence} · Adopted by unanimous written consent</p>
      <p className="mt-1">Adopted {new Date(item.adoptedAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })} · {item.signatureCount} of {item.directorCount} director consents</p>
      <p className="mt-1">{item.resolutionTitle}</p>
      <p className="mt-2 whitespace-pre-wrap break-words"><strong>Effective date / conditions:</strong> {item.effectiveTerms || "See the resolution. Adoption does not establish that implementation conditions have been met."}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-semibold underline underline-offset-4">
        <a href={item.originalHref}>Open adopted version</a>
        <a href={item.recordHref} target="_blank" rel="noreferrer">View resolution and signatures</a>
        <a href={item.packetHref}>Download version {item.sequence} with signatures</a>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">The packet reproduces existing consents; it adds no new signature or Secretary certification. PDF packets include the approved document and signature appendix; other formats use a ZIP packet.</p>
    </li>)}</ul>
    </details>
  </section>;
}
