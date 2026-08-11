import type { NewsletterMailerConfig } from "./contracts";

export const DEFAULT_NEWSLETTER_MAILER_CONFIG: NewsletterMailerConfig = {
  newslettersEndpoint: "/api/admin/newsletters",
  jobsEndpoint: "/api/admin/jobs",
};

export const emptyNewsletterForm = {
  id: "",
  subject: "",
  preheader: "",
  body: "",
};

export const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const metricText = (value: number | null) =>
  typeof value === "number" ? value.toLocaleString() : "—";
