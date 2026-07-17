import { NextRequest, NextResponse } from "next/server";
import { findAppUserByEmail, getAppUserById } from "@/lib/app-users";
import { consumeEmailChangeToken } from "@/lib/email-change-token";
import {
  BetterAuthEmailCollisionError,
  updateAppAndBetterAuthUserEmail,
} from "@/lib/better-auth-user-email";
import { expireLegacySessionCookies } from "@/lib/legacy-session-cookies";

const renderHtml = (title: string, message: string) =>
  new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:Arial,sans-serif;padding:24px;max-width:640px;margin:0 auto;"><h2>${title}</h2><p>${message}</p><p><a href="/signin?reason=email-updated">Return to sign in</a></p></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const isExpired = (expires: any) => {
  if (!expires) return false;
  const date = expires instanceof Date ? expires : new Date(expires);
  return Number.isFinite(date.getTime()) && date.getTime() < Date.now();
};

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const token = search.get("token");
  const identifier = search.get("identifier");
  if (!token || !identifier) {
    return renderHtml("Email change failed", "Missing or invalid token.");
  }

  try {
    const record = await consumeEmailChangeToken({ identifier, token });
    if (!record) {
      return renderHtml("Email change failed", "This link is invalid or has already been used.");
    }
    if (isExpired((record as any).expires)) {
      return renderHtml("Email change failed", "This link has expired. Please request a new one.");
    }

    const rawNewEmail = record.newEmail;
    const userId = record.userId;
    if (identifier !== `EMAIL_CHANGE#${userId}` || !rawNewEmail) {
      return renderHtml("Email change failed", "Invalid token payload.");
    }
    const newEmail = rawNewEmail.trim().toLowerCase();

    const user = await getAppUserById(userId);
    if (!user?.id) {
      return renderHtml("Email change failed", "Account not found.");
    }

    const collision = await findAppUserByEmail(newEmail);
    if (collision && collision.id !== user.id) {
      return renderHtml("Email change failed", "That email is already in use.");
    }

    await updateAppAndBetterAuthUserEmail({
      appUserId: user.id,
      betterAuthUserId: record.betterAuthUserId,
      oldEmail: String(user.email || ""),
      newEmail,
    });

    const host = request.headers.get("host");
    const baseUrl = host ? `https://${host}` : request.url;
    const redirectUrl = new URL("/signin?reason=email-updated", baseUrl);
    const response = NextResponse.redirect(redirectUrl);
    // Expire both current and legacy sessions so the user signs back in with the new email.
    const expires = new Date(0).toUTCString();
    response.headers.append("Set-Cookie", `better-auth.session_token=; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`);
    response.headers.append("Set-Cookie", `__Secure-better-auth.session_token=; Path=/; Expires=${expires}; HttpOnly; SameSite=None; Secure`);
    response.headers.append("Set-Cookie", `better-auth.session_data=; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`);
    response.headers.append("Set-Cookie", `__Secure-better-auth.session_data=; Path=/; Expires=${expires}; HttpOnly; SameSite=None; Secure`);
    return expireLegacySessionCookies(response, request);
  } catch (e) {
    if (e instanceof BetterAuthEmailCollisionError) {
      return renderHtml("Email change failed", e.message);
    }
    console.error("/api/profile/confirm-email-change error:", e);
    return renderHtml("Email change failed", "An unexpected error occurred. Please request a new link and try again.");
  }
}
