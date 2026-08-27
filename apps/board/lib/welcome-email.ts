import "server-only";

import nodemailer from "nodemailer";
import type { BoardAccessRole } from "@/lib/board-access";
import { SITE_URL } from "@/lib/config";
import { assertBoardEmailReady } from "@/lib/email-transport";

const ROLE_LABELS: Readonly<Record<BoardAccessRole, string>> = {
  member: "Director",
  chair: "Board Chair",
  "board-support": "Board Support",
  admin: "Board Chair",
  "executive-director": "Executive Director",
  "legal-counsel": "Legal Counsel",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export function buildBoardWelcomeEmail(input: {
  name: string;
  email: string;
  role: BoardAccessRole;
  siteUrl?: string;
}) {
  const name = input.name.trim() || "Board member";
  const email = input.email.trim().toLowerCase();
  const roleLabel = ROLE_LABELS[input.role];
  const signInUrl = new URL("/signin", input.siteUrl || SITE_URL).toString();
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeRole = escapeHtml(roleLabel);
  const safeSignInUrl = escapeHtml(signInUrl);
  return {
    subject: "Welcome to the PGPZ Board portal",
    text: `Hello ${name},\n\nYou now have access to the PGPZ Board portal as ${roleLabel}.\n\nGet started: ${signInUrl}\n\nEnter ${email}, request a one-time email link, and then register a passkey for secure access. The email link expires after 10 minutes and cannot open Board content until passkey enrollment is complete.\n\nIf you did not expect this invitation, contact the Board Chair or Executive Director.`,
    html: `<p>Hello ${safeName},</p><p>You now have access to the PGPZ Board portal as <strong>${safeRole}</strong>.</p><p><a href="${safeSignInUrl}">Get started with the Board portal</a></p><p>Enter <strong>${safeEmail}</strong>, request a one-time email link, and then register a passkey for secure access. The email link expires after 10 minutes and cannot open Board content until passkey enrollment is complete.</p><p>If you did not expect this invitation, contact the Board Chair or Executive Director.</p>`,
  };
}

export async function sendBoardWelcomeEmail(input: {
  name: string;
  email: string;
  role: BoardAccessRole;
}) {
  const { transport, from } = assertBoardEmailReady();
  const transporter = nodemailer.createTransport(transport as never);
  await transporter.sendMail({
    from,
    to: input.email.trim().toLowerCase(),
    ...buildBoardWelcomeEmail(input),
  });
}
