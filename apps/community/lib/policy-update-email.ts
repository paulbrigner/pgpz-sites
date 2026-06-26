import type {
  PolicyUpdate,
  PolicyUpdateImage,
  PolicyUpdateLink,
  PolicyUpdateSection,
  PolicyUpdateTable,
} from "@/lib/policy-updates";
import { isPolicyUpdateRelevantPostImage, policyUpdateImageHref } from "@/lib/policy-update-images";
import {
  isPolicyUpdateSocialPostSection,
  normalizePolicyUpdateSectionLayout,
  policyUpdateSectionHeadingLink,
  splitPolicyUpdateSocialPostHeading,
} from "@/lib/policy-update-sections";
import { getUserGreetingName } from "@/lib/user-display-name";
import {
  brandedEmailColors as colors,
  escapeHtml,
  normalizeBaseUrl,
  renderForwardedEmailCommunityCta,
  renderForwardedEmailCommunityText,
  renderMemberEmailFooter,
} from "@/lib/branded-email";

export type PolicyUpdateEmailRecipient = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
};

export type PolicyUpdateEmailTracking = {
  trackingId?: string | null;
  trackLinks?: boolean;
  includeOpenPixel?: boolean;
  includeUnsubscribe?: boolean;
};

export const buildPolicyUpdatePortalUrl = (update: PolicyUpdate, baseUrl?: string | null) =>
  `${normalizeBaseUrl(baseUrl)}${update.portalPath}`;

const trackedClickUrl = (baseUrl: string, trackingId: string, href: string) =>
  `${baseUrl}/api/email/click/${encodeURIComponent(trackingId)}?url=${encodeURIComponent(href)}`;

const trackingOpenPixel = (baseUrl: string, trackingId: string) =>
  `<img src="${escapeHtml(`${baseUrl}/api/email/open/${encodeURIComponent(trackingId)}.png`)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;opacity:0;" />`;

const trackedHref = (baseUrl: string, href: string, tracking?: PolicyUpdateEmailTracking) =>
  tracking?.trackLinks && tracking.trackingId ? trackedClickUrl(baseUrl, tracking.trackingId, href) : href;

