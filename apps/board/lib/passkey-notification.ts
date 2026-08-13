import "server-only";

import nodemailer from "nodemailer";
import { assertBoardEmailReady } from "@/lib/email-transport";

export async function sendBoardPasskeySecurityNotice(
  email: string,
  action: "registered" | "removed" | "administratively reset",
) {
  try {
    const { transport, from } = assertBoardEmailReady();
    const transporter = nodemailer.createTransport(transport as never);
    await transporter.sendMail({
      from,
      to: email,
      subject: `Board portal passkey ${action}`,
      text: `A passkey was ${action} for your PGPZ Board portal account. If you did not expect this change, contact the Board Chair or Executive Director immediately.`,
      html: `<p>A passkey was <strong>${action}</strong> for your PGPZ Board portal account.</p><p>If you did not expect this change, contact the Board Chair or Executive Director immediately.</p>`,
    });
  } catch (error) {
    console.error("[board] passkey security notification failed", error);
  }
}
