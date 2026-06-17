import { SITE_URL } from "@/lib/config";
import type { AdminNewsletter } from "@/lib/admin/newsletters";
import { getUserGreetingName } from "@/lib/user-display-name";

export type NewsletterEmailRecipient = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
};

const colors = {
  ink: "#1E1E1E",
  coal: "#17130A",
  gold: "#F5A800",
  goldSoft: "#FFE6A3",
  goldDeep: "#8A5A00",
  cloud: "#FFF9EA",
  slate: "#475569",
  line: "#E2D3A7",
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeBaseUrl = (baseUrl?: string | null) =>
  (baseUrl || SITE_URL || "https://community.pgpz.org").replace(/\/+$/, "");

const autolinkHtml = (value: string) => {
  const parts = value.split(/(https?:\/\/[^\s<]+)/g);
  return parts
    .map((part) => {
      if (!/^https?:\/\//.test(part)) return escapeHtml(part);
      const href = part.replace(/[),.;!?]+$/, "");
      const trailing = part.slice(href.length);
      return `<a href="${escapeHtml(href)}" style="color:${colors.goldDeep};font-weight:700;text-decoration:underline;text-decoration-color:${colors.gold};text-underline-offset:3px;">${escapeHtml(href)}</a>${escapeHtml(trailing)}`;
    })
    .join("");
};

const renderBodyHtml = (body: string) =>
  body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => paragraph.split(/\n/).map((line) => autolinkHtml(line.trim())).join("<br />"))
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:${colors.slate};font-size:15px;line-height:1.7;">${paragraph}</p>`,
    )
    .join("");

const renderBodyText = (body: string) => body.trim();

export function buildNewsletterEmail(
  newsletter: Pick<AdminNewsletter, "subject" | "preheader" | "body">,
  recipient: NewsletterEmailRecipient,
  baseUrl?: string | null,
) {
  const portalUrl = normalizeBaseUrl(baseUrl);
  const name = getUserGreetingName(recipient);
  const subject = newsletter.subject;
  const preheader = newsletter.preheader || newsletter.body.replace(/\s+/g, " ").trim().slice(0, 160);
  const bodyHtml = renderBodyHtml(newsletter.body);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:${colors.cloud};font-family:Inter,Segoe UI,Arial,sans-serif;color:${colors.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${colors.cloud};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#ffffff;border:1px solid ${colors.line};border-radius:18px;overflow:hidden;box-shadow:0 22px 48px rgba(30,30,30,0.12);">
            <tr>
              <td style="background:linear-gradient(135deg,${colors.coal},#2A2111 60%,${colors.goldDeep});padding:28px 30px;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:0.26em;text-transform:uppercase;font-weight:700;color:${colors.goldSoft};">PGPZ Community Newsletter</div>
                <h1 style="margin:12px 0 0;font-size:30px;line-height:1.18;color:#ffffff;">${escapeHtml(subject)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px 12px;">
                <p style="margin:0 0 16px;color:${colors.slate};font-size:15px;line-height:1.7;">Hi ${escapeHtml(name)},</p>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px 30px;border-top:1px solid ${colors.line};background:#FFFDF5;">
                <p style="margin:0;color:${colors.slate};font-size:13px;line-height:1.6;">You are receiving this because your PGPZ Community membership is active. Visit <a href="${escapeHtml(portalUrl)}" style="color:${colors.goldDeep};">PGPZ Community</a> for member resources. To stop receiving member updates, contact <a href="mailto:admin@pgpz.org" style="color:${colors.goldDeep};">admin@pgpz.org</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [`Hi ${name},`, "", renderBodyText(newsletter.body), "", `PGPZ Community: ${portalUrl}`].join("\n");

  return { subject, html, text, preheader };
}
