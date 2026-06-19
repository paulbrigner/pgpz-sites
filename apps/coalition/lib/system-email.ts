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

const coalitionSignalGroupUrl =
  "https://signal.group/#CjQKIK5Li1s23K9yp5UbvHeyzVXAs-1WpSFKxyLslxXIqOJCEhCbzgPjjoDLC3hsdoeeDxPX";

export function buildMagicLinkEmail({
  url,
  host,
}: {
  url: string;
  host: string;
}) {
  const title = `Sign in to ${host}`;
  const safeHost = escapeHtml(host).replace(/\./g, "&#8203;.");
  const preheader = "Use this secure link to sign in to PGPZ Coalition.";
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
    footerHtml: renderSystemEmailFooter("This sign-in link was requested for PGPZ Coalition."),
  });
  const text = [
    title,
    "",
    "Use this secure link to sign in to PGPZ Coalition:",
    url,
    "",
    "If you did not request this email, you can safely ignore it.",
  ].join("\n");

  return { subject: title, html, text, preheader };
}

export function buildEmailChangeConfirmationEmail(confirmUrl: string) {
  const subject = "Confirm your email change";
  const preheader = "Confirm your new PGPZ Coalition email address.";
  const bodyHtml = [
    renderEmailParagraph("You requested to change your email on PGPZ Coalition."),
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
      "You are receiving this because an email change was requested for your PGPZ Coalition account.",
    ),
  });
  const text = [
    subject,
    "",
    "You requested to change your email on PGPZ Coalition.",
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
  const subject = "Welcome to PGPZ Coalition";
  const preheader = "Your PGPZ Coalition membership is active.";
  const bodyHtml = [
    renderEmailParagraph(`Hi ${escapeHtml(name)},`),
    renderEmailParagraph(
      "Welcome to the PGPZ Coalition. Your membership is active and you can sign in any time to access coalition resources, messaging, member contacts, and campaign materials.",
    ),
    renderEmailButton({ href: url, label: "Visit PGPZ Coalition" }),
    renderEmailParagraph(
      "Join the members-only Signal group for time-sensitive coordination, quick policy updates, and direct conversation with other coalition members.",
    ),
    renderEmailButton({ href: coalitionSignalGroupUrl, label: "Join Signal group" }),
    renderEmailParagraph("If you have questions, reply to this email and we will help."),
    renderEmailParagraph("Thanks,<br />PGPZ Coalition Team"),
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
    "Welcome to the PGPZ Coalition. Your membership is active and you can sign in any time to access coalition resources, messaging, member contacts, and campaign materials.",
    "",
    `Visit PGPZ Coalition: ${url}`,
    "",
    "Join the members-only Signal group for time-sensitive coordination, quick policy updates, and direct conversation with other coalition members:",
    coalitionSignalGroupUrl,
    "",
    "If you have questions, reply to this email and we will help.",
    "",
    "Thanks,",
    "PGPZ Coalition Team",
  ].join("\n");

  return { subject, html, text, preheader };
}

export function buildInvitationEmail({
  recipientName,
  recipientFirstName,
  recipientLastName,
  activationUrl,
}: {
  recipientName?: string | null;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  activationUrl: string;
}) {
  const name = getUserGreetingName({ name: recipientName, firstName: recipientFirstName, lastName: recipientLastName });
  const subject = "Activate your PGPZ Coalition account";
  const preheader = "You have been invited to join the PGPZ Coalition member workspace.";
  const bodyHtml = [
    renderEmailParagraph(`Hi ${escapeHtml(name)},`),
    renderEmailParagraph(
      "You have been invited to the PGPZ Coalition member workspace. Activate your account to access coalition updates, member contacts, Signal group details, and shared policy resources.",
    ),
    renderEmailButton({ href: activationUrl, label: "Activate account" }),
    renderEmailParagraph("This invitation link is intended for you. If you were not expecting this invitation, you can ignore this email."),
    renderEmailParagraph("Thanks,<br />PGPZ Coalition Team"),
  ].join("");
  const html = renderBrandedEmailShell({
    title: subject,
    preheader,
    subtitle: "Coalition invitation",
    bodyHtml,
    footerHtml: renderSystemEmailFooter(
      "You are receiving this because a PGPZ Coalition admin invited this email address.",
    ),
  });
  const text = [
    `Hi ${name},`,
    "",
    "You have been invited to the PGPZ Coalition member workspace.",
    "Activate your account:",
    activationUrl,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
    "",
    "Thanks,",
    "PGPZ Coalition Team",
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
  const preheader = normalizedText.replace(/\s+/g, " ").slice(0, 160) || "A message from PGPZ Coalition.";
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
