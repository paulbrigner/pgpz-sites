import { NextRequest, NextResponse } from "next/server";
import { DynamoDBAdapter } from "@next-auth/dynamodb-adapter";
import { randomBytes } from "crypto";
// Nodemailer types are not installed; import with explicit any for runtime only.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import nodemailer from "nodemailer";
import {
  EMAIL_FROM,
  NEXTAUTH_TABLE,
  NEXTAUTH_URL,
} from "@/lib/config";
import { documentClient } from "@/lib/dynamodb";
import { resolveAppSession } from "@/lib/app-session";
import { findAppUserByEmail } from "@/lib/app-users";
import { buildEmailServerConfig } from "@/lib/admin/email-transport";
import { buildEmailChangeConfirmationEmail } from "@/lib/system-email";

const EMAIL_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

const isValidEmail = (value: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
};

export async function POST(request: NextRequest) {
  try {
    const session = await resolveAppSession(request.headers);
    const userId = session?.user?.id || "";
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email } = await request.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const adapter: any = DynamoDBAdapter(documentClient as any, {
      tableName: NEXTAUTH_TABLE || "NextAuth",
    });

    // Prevent collisions with existing app accounts across both auth providers.
    const existing = await findAppUserByEmail(normalizedEmail);
    if (existing?.id && existing.id !== userId) {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }

    const identifier = `EMAIL_CHANGE#${userId}`;
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + EMAIL_TOKEN_TTL_MS);
    await adapter.createVerificationToken({
      identifier,
      token,
      expires,
      newEmail: normalizedEmail,
      userId,
    });

    const host = request.headers.get("host");
    const baseUrl = NEXTAUTH_URL || (host ? `https://${host}` : request.nextUrl.origin);
    const confirmUrl = new URL("/api/profile/confirm-email-change", baseUrl);
    confirmUrl.searchParams.set("token", token);
    confirmUrl.searchParams.set("identifier", identifier);

    const transportConfig = buildEmailServerConfig();
    if (!transportConfig || !EMAIL_FROM) {
      return NextResponse.json({ error: "Email provider not configured" }, { status: 500 });
    }
    const transporter = nodemailer.createTransport(transportConfig);
    const built = buildEmailChangeConfirmationEmail(confirmUrl.toString());
    await transporter.sendMail({
      to: normalizedEmail,
      from: EMAIL_FROM,
      subject: built.subject,
      text: built.text,
      html: built.html,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("/api/profile/request-email-change error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
