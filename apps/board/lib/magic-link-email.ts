function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export function buildBoardMagicLinkEmail(url: string) {
  const safeUrl = escapeHtml(url);
  return {
    subject: "Sign in to the PGPZ Board portal",
    text: `Use this one-time link to sign in to the PGPZ Board portal:\n\n${url}\n\nThis link expires in 10 minutes. If you did not request it, you can ignore this email.`,
    html: `<p>Use this one-time link to sign in to the PGPZ Board portal:</p><p><a href="${safeUrl}">Sign in to the Board portal</a></p><p>This link expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
  };
}
