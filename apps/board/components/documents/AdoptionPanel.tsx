import type { LibraryDocument } from "@/lib/document-library";

export function AdoptionPanel({ document }: { document: LibraryDocument }) {
  const adoptions = document.adoptions || [];
  if (!adoptions.length) return null;
  const latestAdopted = adoptions.some((item) => item.versionId === document.currentVersionId);
  return <details className="mx-4 mb-3 rounded-xl border border-[var(--border)] bg-[var(--primary-soft)]/45 px-4 py-3 sm:mx-6">
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
        <a href={item.packetHref}>Download adoption packet</a>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">The packet reproduces existing consents; it adds no new signature or Secretary certification. PDF packets include the approved document and signature appendix; other formats use a ZIP packet.</p>
    </li>)}</ul>
  </details>;
}
