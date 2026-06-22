import type { PolicyUpdateSection } from "@/lib/policy-updates";

export type PolicyUpdateSocialPostHeading = {
  label: string;
  title: string;
};

const socialPostHeadingPattern = /^(X Post of the Week|Notable Posts?):\s*(.+)$/i;

export function splitPolicyUpdateSocialPostHeading(heading: string): PolicyUpdateSocialPostHeading | null {
  const match = heading.trim().match(socialPostHeadingPattern);
  if (!match) return null;

  return {
    label: match[1].replace(/\s+/g, " ").trim(),
    title: match[2].replace(/\s+/g, " ").trim(),
  };
}

export function isPolicyUpdateSocialPostSection(
  section: Pick<PolicyUpdateSection, "heading" | "images">,
) {
  if (splitPolicyUpdateSocialPostHeading(section.heading)) return true;

  return (
    section.images?.some((image) =>
      /(?:embedded\s+)?x\s+post\s+screenshot|x\s+screenshot/i.test(
        `${image.alt || ""} ${image.caption || ""}`,
      ),
    ) || false
  );
}
