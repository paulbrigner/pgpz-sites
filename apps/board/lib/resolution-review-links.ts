/** Opaque UI target only; access is still enforced by the meeting/review guards. */
export function reviewThreadId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : null;
}

export function reviewThreadPath(meetingId: string, submissionId: unknown) {
  const id = reviewThreadId(submissionId);
  return `/meetings/${encodeURIComponent(meetingId)}${id ? `?reviewThread=${encodeURIComponent(id)}` : ""}`;
}
