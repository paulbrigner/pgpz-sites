function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export function buildBoardMagicLinkEmail(url: string) {
  const safeUrl = escapeHtml(url);
  return {
    subject: "Sign in to the PGPZ Board portal",
    text: `Use this one-time link to begin Board portal enrollment or recover access:\n\n${url}\n\nA passkey is required before Board content can be accessed. This link expires in 10 minutes. If you did not request it, you can ignore this email.`,
    html: `<p>Use this one-time link to begin Board portal enrollment or recover access:</p><p><a href="${safeUrl}">Continue to the Board portal</a></p><p>A passkey is required before Board content can be accessed. This link expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
  };
}
