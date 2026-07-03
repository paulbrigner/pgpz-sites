import type { PolicyUpdateProgressDetail, PolicyUpdateProgressItem, PolicyUpdateSection } from "@/lib/policy-updates";

function isWorkstreamParent(text: string) {
  return /^Created\s+Coalition\s+Workstreams\b/i.test(text.trim());
}

function nestedDetailsFromFlatDetails(flatDetails: string[]): PolicyUpdateProgressDetail[] {
  const details: PolicyUpdateProgressDetail[] = [];

  flatDetails
    .map((detail) => detail.trim())
    .filter(Boolean)
    .forEach((detail) => {
      const last = details.at(-1);
      if (last && isWorkstreamParent(last.text)) {
        last.children = [...(last.children || []), detail];
        return;
      }
      details.push({ text: detail });
    });

  return details;
}

export function isPgpzProgressSummarySection(section: Pick<PolicyUpdateSection, "heading">) {
  return /^PGPZ Progress Summary$/i.test(section.heading.trim());
}

export function progressSummaryItems(section: Pick<PolicyUpdateSection, "bullets" | "progressItems">) {
  if (section.progressItems?.length) return section.progressItems;

  return (section.bullets || []).map((item): PolicyUpdateProgressItem => {
    const [label, ...detailParts] = item.split(/:\s+/);
    const details = nestedDetailsFromFlatDetails(detailParts.join(": ").split(/;\s+/));
    return {
      label: label.trim(),
      ...(details.length ? { details } : {}),
    };
  });
}
