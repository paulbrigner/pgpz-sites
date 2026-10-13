import type { PolicyUpdateSection } from "./policy-updates";
import { isPolicyUpdateDisplayImageAllowed } from "./policy-update-images";

const textOrEmpty = (value: unknown) => typeof value === "string" ? value : "";

export const textArrayOrFallback = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length ? items : fallback;
};

const safeRunHref = (value: unknown) => {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return undefined;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
};

const textRunsOrFallback = (value: unknown, fallback: string) => {
  if (!Array.isArray(value)) return [];
  const runs = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const text = textOrEmpty(record.text);
      if (!text) return null;
      const href = safeRunHref(record.href);
      return {
        text,
        ...(record.bold === true ? { bold: true } : {}),
        ...(record.italic === true ? { italic: true } : {}),
        ...(record.underline === true ? { underline: true } : {}),
        ...(href ? { href } : {}),
      };
    })
    .filter((run): run is NonNullable<typeof run> => !!run);
  return runs.length && runs.map((run) => run.text).join("").replace(/\s+/g, " ").trim() === fallback.replace(/\s+/g, " ").trim()
    ? runs
    : [];
};

const textRunGroupsOrFallback = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return [];
  const groups = fallback.map((text, index) => textRunsOrFallback(value[index], text));
  return groups.some((group) => group.length) ? groups : [];
};

const progressItemsOrFallback = (
  value: unknown,
  fallback: PolicyUpdateSection["progressItems"] = [],
) => {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = textOrEmpty(record.label).trim();
      if (!label) return null;
      const details = Array.isArray(record.details)
        ? record.details
            .map((detail) => {
              if (typeof detail === "string") {
                const text = detail.trim();
                return text ? { text } : null;
              }
              if (!detail || typeof detail !== "object") return null;
              const detailRecord = detail as Record<string, unknown>;
              const text = textOrEmpty(detailRecord.text).trim();
              const children = textArrayOrFallback(detailRecord.children, []);
              if (!text) return null;
              return {
                text,
                ...(children.length ? { children } : {}),
              };
            })
            .filter((detail): detail is { text: string; children?: string[] } => !!detail)
        : [];
      return {
        label,
        ...(details.length ? { details } : {}),
      };
    })
    .filter((item): item is NonNullable<PolicyUpdateSection["progressItems"]>[number] => !!item);
  return items.length ? items : fallback;
};

export const sectionArrayOrFallback = (value: unknown, fallback: PolicyUpdateSection[]) => {
  if (!Array.isArray(value)) return fallback;
  const sections = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const heading = textOrEmpty(record.heading).trim();
      const body = textArrayOrFallback(record.body, []);
      if (!heading) return null;

      const section: PolicyUpdateSection = { heading, body };
      if (record.dividerBefore === true) section.dividerBefore = true;
      if (record.dividerAfter === true) section.dividerAfter = true;
      const headingRuns = textRunsOrFallback(record.headingRuns, heading);
      const bodyRuns = textRunGroupsOrFallback(record.bodyRuns, body);
      const bullets = textArrayOrFallback(record.bullets, []);
      const bulletRuns = textRunGroupsOrFallback(record.bulletRuns, bullets);
      const progressItems = progressItemsOrFallback(record.progressItems, []);
      const bodyAfterBullets = textArrayOrFallback(record.bodyAfterBullets, []);
      const bodyAfterBulletsRuns = textRunGroupsOrFallback(
        record.bodyAfterBulletsRuns,
        bodyAfterBullets,
      );
      if (headingRuns.length) section.headingRuns = headingRuns;
      if (bodyRuns.length) section.bodyRuns = bodyRuns;
      if (bullets.length) section.bullets = bullets;
      if (bulletRuns.length) section.bulletRuns = bulletRuns;
      if (progressItems?.length) section.progressItems = progressItems;
      if (bodyAfterBullets.length) section.bodyAfterBullets = bodyAfterBullets;
      if (bodyAfterBulletsRuns.length) section.bodyAfterBulletsRuns = bodyAfterBulletsRuns;
      if (Array.isArray(record.images)) {
        const images = record.images
          .map((image) => {
            if (!image || typeof image !== "object") return null;
            const imageRecord = image as Record<string, unknown>;
            const src = textOrEmpty(imageRecord.src).trim();
            const alt = textOrEmpty(imageRecord.alt).trim();
            const caption = textOrEmpty(imageRecord.caption).trim();
            const href = textOrEmpty(imageRecord.href).trim();
            const width = Number(imageRecord.width);
            const height = Number(imageRecord.height);
            const displayWidthPt = Number(imageRecord.displayWidthPt);
            const displayHeightPt = Number(imageRecord.displayHeightPt);
            if (!src || !alt) return null;
            const displayImage = {
              src,
              alt,
              ...(caption ? { caption } : {}),
              ...(href ? { href } : {}),
              ...(Number.isFinite(width) && width > 0 ? { width } : {}),
              ...(Number.isFinite(height) && height > 0 ? { height } : {}),
              ...(Number.isFinite(displayWidthPt) && displayWidthPt > 0
                ? { displayWidthPt }
                : {}),
              ...(Number.isFinite(displayHeightPt) && displayHeightPt > 0
                ? { displayHeightPt }
                : {}),
            };
            return isPolicyUpdateDisplayImageAllowed(displayImage) ? displayImage : null;
          })
          .filter((image): image is NonNullable<typeof image> => !!image);
        if (images.length) section.images = images;
      }

      if (record.table && typeof record.table === "object") {
        const tableRecord = record.table as Record<string, unknown>;
        const columns = textArrayOrFallback(tableRecord.columns, []);
        const rows = Array.isArray(tableRecord.rows)
          ? tableRecord.rows
              .map((row) => textArrayOrFallback(row, []))
              .filter((row) => row.length)
          : [];
        if (columns.length && rows.length) section.table = { columns, rows };
      }

      if (Array.isArray(record.links)) {
        const links = record.links
          .map((link) => {
            if (!link || typeof link !== "object") return null;
            const linkRecord = link as Record<string, unknown>;
            const text = textOrEmpty(linkRecord.text).trim();
            const href = textOrEmpty(linkRecord.href).trim();
            return text && href ? { text, href } : null;
          })
          .filter((link): link is { text: string; href: string } => !!link);
        if (links.length) section.links = links;
      }

      if (
        !body.length &&
        !section.bullets?.length &&
        !section.progressItems?.length &&
        !section.bodyAfterBullets?.length &&
        !section.table &&
        !section.images?.length
      ) {
        return null;
      }

      return section;
    })
    .filter((section): section is PolicyUpdateSection => !!section);
  return sections.length ? sections : fallback;
};
