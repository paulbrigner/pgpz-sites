import type { PolicyUpdate, PolicyUpdateLink, PolicyUpdateTable } from "@/lib/policy-updates";
import { getUserGreetingName } from "@/lib/user-display-name";
import {
  brandedEmailColors as colors,
  escapeHtml,
  normalizeBaseUrl,
  renderMemberEmailFooter,
} from "@/lib/branded-email";

export type PolicyUpdateEmailRecipient = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
};

export const buildPolicyUpdatePortalUrl = (update: PolicyUpdate, baseUrl?: string | null) =>
  `${normalizeBaseUrl(baseUrl)}${update.portalPath}`;

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

const renderLinkedHtml = (text: string, links: PolicyUpdateLink[] = []) =>
  linkedTextParts(text, links)
    .map((part) => {
      if (!part.link) return escapeHtml(part.text);

      return `<a href="${escapeHtml(part.link.href)}" style="color:${colors.goldDeep};font-weight:700;text-decoration:underline;text-decoration-color:${colors.gold};text-underline-offset:3px;">${escapeHtml(part.text)}</a>`;
    })
    .join("");

const renderLinkedText = (text: string, links: PolicyUpdateLink[] = []) =>
  linkedTextParts(text, links)
    .map((part) => (part.link ? `${part.text} (${part.link.href})` : part.text))
    .join("");

const renderParagraphs = (paragraphs: string[], links: PolicyUpdateLink[] = []) =>
  paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;color:${colors.slate};font-size:15px;line-height:1.68;">${renderLinkedHtml(paragraph, links)}</p>`,
    )
    .join("");

const renderBullets = (items: string[]) =>
  `<ul style="margin:0;padding-left:20px;color:${colors.slate};font-size:15px;line-height:1.64;">${items
    .map((item) => `<li style="margin:0 0 9px;">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;

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
                  `<td style="border-top:1px solid ${colors.line};border-right:1px solid ${colors.line};padding:12px 10px;vertical-align:top;color:${index === 0 ? colors.ink : colors.slate};font-size:13px;line-height:1.55;font-weight:${index === 0 ? "700" : "400"};">${escapeHtml(cell)}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("")}
    </tbody>
  </table>`;

const renderTableText = (table: PolicyUpdateTable) => [
  table.columns.join(" | "),
  ...table.rows.map((row) => row.join(" | ")),
  "",
];

export function buildPolicyUpdateEmail(
  update: PolicyUpdate,
  recipient: PolicyUpdateEmailRecipient,
  baseUrl?: string | null,
) {
  const portalUrl = buildPolicyUpdatePortalUrl(update, baseUrl);
  const archiveUrl = `${normalizeBaseUrl(baseUrl)}/updates`;
  const name = getUserGreetingName(recipient);
  const subject = update.emailSubject;
  const footerHtml = renderMemberEmailFooter({ portalUrl: normalizeBaseUrl(baseUrl) });
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
                <p style="margin:0 0 18px;color:${colors.slate};font-size:15px;line-height:1.68;">${escapeHtml(update.summary)}</p>
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
                      <a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;color:${colors.ink};font-size:14px;font-weight:800;text-decoration:none;">View on member portal</a>
                    </td>
                    <td style="width:12px;"></td>
                    <td style="border-radius:999px;border:1px solid ${colors.line};background:#ffffff;">
                      <a href="${escapeHtml(archiveUrl)}" style="display:inline-block;padding:11px 17px;border-radius:999px;color:${colors.goldDeep};font-size:14px;font-weight:700;text-decoration:none;">View archive</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${update.sections
              .map(
                (section) => `<tr>
              <td style="padding:0 30px 22px;">
                <h2 style="margin:0 0 10px;color:${colors.ink};font-size:20px;line-height:1.28;">${escapeHtml(section.heading)}</h2>
                ${renderParagraphs(section.body, section.links)}
                ${section.table ? renderTable(section.table) : ""}
                ${section.bullets?.length ? renderBullets(section.bullets) : ""}
                ${section.bodyAfterBullets?.length ? renderParagraphs(section.bodyAfterBullets, section.links) : ""}
              </td>
            </tr>`,
              )
              .join("")}
            <tr>
              <td style="padding:24px 30px 30px;border-top:1px solid ${colors.line};background:#FFFDF5;">
                ${footerHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    update.title,
    `${update.displayDate} - ${update.categoryLabel}`,
    "",
    `Hi ${name},`,
    "",
    update.summary,
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
    ...update.sections.flatMap((section) => [
      section.heading,
      ...section.body.map((paragraph) => renderLinkedText(paragraph, section.links)),
      ...(section.table ? renderTableText(section.table) : []),
      ...(section.bullets || []).map((item) => `- ${item}`),
      ...(section.bodyAfterBullets || []).map((paragraph) => renderLinkedText(paragraph, section.links)),
      "",
    ]),
  ].join("\n");

  return { subject, html, text, portalUrl, archiveUrl };
}
