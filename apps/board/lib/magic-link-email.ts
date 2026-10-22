function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export function buildBoardMagicLinkEmail(url: string) {
  const safeUrl = escapeHtml(url);
  return {
    subject: "Sign in to the PGPZ Board portal",
    text: `Open this link, then select Continue on the Board sign-in page:\n\n${url}\n\nFor first-time setup, add a passkey and verify it when prompted. If you already have a passkey, verify it to continue. A passkey is required before Board content can be accessed. This one-time link expires in 10 minutes after it was sent. If you did not request it, you can ignore this email.`,
    html: `<p>Open this link, then select <strong>Continue</strong> on the Board sign-in page:</p><p><a href="${safeUrl}">Continue Board sign-in</a></p><p>For first-time setup, add a passkey and verify it when prompted. If you already have a passkey, verify it to continue.</p><p>A passkey is required before Board content can be accessed. This one-time link expires in 10 minutes after it was sent. If you did not request it, you can ignore this email.</p>`,
  };
}