const absoluteUrl = (baseUrl: string, href: string) => {
  if (/^https?:\/\//i.test(href)) return href;
  return `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
};

const emailImageSrc = (src: string) => {
  const clean = src.split("?")[0] || src;
  const match = clean.match(/^\/api\/policy-updates\/([^/]+)\/assets\/([^/]+)$/i);
  if (!match) return src;
  return `/api/policy-updates/${match[1]}/email-assets/${match[2]}`;
};

const linkedTextParts = (text: string, links: PolicyUpdateLink[] = []) => {
  const matches = links
    .map((link) => ({ link, index: text.indexOf(link.text) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (!matches.length) return [{ text }];

  const parts: Array<{ text: string; link?: PolicyUpdateLink }> = [];
  let cursor = 0;

  matches.forEach(({ link, index }) => {
    if (index < cursor) return;

    if (index > cursor) parts.push({ text: text.slice(cursor, index) });

    parts.push({ text: link.text, link });
    cursor = index + link.text.length;
  });

  if (cursor < text.length) parts.push({ text: text.slice(cursor) });

  return parts;
};

const renderLinkedHtml = (
  text: string,
  links: PolicyUpdateLink[] = [],
  baseUrl: string,
  tracking?: PolicyUpdateEmailTracking,
) =>
  linkedTextParts(text, links)
    .map((part) => {
      if (!part.link) return escapeHtml(part.text);

      return `<a href="${escapeHtml(trackedHref(baseUrl, part.link.href, tracking))}" style="color:${colors.goldDeep};font-weight:700;text-decoration:underline;text-decoration-color:${colors.gold};text-underline-offset:3px;">${escapeHtml(part.text)}</a>`;
    })
    .join("");

const renderLinkedText = (text: string, links: PolicyUpdateLink[] = []) =>
  linkedTextParts(text, links)
    .map((part) => (part.link ? `${part.text} (${part.link.href})` : part.text))
    .join("");

const isRelevantPostsMarker = (text: string) => /^Relevant Posts?:$/i.test(text.trim());

const renderParagraphText = (text: string, links: PolicyUpdateLink[] = []) =>
  isRelevantPostsMarker(text) ? "Relevant Posts:" : renderLinkedText(text, links);

const renderRelevantPostsLabel = () =>
  `<h2 style="margin:0 0 10px;color:${colors.ink};font-size:20px;line-height:1.28;">Relevant Posts</h2>`;

const renderParagraphs = (
  paragraphs: string[],
  links: PolicyUpdateLink[] = [],
  baseUrl: string,
  tracking?: PolicyUpdateEmailTracking,
) =>
  paragraphs
    .map((paragraph) => {
      if (isRelevantPostsMarker(paragraph)) return renderRelevantPostsLabel();
      return `<p style="margin:0 0 14px;color:${colors.slate};font-size:15px;line-height:1.68;">${renderLinkedHtml(paragraph, links, baseUrl, tracking)}</p>`;
    })
    .join("");

const renderBullets = (items: string[]) =>
  `<ul style="margin:0;padding-left:20px;color:${colors.slate};font-size:15px;line-height:1.64;">${items
    .map((item) => `<li style="margin:0 0 9px;">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;

function policyUpdateEmailIntro(update: Pick<PolicyUpdate, "category" | "summary">) {
  const summary = update.summary.replace(/\s+/g, " ").trim();
  if (!summary) {
    return update.category === "weekly"
      ? "This week's PGPZ Community policy memo is now available."
      : "This PGPZ Community update is now available.";
  }

  if (/[.!?]$/.test(summary)) return summary;

  const prefix =
    update.category === "weekly"
      ? "This week's PGPZ Community policy memo covers"
      : "This PGPZ Community update covers";
  return `${prefix} ${summary}.`;
}

const renderTableCellHtml = (cell: string) => escapeHtml(cell).replace(/\n+/g, "<br />");
const renderTableCellText = (cell: string) => cell.replace(/\n+/g, "; ");

const renderTable = (table: PolicyUpdateTable) =>
  `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid ${colors.line};border-radius:12px;overflow:hidden;margin:4px 0 18px;background:#ffffff;">
    <thead>
      <tr>
        ${table.columns
          .map(
            (column) =>
              `<th style="background:${colors.coal};color:#ffffff;border-right:1px solid rgba(255,255,255,0.16);padding:11px 10px;text-align:left;font-size:11px;line-height:1.35;text-transform:uppercase;letter-spacing:0.12em;">${escapeHtml(column)}</th>`,
          )
          .join("")}
      </tr>
    </thead>
    <tbody>
      ${table.rows
        .map(
          (row) =>
            `<tr>${row
              .map(
                (cell, index) =>
                  `<td style="border-top:1px solid ${colors.line};border-right:1px solid ${colors.line};padding:12px 10px;vertical-align:top;color:${index === 0 ? colors.ink : colors.slate};font-size:13px;line-height:1.55;font-weight:${index === 0 ? "700" : "400"};">${renderTableCellHtml(cell)}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("")}
    </tbody>
  </table>`;

const renderTableText = (table: PolicyUpdateTable) => [
  table.columns.join(" | "),
  ...table.rows.map((row) => row.map(renderTableCellText).join(" | ")),
  "",
];

const renderImageHtml = ({
  image,
  baseUrl,
  tracking,
  imageHrefFallback,
  isSocial,
}: {
  image: PolicyUpdateImage;
  baseUrl: string;
  tracking?: PolicyUpdateEmailTracking;
  imageHrefFallback?: string | null;
  isSocial: boolean;
}) => {
  const href = policyUpdateImageHref(image, imageHrefFallback);
  const trackedImageHref = href ? trackedHref(baseUrl, href, tracking) : null;
  const imageSrc = absoluteUrl(baseUrl, emailImageSrc(image.src));
  const width = Number.isFinite(Number(image.width)) && Number(image.width) > 0 ? Number(image.width) : 640;
  const height = Number.isFinite(Number(image.height)) && Number(image.height) > 0 ? Number(image.height) : undefined;
  const maxWidth = isSocial ? 640 : width <= 500 && height && height <= 500 ? 240 : 640;
  const img = `<img src="${escapeHtml(imageSrc)}" width="${Math.min(width, maxWidth)}"${height ? ` height="${height}"` : ""} alt="${escapeHtml(image.alt)}" style="display:block;width:100%;max-width:${maxWidth}px;height:auto;border:1px solid ${colors.line};border-radius:12px;background:#ffffff;" />`;

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0 18px;border:1px solid rgba(245,168,0,0.28);border-radius:16px;background:${isSocial ? "#ffffff" : "#FFFDF5"};">
    <tr>
      <td align="center" style="padding:12px;">
        ${trackedImageHref ? `<a href="${escapeHtml(trackedImageHref)}" style="display:inline-block;text-decoration:none;">${img}</a>` : img}
      </td>
    </tr>
  </table>`;
};

const renderSectionImages = ({
  section,
  baseUrl,
  tracking,
  imageHrefFallback,
  isSocial,
}: {
  section: PolicyUpdateSection;
  baseUrl: string;
  tracking?: PolicyUpdateEmailTracking;
  imageHrefFallback?: string | null;
  isSocial: boolean;
}) =>
  (section.images || [])
    .map((image) =>
      renderImageHtml({
        image,
        baseUrl,
        tracking,
        imageHrefFallback,
        isSocial,
      }),
    )
    .join("");

const renderSectionImageText = (section: PolicyUpdateSection) =>
  (section.images || []).flatMap((image) => {
    const href = policyUpdateImageHref(image, section.links?.[0]?.href || null);
    return [`[Image: ${image.alt}]${href ? ` ${href}` : ""}`];
  });

const renderHeadingText = (text: string, href: string | null, baseUrl: string, tracking?: PolicyUpdateEmailTracking) => {
  if (!href) return escapeHtml(text);

  return `<a href="${escapeHtml(trackedHref(baseUrl, href, tracking))}" style="color:${colors.ink};font-weight:800;text-decoration:underline;text-decoration-color:${colors.gold};text-underline-offset:4px;">${escapeHtml(text)}</a>`;
};

const renderSectionHeading = (
  section: PolicyUpdate["sections"][number],
  baseUrl: string,
  tracking?: PolicyUpdateEmailTracking,
) => {
  const socialHeading = splitPolicyUpdateSocialPostHeading(section.heading);
  const headingLink = policyUpdateSectionHeadingLink(section);
  if (!socialHeading) {
    return `<h2 style="margin:0 0 10px;color:${colors.ink};font-size:20px;line-height:1.28;">${renderHeadingText(section.heading, headingLink?.href || null, baseUrl, tracking)}</h2>`;
  }

  return `<div style="margin:0 0 8px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:${colors.goldDeep};">${escapeHtml(socialHeading.label)}</div>
                ${socialHeading.title ? `<h2 style="margin:0 0 10px;color:${colors.ink};font-size:19px;line-height:1.32;">${renderHeadingText(socialHeading.title, headingLink?.href || null, baseUrl, tracking)}</h2>` : ""}`;
};

const renderSectionHtml = (
  section: PolicyUpdateSection,
  baseUrl: string,
  tracking: PolicyUpdateEmailTracking | undefined,
) => {
  const isSocial = isPolicyUpdateSocialPostSection(section);
  const headingLink = policyUpdateSectionHeadingLink(section);
  const imageHrefFallback = headingLink?.href || section.links?.[0]?.href || null;
  const imagesHtml = renderSectionImages({
    section,
    baseUrl,
    tracking,
    imageHrefFallback,
    isSocial,
  });
  const hasRelevantPostsMarker = [...section.body, ...(section.bodyAfterBullets || [])].some(isRelevantPostsMarker);
  const relevantPostsImageLabel =
    !isSocial && !hasRelevantPostsMarker && (section.images || []).some(isPolicyUpdateRelevantPostImage)
      ? renderRelevantPostsLabel()
      : "";

  return `<tr>
              <td style="padding:0 30px 22px;">
                <div style="border-top:1px solid rgba(245,168,0,0.34);padding-top:22px;${isSocial ? `border-left:4px solid ${colors.gold};background:#FFFDF5;padding-left:16px;padding-right:16px;padding-bottom:4px;` : ""}">
                  ${renderSectionHeading(section, baseUrl, tracking)}
                  ${isSocial ? imagesHtml : ""}
                  ${renderParagraphs(section.body, section.links, baseUrl, tracking)}
                  ${!isSocial ? `${relevantPostsImageLabel}${imagesHtml}` : ""}
                  ${section.table ? renderTable(section.table) : ""}
                  ${section.bullets?.length ? renderBullets(section.bullets) : ""}
                  ${section.bodyAfterBullets?.length ? renderParagraphs(section.bodyAfterBullets, section.links, baseUrl, tracking) : ""}
                </div>
              </td>
            </tr>`;
};

export function buildPolicyUpdateEmail(
  update: PolicyUpdate,
  recipient: PolicyUpdateEmailRecipient,
  baseUrl?: string | null,
  tracking?: PolicyUpdateEmailTracking,
) {
  const base = normalizeBaseUrl(baseUrl);
  const sections = normalizePolicyUpdateSectionLayout(update.sections);
  const portalUrl = buildPolicyUpdatePortalUrl(update, base);
  const archiveUrl = `${base}/updates`;
  const portalLinkHref = trackedHref(base, portalUrl, tracking);
  const archiveLinkHref = trackedHref(base, archiveUrl, tracking);
  const communityLinkHref = trackedHref(base, base, tracking);
  const unsubscribeUrl =
    tracking?.includeUnsubscribe && tracking.trackingId
      ? `${base}/api/email/unsubscribe/${encodeURIComponent(tracking.trackingId)}`
      : null;
  const openPixel =
    tracking?.includeOpenPixel && tracking.trackingId ? trackingOpenPixel(base, tracking.trackingId) : "";
  const name = getUserGreetingName(recipient);
  const subject = update.emailSubject;
  const intro = policyUpdateEmailIntro(update);
  const unsubscribeHtml = unsubscribeUrl
    ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:${colors.goldDeep};">Unsubscribe from member emails</a>.`
    : undefined;
  const footerHtml = renderMemberEmailFooter({ portalUrl: base, unsubscribeHtml });
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:${colors.cloud};font-family:Inter,Segoe UI,Arial,sans-serif;color:${colors.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(update.emailPreheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${colors.cloud};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#ffffff;border:1px solid ${colors.line};border-radius:18px;overflow:hidden;box-shadow:0 22px 48px rgba(30,30,30,0.12);">
            <tr>
              <td style="background:linear-gradient(135deg,${colors.coal},#2A2111 60%,${colors.goldDeep});padding:28px 30px;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:0.26em;text-transform:uppercase;font-weight:700;color:${colors.goldSoft};">PGPZ Community</div>
                <h1 style="margin:12px 0 0;font-size:30px;line-height:1.18;color:#ffffff;">${escapeHtml(update.title)}</h1>
                <p style="margin:12px 0 0;color:rgba(255,255,255,0.82);font-size:15px;line-height:1.6;">${escapeHtml(update.displayDate)} - ${escapeHtml(update.categoryLabel)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px 8px;">
                <p style="margin:0 0 14px;color:${colors.slate};font-size:15px;line-height:1.68;">Hi ${escapeHtml(name)},</p>
                <p style="margin:0 0 18px;color:${colors.slate};font-size:15px;line-height:1.68;">${escapeHtml(intro)}</p>
                <div style="margin:22px 0;padding:18px;border:1px solid ${colors.line};border-radius:14px;background:#FFFDF5;">
                  <div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;color:${colors.goldDeep};">Key takeaways</div>
                  <div style="margin-top:12px;">${renderBullets(update.keyTakeaways)}</div>
                </div>
                <div style="margin:22px 0;padding:18px;border:1px solid rgba(31,111,104,0.24);border-radius:14px;background:#F6FFFC;">
                  <div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;color:${colors.teal};">Action items</div>
                  <div style="margin-top:12px;">${renderBullets(update.actionItems)}</div>
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 28px;">
                  <tr>
                    <td style="border-radius:999px;background:${colors.gold};">
                      <a href="${escapeHtml(portalLinkHref)}" style="display:inline-block;padding:12px 18px;border-radius:999px;color:${colors.ink};font-size:14px;font-weight:800;text-decoration:none;">View on member portal</a>
                    </td>
                    <td style="width:12px;"></td>
                    <td style="border-radius:999px;border:1px solid ${colors.line};background:#ffffff;">
                      <a href="${escapeHtml(archiveLinkHref)}" style="display:inline-block;padding:11px 17px;border-radius:999px;color:${colors.goldDeep};font-size:14px;font-weight:700;text-decoration:none;">View archive</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${sections.map((section) => renderSectionHtml(section, base, tracking)).join("")}
            <tr>
              <td style="padding:0 30px 26px;">
                ${renderForwardedEmailCommunityCta({ portalUrl: base, href: communityLinkHref })}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px 30px;border-top:1px solid ${colors.line};background:#FFFDF5;">
                ${footerHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${openPixel}
  </body>
</html>`;

  const text = [
    update.title,
    `${update.displayDate} - ${update.categoryLabel}`,
    "",
    `Hi ${name},`,
    "",
    intro,
    "",
    "Key takeaways:",
    ...update.keyTakeaways.map((item) => `- ${item}`),
    "",
    "Action items:",
    ...update.actionItems.map((item) => `- ${item}`),
    "",
    `View on member portal: ${portalUrl}`,
    `View archive: ${archiveUrl}`,
    "",
    ...sections.flatMap((section) => [
      section.heading,
      ...renderSectionImageText(section),
      ...section.body.map((paragraph) => renderParagraphText(paragraph, section.links)),
      ...(section.table ? renderTableText(section.table) : []),
      ...(section.bullets || []).map((item) => `- ${item}`),
      ...(section.bodyAfterBullets || []).map((paragraph) => renderParagraphText(paragraph, section.links)),
      "",
    ]),
    renderForwardedEmailCommunityText(baseUrl),
    "",
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : "To stop receiving member updates, contact admin@pgpz.org.",
  ].join("\n");

  return { subject, html, text, portalUrl, archiveUrl };
}
