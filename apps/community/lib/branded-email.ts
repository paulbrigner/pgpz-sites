import { SITE_URL } from "@/lib/config";

export const brandedEmailColors = {
  ink: "#1E1E1E",
  coal: "#17130A",
  gold: "#F5A800",
  goldSoft: "#FFE6A3",
  goldDeep: "#8A5A00",
  cloud: "#FFF9EA",
  slate: "#475569",
  line: "#E2D3A7",
  teal: "#1F6F68",
};

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const normalizeBaseUrl = (baseUrl?: string | null) =>
  (baseUrl || SITE_URL || "https://community.pgpz.org").replace(/\/+$/, "");

export const stripHtmlToText = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function renderEmailParagraph(contentHtml: string) {
  return `<p style="margin:0 0 16px;color:${brandedEmailColors.slate};font-size:15px;line-height:1.7;">${contentHtml}</p>`;
}

export function renderEmailButton({ href, label }: { href: string; label: string }) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 24px;">
    <tr>
      <td style="border-radius:999px;background:${brandedEmailColors.gold};">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 18px;border-radius:999px;color:${brandedEmailColors.ink};font-size:14px;font-weight:800;text-decoration:none;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

export function renderSystemEmailFooter(reason: string) {
  return `<p style="margin:0;color:${brandedEmailColors.slate};font-size:13px;line-height:1.6;">${escapeHtml(reason)}</p>`;
}

export function renderMemberEmailFooter({
  portalUrl,
  unsubscribeHtml,
}: {
  portalUrl?: string | null;
  unsubscribeHtml?: string | null;
}) {
  const url = normalizeBaseUrl(portalUrl);
  const optOut =
    unsubscribeHtml ||
    ` To stop receiving member updates, contact <a href="mailto:admin@pgpz.org" style="color:${brandedEmailColors.goldDeep};">admin@pgpz.org</a>.`;

  return `<p style="margin:0;color:${brandedEmailColors.slate};font-size:13px;line-height:1.6;">You are receiving this because your PGPZ Community membership is active. Visit <a href="${escapeHtml(url)}" style="color:${brandedEmailColors.goldDeep};">PGPZ Community</a> for member resources.${optOut}</p>`;
}

export function renderForwardedEmailCommunityCta({
  portalUrl,
  href,
}: {
  portalUrl?: string | null;
  href?: string | null;
}) {
  const url = normalizeBaseUrl(portalUrl);
  const linkHref = href || url;
  const qrUrl = `${url}/community-join-qr.png`;
  const colors = brandedEmailColors;

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;border:1px solid ${colors.line};border-radius:16px;background:#FFFDF5;overflow:hidden;">
    <tr>
      <td style="padding:18px 18px 18px 20px;vertical-align:middle;">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;font-weight:800;color:${colors.goldDeep};">Join the Community</div>
        <h2 style="margin:8px 0 8px;color:${colors.ink};font-size:19px;line-height:1.28;">Did someone forward you this email?</h2>
        <p style="margin:0 0 12px;color:${colors.slate};font-size:14px;line-height:1.62;">Join the PGPZ Community to receive updates directly and access other important resources.</p>
        <a href="${escapeHtml(linkHref)}" style="color:${colors.goldDeep};font-size:14px;font-weight:800;text-decoration:underline;text-decoration-color:${colors.gold};text-underline-offset:3px;">${escapeHtml(url)}</a>
      </td>
      <td width="132" style="padding:16px 18px 16px 0;vertical-align:middle;text-align:right;">
        <a href="${escapeHtml(linkHref)}" style="display:inline-block;text-decoration:none;">
          <img src="${escapeHtml(qrUrl)}" width="112" height="112" alt="QR code for ${escapeHtml(url)}" style="display:block;width:112px;height:112px;border:0;border-radius:12px;" />
        </a>
      </td>
    </tr>
  </table>`;
}

export function renderForwardedEmailCommunityText(portalUrl?: string | null) {
  const url = normalizeBaseUrl(portalUrl);
  return [
    "Did someone forward you this email?",
    "Join the PGPZ Community to receive updates directly and access other important resources.",
    url,
  ].join("\n");
}

export function textToEmailHtml(value: string) {
  return value
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => renderEmailParagraph(escapeHtml(paragraph).replace(/\n/g, "<br />")))
    .join("");
}

export function renderBrandedEmailShell({
  title,
  preheader,
  eyebrow = "PGPZ Community",
  subtitle,
  bodyHtml,
  footerHtml,
  trailingHtml = "",
}: {
  title: string;
  preheader: string;
  eyebrow?: string;
  subtitle?: string | null;
  bodyHtml: string;
  footerHtml: string;
  trailingHtml?: string;
}) {
  const colors = brandedEmailColors;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:${colors.cloud};font-family:Inter,Segoe UI,Arial,sans-serif;color:${colors.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${colors.cloud};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#ffffff;border:1px solid ${colors.line};border-radius:18px;overflow:hidden;box-shadow:0 22px 48px rgba(30,30,30,0.12);">
            <tr>
              <td style="background:linear-gradient(135deg,${colors.coal},#2A2111 60%,${colors.goldDeep});padding:28px 30px;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:0.26em;text-transform:uppercase;font-weight:700;color:${colors.goldSoft};">${escapeHtml(eyebrow)}</div>
                <h1 style="margin:12px 0 0;font-size:30px;line-height:1.18;color:#ffffff;">${escapeHtml(title)}</h1>
                ${
                  subtitle
                    ? `<p style="margin:12px 0 0;color:rgba(255,255,255,0.82);font-size:15px;line-height:1.6;">${escapeHtml(subtitle)}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px 12px;">
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
    ${trailingHtml}
  </body>
</html>`;
}
