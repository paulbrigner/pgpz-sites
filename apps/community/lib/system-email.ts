import {
  escapeHtml,
  normalizeBaseUrl,
  renderBrandedEmailShell,
  renderEmailButton,
  renderEmailParagraph,
  renderMemberEmailFooter,
  renderSystemEmailFooter,
  stripHtmlToText,
  textToEmailHtml,
} from "@/lib/branded-email";
import { getUserGreetingName } from "@/lib/user-display-name";

export function buildMagicLinkEmail({
  url,
  host,
}: {
  url: string;
  host: string;
}) {
  const title = `Sign in to ${host}`;
  const safeHost = escapeHtml(host).replace(/\./g, "&#8203;.");
  const preheader = "Use this secure link to sign in to PGPZ Community.";
  const bodyHtml = [
    renderEmailParagraph(`Use this secure link to sign in to <strong>${safeHost}</strong>.`),
    renderEmailButton({ href: url, label: "Sign in" }),
    renderEmailParagraph("If you did not request this email, you can safely ignore it."),
  ].join("");
  const html = renderBrandedEmailShell({
    title,
    preheader,
    subtitle: "Secure member access",
    bodyHtml,
    footerHtml: renderSystemEmailFooter("This sign-in link was requested for PGPZ Community."),
  });
  const text = [
    title,
    "",
    "Use this secure link to sign in to PGPZ Community:",
    url,
    "",
    "If you did not request this email, you can safely ignore it.",
  ].join("\n");

  return { subject: title, html, text, preheader };
}

export function buildEmailChangeConfirmationEmail(confirmUrl: string) {
  const subject = "Confirm your email change";
  const preheader = "Confirm your new PGPZ Community email address.";
  const bodyHtml = [
    renderEmailParagraph("You requested to change your email on PGPZ Community."),
    renderEmailParagraph("Use the button below to confirm your new email. This link expires in 30 minutes."),
    renderEmailButton({ href: confirmUrl, label: "Confirm email change" }),
    renderEmailParagraph("If you did not request this, you can ignore this email."),
  ].join("");
  const html = renderBrandedEmailShell({
    title: subject,
    preheader,
    subtitle: "Profile security",
    bodyHtml,
    footerHtml: renderSystemEmailFooter(
      "You are receiving this because an email change was requested for your PGPZ Community account.",
    ),
  });
  const text = [
    subject,
    "",
    "You requested to change your email on PGPZ Community.",
    "Use this link to confirm your new email:",
    confirmUrl,
    "",
    "This link expires in 30 minutes. If you did not request this, ignore the email.",
  ].join("\n");

  return { subject, html, text, preheader };
}

export function buildWelcomeEmail({
  recipientName,
  recipientFirstName,
  recipientLastName,
  portalUrl,
}: {
  recipientName?: string | null;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  fallbackEmail?: string | null;
  portalUrl?: string | null;
}) {
  const name = getUserGreetingName({ name: recipientName, firstName: recipientFirstName, lastName: recipientLastName });
  const url = normalizeBaseUrl(portalUrl);
  const subject = "Welcome to PGPZ Community";
  const preheader = "Your PGPZ Community membership is active.";
  const bodyHtml = [
    renderEmailParagraph(`Hi ${escapeHtml(name)},`),
    renderEmailParagraph(
      "Welcome to the PGPZ Community. Your membership is active and you can sign in any time to access community resources.",
    ),
    renderEmailButton({ href: url, label: "Visit PGPZ Community" }),
    renderEmailParagraph("If you have questions, reply to this email and we will help."),
    renderEmailParagraph("Thanks,<br />PGPZ Community Team"),
  ].join("");
  const html = renderBrandedEmailShell({
    title: subject,
    preheader,
    subtitle: "Membership active",
    bodyHtml,
    footerHtml: renderMemberEmailFooter({ portalUrl: url }),
  });
  const text = [
    `Hi ${name},`,
    "",
    "Welcome to the PGPZ Community. Your membership is active and you can sign in any time to access community resources.",
    "",
    `Visit PGPZ Community: ${url}`,
    "",
    "If you have questions, reply to this email and we will help.",
    "",
    "Thanks,",
    "PGPZ Community Team",
  ].join("\n");

  return { subject, html, text, preheader };
}

export function buildCustomAdminEmail({
  subject,
  html,
  text,
}: {
  subject: string;
  html?: string | null;
  text?: string | null;
}) {
  const normalizedText = text?.trim() || (html ? stripHtmlToText(html) : "");
  const bodyHtml = html?.trim() || textToEmailHtml(normalizedText);
  const preheader = normalizedText.replace(/\s+/g, " ").slice(0, 160) || "A message from PGPZ Community.";
  const wrappedHtml = renderBrandedEmailShell({
    title: subject,
    preheader,
    subtitle: "Member message",
    bodyHtml,
    footerHtml: renderMemberEmailFooter({ portalUrl: normalizeBaseUrl() }),
  });

  return {
    subject,
    html: wrappedHtml,
    text: normalizedText,
    preheader,
  };
}
