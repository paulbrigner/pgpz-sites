import "server-only";
import nodemailer from "nodemailer";
import { assertBoardEmailReady } from "./email-transport";
import { SITE_URL } from "./config";

export function disclosureNotice(input: { id: string; year: number; dueDate: string | null; to: string }) {
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(input.to)) throw new Error("One recipient is required");
  return { to: input.to, subject: "PGPZ Board: disclosure action requested",
    text: `A ${input.year} individual disclosure is ready for your attention in the PGPZ Board portal.${input.dueDate ? ` Requested completion date: ${input.dueDate}.` : ""}\n\nOpen the secure portal: ${new URL(`/disclosures/${encodeURIComponent(input.id)}`, SITE_URL)}\n\nSign in to view the request. Disclosure answers and review notes are available only to authorized participants.`,
  };
}
export async function sendDisclosureNotice(input: Parameters<typeof disclosureNotice>[0]) {
  const { transport, from } = assertBoardEmailReady();
  await nodemailer.createTransport(transport as never).sendMail({ from, ...disclosureNotice(input) } as never);
}
