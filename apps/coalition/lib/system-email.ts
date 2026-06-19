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

export const DEFAULT_INVITATION_EMAIL_SUBJECT = "Special invitation to join the PGPZ Coalition";

export const DEFAULT_INVITATION_EMAIL_BODY = `Hi [Name],

I’m writing to extend a special invitation for you to join the PGPZ Coalition — a new, focused group of policy professionals, advocates, and ecosystem participants committed to advancing informed, constructive policy engagement around Zcash.

You have been selected for this invitation because of your involvement in crypto policy and your interest in the long-term success of the Zcash ecosystem. As policymakers continue to make decisions that will shape the future of privacy-preserving digital cash, Zcash needs credible, coordinated, and practical policy engagement from people who understand both the technology and the policy environment.

PGPZ — Pretty Good Policy for Zcash — is an evolution of the prior PGP* (Pretty Good Policy) for Crypto initiative. This next phase will be very different from the earlier iteration. Rather than serving as a broad crypto policy convening, PGPZ will be more focused, more action-oriented, and centered on Zcash-impacting policy developments, policymaker education, advocacy strategy, and practical coordination.

As part of this launch, I would also like to invite you to the first PGPZ Coalition Launch Breakfast — our inaugural “Pretty Good Pancake” breakfast for the coalition.

Date: Tuesday, June 30, 2026
Time: 9:00 – 11:00 am
Location: Blockchain Association office (large conference room)
Address: 1155 F St. NW, Suite 300, Washington, D.C. 20004
Room: Large conference room

Agenda

9:00 – 9:30 am
Networking breakfast

9:30 – 11:00 am
Roundtable discussion featuring a special speaker, TBA

The breakfast will bring together a small group of invited participants for a candid discussion about Zcash policy priorities, key developments affecting the ecosystem, and how the PGPZ Coalition can help ensure that Zcash is accurately understood in policy debates.

The roundtable will be held under Chatham House Rule to support open and constructive discussion. There will be no livestream or public broadcast, though we expect to accommodate a limited number of remote participants who are unable to attend in person.

Because room capacity is limited and registration is subject to approval, please RSVP as soon as possible here:

[RSVP for the PGPZ Coalition Launch Breakfast](https://luma.com/pgpfor-evvd?utm_source=chatgpt.com)

I hope you will consider joining the PGPZ Coalition and participating in this first launch breakfast. Your perspective would be valuable as we begin this next phase of coordinated Zcash policy engagement.

Best,
Paul Brigner
Founder of PGPZ
Chief Policy & Regulatory Officer,
Zcash Open Development Lab`;

type InvitationTemplateContext = {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  activationUrl: string;
};

type InvitationTemplateInput = {
  subject?: string | null;
  body?: string | null;
};

const applyInvitationTemplate = (value: string, context: InvitationTemplateContext) =>
  value
    .replace(/\[Name\]|\{\{name\}\}/gi, context.name)
    .replace(/\[First Name\]|\{\{firstName\}\}/gi, context.firstName || context.name)
    .replace(/\[Last Name\]|\{\{lastName\}\}/gi, context.lastName || "")
    .replace(/\[Activation Link\]|\{\{activationUrl\}\}/gi, context.activationUrl);

const brandedInvitationLinkColor = "#8A5A00";
const brandedInvitationUnderlineColor = "#F5A800";
const markdownLinkPattern = /\[([^\]\n]+)\]\s*\(\s*(https?:\/\/[^)\s]+)\s*\)/g;

const renderInlineInvitationTemplate = (value: string) => {
  let html = "";
  let lastIndex = 0;
  for (const match of value.matchAll(markdownLinkPattern)) {
    const index = match.index || 0;
    html += escapeHtml(value.slice(lastIndex, index));
    html += `<a href="${escapeHtml(match[2])}" style="color:${brandedInvitationLinkColor};font-weight:800;text-decoration:underline;text-decoration-color:${brandedInvitationUnderlineColor};text-underline-offset:3px;">${escapeHtml(match[1])}</a>`;
    lastIndex = index + match[0].length;
  }
  html += escapeHtml(value.slice(lastIndex));
  return html;
};

const renderInvitationTemplateTextLine = (value: string) =>
  value.replace(markdownLinkPattern, (_match, label, url) => `${label}: ${url}`);

const renderInvitationTemplateHtml = (body: string, activationUrl: string) => {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const [greeting, ...rest] = paragraphs;
  const renderedRest = rest
    .map((paragraph) => renderEmailParagraph(renderInlineInvitationTemplate(paragraph).replace(/\n/g, "<br />")))
    .join("");

  return [
    greeting ? renderEmailParagraph(renderInlineInvitationTemplate(greeting).replace(/\n/g, "<br />")) : "",
    renderEmailButton({ href: activationUrl, label: "Activate PGPZ Coalition account" }),
    renderedRest,
    renderEmailParagraph("This activation link is intended for you. If you were not expecting this invitation, you can ignore this email."),
  ].join("");
};

const renderInvitationTemplateText = (body: string, activationUrl: string) => {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const [greeting, ...rest] = paragraphs;
  return [
    greeting ? renderInvitationTemplateTextLine(greeting) : "",
    "",
    "Activate your PGPZ Coalition account:",
    activationUrl,
    "",
    ...rest.flatMap((paragraph) => [renderInvitationTemplateTextLine(paragraph), ""]),
    "This activation link is intended for you. If you were not expecting this invitation, you can ignore this email.",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

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
  template,
}: {
  recipientName?: string | null;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  activationUrl: string;
  template?: InvitationTemplateInput | null;
}) {
  const name = getUserGreetingName({ name: recipientName, firstName: recipientFirstName, lastName: recipientLastName });
  const context = {
    name,
    firstName: recipientFirstName,
    lastName: recipientLastName,
    activationUrl,
  };
  const subject = applyInvitationTemplate(
    template?.subject?.trim() || DEFAULT_INVITATION_EMAIL_SUBJECT,
    context,
  );
  const templateBody = applyInvitationTemplate(
    template?.body?.trim() || DEFAULT_INVITATION_EMAIL_BODY,
    context,
  );
  const preheader = "You have been invited to join the PGPZ Coalition.";
  const bodyHtml = renderInvitationTemplateHtml(templateBody, activationUrl);
  const html = renderBrandedEmailShell({
    title: subject,
    preheader,
    subtitle: "Coalition invitation",
    bodyHtml,
    footerHtml: renderSystemEmailFooter(
      "You are receiving this because a PGPZ Coalition admin invited this email address.",
    ),
  });
  const text = renderInvitationTemplateText(templateBody, activationUrl);

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
