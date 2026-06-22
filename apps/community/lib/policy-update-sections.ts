import type { PolicyUpdateSection } from "@/lib/policy-updates";

type PolicyUpdateSectionImage = NonNullable<PolicyUpdateSection["images"]>[number];

export type PolicyUpdateSocialPostHeading = {
  label: string;
  title?: string;
};

const socialPostHeadingPattern = /^(X Post of the Week|Notable Posts?)(?::\s*(.*))?$/i;

export function splitPolicyUpdateSocialPostHeading(heading: string): PolicyUpdateSocialPostHeading | null {
  const match = heading.trim().match(socialPostHeadingPattern);
  if (!match) return null;

  const title = match[2]?.replace(/\s+/g, " ").trim();
  return {
    label: match[1].replace(/\s+/g, " ").trim(),
    ...(title ? { title } : {}),
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

function socialPostImagePlacement(image: PolicyUpdateSectionImage) {
  const text = `${image.src} ${image.alt || ""} ${image.caption || ""}`.toLowerCase();
  if (!/(?:^|[/-])x[-_]|x post|twitter|@/i.test(text)) return null;

  if (/\bjosh\b|\bswihart\b/.test(text)) return "x-post-of-the-week";
  if (/\bwarren\b|\bdavidson\b/.test(text)) return "fincen-followup";
  if (/\bjustin\b|\bslaughter\b|\baustin\b|\bcampbell\b|\billinois\b/.test(text)) {
    return "illinois-followup";
  }

  return null;
}

function withoutSocialPrefix(heading: string) {
  const socialHeading = splitPolicyUpdateSocialPostHeading(heading);
  return socialHeading?.title || heading;
}

function normalizedLinkText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function policyUpdateSectionHeadingLink(section: PolicyUpdateSection) {
  const links = section.links || [];
  if (!links.length) return null;
  if (isPolicyUpdateSocialPostSection(section)) return null;

  const heading = normalizedLinkText(withoutSocialPrefix(section.heading));
  if (!heading || /^why this matters/.test(heading) || /^action items?/.test(heading)) return null;

  const headingMatch = links.find((link) => {
    const linkText = normalizedLinkText(link.text);
    return linkText && (heading.includes(linkText) || linkText.includes(heading));
  });

  if (headingMatch) return headingMatch;
  return links.length === 1 ? links[0] : null;
}

function sectionTopic(section: PolicyUpdateSection) {
  const text = `${section.heading} ${section.body.join(" ")}`.toLowerCase();
  if (/\billinois\b/.test(text) && /\bcrypto|digital asset|tax\b/.test(text)) return "illinois";
  if (/\bfincen\b/.test(text) && /\baml|anti-money|bank secrecy|bsa\b/.test(text)) return "fincen";
  return null;
}

function isCommunityIntroSection(section: PolicyUpdateSection) {
  const text = `${section.heading} ${section.body.join(" ")}`.toLowerCase();
  return /\bsignal chat\b|\bpgpz community signal\b|\bjoin the pgpz community\b/.test(text);
}

function socialImageSection(
  heading: "X Post of the Week" | "Notable Post" | "Notable Posts",
  images: NonNullable<PolicyUpdateSection["images"]>,
): PolicyUpdateSection | null {
  return images.length ? { heading, body: [], images } : null;
}

export function normalizePolicyUpdateSectionLayout(sections: PolicyUpdateSection[]) {
  const imageGroups: Record<string, NonNullable<PolicyUpdateSection["images"]>> = {
    "x-post-of-the-week": [],
    "fincen-followup": [],
    "illinois-followup": [],
  };

  const stripped = sections
    .map((section) => {
      const retainedImages = (section.images || []).filter((image) => {
        const placement = socialPostImagePlacement(image);
        if (!placement) return true;
        imageGroups[placement].push(image);
        return false;
      });

      return {
        ...section,
        heading: retainedImages.length ? section.heading : withoutSocialPrefix(section.heading),
        ...(retainedImages.length ? { images: retainedImages } : { images: undefined }),
      };
    })
    .filter(
      (section) =>
        section.heading &&
        (section.body.length || section.bullets?.length || section.bodyAfterBullets?.length || section.table || section.images?.length),
    );

  const output: PolicyUpdateSection[] = [];
  let insertedXPost = false;
  let insertedFincenFollowup = false;
  let insertedIllinoisFollowup = false;

  const insertXPost = () => {
    if (insertedXPost) return;
    const section = socialImageSection("X Post of the Week", imageGroups["x-post-of-the-week"]);
    if (section) output.push(section);
    insertedXPost = true;
  };

  const insertFincenFollowup = () => {
    if (insertedFincenFollowup) return;
    const section = socialImageSection("Notable Post", imageGroups["fincen-followup"]);
    if (section) output.push(section);
    insertedFincenFollowup = true;
  };

  const insertIllinoisFollowup = () => {
    if (insertedIllinoisFollowup) return;
    const section = socialImageSection("Notable Posts", imageGroups["illinois-followup"]);
    if (section) output.push(section);
    insertedIllinoisFollowup = true;
  };

  stripped.forEach((section, index) => {
    const topic = sectionTopic(section);
    const nextTopic = stripped[index + 1] ? sectionTopic(stripped[index + 1]) : null;

    if (
      !insertedXPost &&
      section.body.length &&
      !isCommunityIntroSection(section) &&
      !isPolicyUpdateSocialPostSection(section)
    ) {
      insertXPost();
    }

    output.push(section);

    if (!insertedFincenFollowup && topic === "fincen" && nextTopic !== "fincen") {
      insertFincenFollowup();
    }

    if (!insertedIllinoisFollowup && topic === "illinois" && nextTopic !== "illinois") {
      insertIllinoisFollowup();
    }
  });

  insertXPost();
  insertFincenFollowup();
  insertIllinoisFollowup();

  return output;
}
