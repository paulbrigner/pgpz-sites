import type { AdminNewsletter } from "@/lib/admin/newsletters";
import { getUserGreetingName } from "@/lib/user-display-name";
import {
  brandedEmailColors as colors,
  escapeHtml,
  normalizeBaseUrl,
  renderMemberEmailFooter,
} from "@/lib/branded-email";

export type NewsletterEmailRecipient = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
};

export type NewsletterEmailTracking = {
  trackingId?: string | null;
  trackLinks?: boolean;
  includeOpenPixel?: boolean;
  includeUnsubscribe?: boolean;
};

const trackedClickUrl = (baseUrl: string, trackingId: string, href: string) =>
  `${baseUrl}/api/email/click/${encodeURIComponent(trackingId)}?url=${encodeURIComponent(href)}`;

const trackingOpenPixel = (baseUrl: string, trackingId: string) =>
  `<img src="${escapeHtml(`${baseUrl}/api/email/open/${encodeURIComponent(trackingId)}.png`)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;opacity:0;" />`;

const autolinkHtml = (value: string, baseUrl: string, tracking?: NewsletterEmailTracking) => {
  const parts = value.split(/(https?:\/\/[^\s<]+)/g);
  return parts
    .map((part) => {
      if (!/^https?:\/\//.test(part)) return escapeHtml(part);
      const href = part.replace(/[),.;!?]+$/, "");
      const trailing = part.slice(href.length);
      const linkHref =
        tracking?.trackLinks && tracking.trackingId
          ? trackedClickUrl(baseUrl, tracking.trackingId, href)
          : href;
      return `<a href="${escapeHtml(linkHref)}" style="color:${colors.goldDeep};font-weight:700;text-decoration:underline;text-decoration-color:${colors.gold};text-underline-offset:3px;">${escapeHtml(href)}</a>${escapeHtml(trailing)}`;
    })
    .join("");
};

const renderBodyHtml = (body: string, baseUrl: string, tracking?: NewsletterEmailTracking) =>
  body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) =>
      paragraph
        .split(/\n/)
        .map((line) => autolinkHtml(line.trim(), baseUrl, tracking))
        .join("<br />"),
    )
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
  tracking?: NewsletterEmailTracking,
) {
  const portalUrl = normalizeBaseUrl(baseUrl);
  const name = getUserGreetingName(recipient);
  const subject = newsletter.subject;
  const preheader = newsletter.preheader || newsletter.body.replace(/\s+/g, " ").trim().slice(0, 160);
  const bodyHtml = renderBodyHtml(newsletter.body, portalUrl, tracking);
  const unsubscribeUrl =
    tracking?.includeUnsubscribe && tracking.trackingId
      ? `${portalUrl}/api/email/unsubscribe/${encodeURIComponent(tracking.trackingId)}`
      : null;
  const openPixel =
    tracking?.includeOpenPixel && tracking.trackingId ? trackingOpenPixel(portalUrl, tracking.trackingId) : "";
  const unsubscribeHtml = unsubscribeUrl
    ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:${colors.goldDeep};">Unsubscribe from member emails</a>.`
    : ` To stop receiving member updates, contact <a href="mailto:admin@pgpz.org" style="color:${colors.goldDeep};">admin@pgpz.org</a>.`;
  const footerHtml = renderMemberEmailFooter({ portalUrl, unsubscribeHtml });
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
    `Hi ${name},`,
    "",
    renderBodyText(newsletter.body),
    "",
    `PGPZ Community: ${portalUrl}`,
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : "To stop receiving member updates, contact admin@pgpz.org.",
  ].join("\n");

  return { subject, html, text, preheader };
}
