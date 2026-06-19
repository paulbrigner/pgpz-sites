const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

export function normalizeXHandle(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Enter an X handle like @pgpz or an x.com profile URL.");
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") {
      throw new Error("X profile URL must be on x.com or twitter.com.");
    }
    candidate = url.pathname.split("/").filter(Boolean)[0] || "";
  }

  const handle = candidate.replace(/^@/, "").trim();
  if (!X_HANDLE_PATTERN.test(handle)) {
    throw new Error("X handle must be 1-15 letters, numbers, or underscores.");
  }

  return `@${handle}`;
}
