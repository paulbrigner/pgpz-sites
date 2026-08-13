export const AUDIT_PAGE_SIZE = 25;

export function resolveAuditPage(
  rawPage: string | string[] | undefined,
  entryCount: number,
  headSequence: number | null,
) {
  const candidate = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const requestedPage = Number.isInteger(candidate) && candidate > 0 ? candidate : 1;
  const totalPages = Math.max(1, Math.ceil(entryCount / AUDIT_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * AUDIT_PAGE_SIZE;
  return {
    page,
    totalPages,
    firstOrdinal: entryCount === 0 ? 0 : offset + 1,
    lastOrdinal: Math.min(entryCount, offset + AUDIT_PAGE_SIZE),
    beforeSequenceExclusive: headSequence === null ? undefined : headSequence + 1 - offset,
  };
}
