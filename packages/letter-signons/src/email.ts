import type {
  LetterRevisionChangeType,
  LetterSignerIdentity,
} from "./contracts";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const greetingName = (displayName: string) =>
  displayName.trim().split(/\s+/, 1)[0] || "there";

const signerLabel = (signer: LetterSignerIdentity) =>
  signer.signerKind === "organization"
    ? `${signer.organizationName} (authorized by ${signer.displayName})`
    : signer.displayName;

function emailFrame({
  siteName,
  heading,
  body,
  actionUrl,
  actionLabel,
}: {
  siteName: string;
  heading: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
}) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7fb;color:#172033;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(heading)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #d9e0ea;border-radius:16px;overflow:hidden">
          <tr><td style="background:#1e1e1e;color:#f5a800;padding:22px 28px;font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(siteName)}</td></tr>
          <tr><td style="padding:30px 28px">
            <h1 style="margin:0 0 18px;font-size:26px;line-height:1.2;color:#172033">${escapeHtml(heading)}</h1>
            ${body}
            <p style="margin:26px 0 0">
              <a href="${escapeHtml(actionUrl)}" style="display:inline-block;border-radius:999px;background:#233876;color:#ffffff;padding:12px 20px;text-decoration:none;font-weight:700">${escapeHtml(actionLabel)}</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildLetterSignOnReceiptEmail({
  siteName,
  campaignTitle,
  campaignUrl,
  deadlineAt,
  documentVersion,
  documentSha256,
  acceptedAt,
  signer,
}: {
  siteName: string;
  campaignTitle: string;
  campaignUrl: string;
  deadlineAt: string;
  documentVersion: number;
  documentSha256: string;
  acceptedAt: string;
  signer: LetterSignerIdentity;
}) {
  const subject = `Sign-on confirmed: ${campaignTitle}`;
  const label = signerLabel(signer);
  const accepted = new Date(acceptedAt).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const deadline = new Date(deadlineAt).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const text = [
    `Hi ${greetingName(signer.displayName)},`,
    "",
    `Your sign-on to "${campaignTitle}" is confirmed.`,
    `Listed as: ${label}`,
    `Document version: ${documentVersion}`,
    `Document SHA-256: ${documentSha256}`,
    `Accepted: ${accepted} UTC`,
    `Sign-on deadline: ${deadline} UTC`,
    "",
    "The exact PDF you reviewed is attached. Keep this email as your receipt.",
    `Review the campaign and signer list: ${campaignUrl}`,
  ].join("\n");
  const body = [
    `<p style="margin:0 0 16px;line-height:1.65">Hi ${escapeHtml(greetingName(signer.displayName))},</p>`,
    `<p style="margin:0 0 16px;line-height:1.65">Your sign-on to <strong>${escapeHtml(campaignTitle)}</strong> is confirmed.</p>`,
    `<div style="margin:18px 0;padding:16px;border-radius:12px;background:#f7f3e8;line-height:1.7">`,
    `<strong>Listed as:</strong> ${escapeHtml(label)}<br>`,
    `<strong>Document version:</strong> ${documentVersion}<br>`,
    `<strong>Document SHA-256:</strong> <span style="font-family:monospace;font-size:12px;word-break:break-all">${escapeHtml(documentSha256)}</span><br>`,
    `<strong>Accepted:</strong> ${escapeHtml(accepted)} UTC<br>`,
    `<strong>Sign-on deadline:</strong> ${escapeHtml(deadline)} UTC`,
    `</div>`,
    `<p style="margin:0;line-height:1.65">The exact PDF you reviewed is attached. Keep this email as your receipt.</p>`,
  ].join("");

  return {
    subject,
    text,
    html: emailFrame({
      siteName,
      heading: "Your sign-on is confirmed",
      body,
      actionUrl: campaignUrl,
      actionLabel: "Review letter and signers",
    }),
  };
}

export function buildLetterSignerUpdateEmail({
  siteName,
  campaignTitle,
  campaignUrl,
  displayName,
  subject,
  message,
  changeType,
  documentVersion,
}: {
  siteName: string;
  campaignTitle: string;
  campaignUrl: string;
  displayName: string;
  subject: string;
  message: string;
  changeType: LetterRevisionChangeType | "status" | "delivered";
  documentVersion: number;
}) {
  const reconfirmationRequired = changeType === "material";
  const actionLabel = reconfirmationRequired
    ? "Review and reconfirm"
    : "Review campaign status";
  const text = [
    `Hi ${greetingName(displayName)},`,
    "",
    message.trim(),
    "",
    `Letter: ${campaignTitle}`,
    `Current document version: ${documentVersion}`,
    ...(reconfirmationRequired
      ? ["This material revision requires a new confirmation before your sign-on is current."]
      : []),
    "",
    `${actionLabel}: ${campaignUrl}`,
  ].join("\n");
  const body = [
    `<p style="margin:0 0 16px;line-height:1.65">Hi ${escapeHtml(greetingName(displayName))},</p>`,
    `<p style="margin:0 0 16px;line-height:1.65;white-space:pre-line">${escapeHtml(message.trim())}</p>`,
    `<p style="margin:0;line-height:1.65"><strong>Letter:</strong> ${escapeHtml(campaignTitle)}<br><strong>Current document version:</strong> ${documentVersion}</p>`,
    reconfirmationRequired
      ? `<p style="margin:16px 0 0;padding:14px;border-radius:10px;background:#fff4db;line-height:1.55"><strong>Action required:</strong> This material revision requires a new confirmation before your sign-on is current.</p>`
      : "",
  ].join("");

  return {
    subject: subject.trim(),
    text,
    html: emailFrame({
      siteName,
      heading: subject.trim(),
      body,
      actionUrl: campaignUrl,
      actionLabel,
    }),
  };
}
