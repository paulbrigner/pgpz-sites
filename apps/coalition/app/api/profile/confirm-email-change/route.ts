import { NextRequest, NextResponse } from "next/server";
import { findAppUserByEmail, getAppUserById, normalizeEmail } from "@/lib/app-users";
import {
  consumeEmailChangeTokenTransactionItem,
  getEmailChangeToken,
  type EmailChangeToken,
} from "@/lib/email-change-token";
import {
  BetterAuthEmailCollisionError,
  updateAppAndBetterAuthUserEmail,
} from "@/lib/better-auth-user-email";
import { isValidEmail } from "@/lib/admin/email-transport";
import { expireLegacySessionCookies } from "@/lib/legacy-session-cookies";

type ValidatedChange = {
  record: EmailChangeToken;
  user: Record<string, any>;
  newEmail: string;
};

type ValidationFailure = {
  title: string;
  message: string;
  status: number;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const htmlResponse = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;padding:24px;max-width:640px;margin:0 auto;color:#172033"><h2>${escapeHtml(title)}</h2>${body}<p><a href="/settings/profile">Return to profile settings</a></p></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store, max-age=0",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
      },
    },
  );

const failureResponse = (failure: ValidationFailure) =>
  htmlResponse(failure.title, `<p>${escapeHtml(failure.message)}</p>`, failure.status);

const expired = (record: EmailChangeToken) => record.expires.getTime() < Date.now();

async function validateChange(identifier: string, token: string): Promise<ValidatedChange | ValidationFailure> {
  if (!identifier || !token) {
    return { title: "Email change failed", message: "Missing or invalid token.", status: 400 };
  }

  const record = await getEmailChangeToken({ identifier, token });
  if (!record) {
    return {
      title: "Email change failed",
      message: "This link is invalid or has already been used.",
      status: 404,
    };
  }
  if (expired(record)) {
    return {
      title: "Email change failed",
      message: "This link has expired. Please request a new one.",
      status: 410,
    };
  }
  if (identifier !== `EMAIL_CHANGE#${record.userId}`) {
    return { title: "Email change failed", message: "Invalid token payload.", status: 400 };
  }

  const newEmail = normalizeEmail(record.newEmail);
  if (!newEmail || !isValidEmail(newEmail)) {
    return { title: "Email change failed", message: "Invalid token payload.", status: 400 };
  }

  const user = await getAppUserById(record.userId, { consistentRead: true });
  if (!user?.id) {
    return { title: "Email change failed", message: "Account not found.", status: 404 };
  }
  if (user.accountStatus === "deactivated" || user.deactivatedAt) {
    return {
      title: "Email change unavailable",
      message: "This account is deactivated. Contact an administrator for help.",
      status: 409,
    };
  }

  return { record, user, newEmail };
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function expireAuthCookies(response: NextResponse, request: NextRequest) {
  const expires = new Date(0).toUTCString();
  response.headers.append("Set-Cookie", `better-auth.session_token=; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`);
  response.headers.append("Set-Cookie", `__Secure-better-auth.session_token=; Path=/; Expires=${expires}; HttpOnly; SameSite=None; Secure`);
  response.headers.append("Set-Cookie", `better-auth.session_data=; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`);
  response.headers.append("Set-Cookie", `__Secure-better-auth.session_data=; Path=/; Expires=${expires}; HttpOnly; SameSite=None; Secure`);
  return expireLegacySessionCookies(response, request);
}

export async function GET(request: NextRequest) {
  const identifier = request.nextUrl.searchParams.get("identifier") || "";
  const token = request.nextUrl.searchParams.get("token") || "";

  try {
    const validation = await validateChange(identifier, token);
    if (!("record" in validation)) return failureResponse(validation);

    const collision = await findAppUserByEmail(validation.newEmail);
    if (collision?.id && collision.id !== validation.user.id) {
      return failureResponse({
        title: "Email change failed",
        message: "That email is already in use.",
        status: 409,
      });
    }

    return htmlResponse(
      "Confirm email change",
      `<p>Change your account email to <strong>${escapeHtml(validation.newEmail)}</strong>?</p><form method="post" action="/api/profile/confirm-email-change"><input type="hidden" name="identifier" value="${escapeHtml(identifier)}"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit" style="padding:10px 16px;cursor:pointer">Confirm email change</button></form>`,
    );
  } catch (error) {
    console.error("/api/profile/confirm-email-change GET error:", error);
    return failureResponse({
      title: "Email change failed",
      message: "An unexpected error occurred. Please request a new link and try again.",
      status: 500,
    });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return failureResponse({
      title: "Email change failed",
      message: "The confirmation request did not come from this site.",
      status: 403,
    });
  }

  const form = await request.formData().catch(() => null);
  const identifier = typeof form?.get("identifier") === "string" ? String(form.get("identifier")) : "";
  const token = typeof form?.get("token") === "string" ? String(form.get("token")) : "";

  try {
    const validation = await validateChange(identifier, token);
    if (!("record" in validation)) return failureResponse(validation);

    const collision = await findAppUserByEmail(validation.newEmail);
    if (collision?.id && collision.id !== validation.user.id) {
      return failureResponse({
        title: "Email change failed",
        message: "That email is already in use.",
        status: 409,
      });
    }

    await updateAppAndBetterAuthUserEmail({
      appUserId: validation.user.id,
      betterAuthUserId: validation.record.betterAuthUserId,
      oldEmail: String(validation.user.email || ""),
      newEmail: validation.newEmail,
      requireActiveAccount: true,
      additionalTransactItems: [consumeEmailChangeTokenTransactionItem(validation.record)],
    });

    const redirectUrl = new URL("/signin?reason=email-updated", request.nextUrl.origin);
    return expireAuthCookies(NextResponse.redirect(redirectUrl, 303), request);
  } catch (error) {
    if (error instanceof BetterAuthEmailCollisionError) {
      return failureResponse({ title: "Email change failed", message: error.message, status: 409 });
    }

    const currentUser = identifier.startsWith("EMAIL_CHANGE#")
      ? await getAppUserById(identifier.slice("EMAIL_CHANGE#".length), { consistentRead: true })
      : null;
    if (currentUser?.accountStatus === "deactivated" || currentUser?.deactivatedAt) {
      return failureResponse({
        title: "Email change unavailable",
        message: "This account was deactivated before the change completed.",
        status: 409,
      });
    }
    const remaining = identifier && token ? await getEmailChangeToken({ identifier, token }) : null;
    if (!remaining) {
      return failureResponse({
        title: "Email change failed",
        message: "This link is invalid or has already been used.",
        status: 409,
      });
    }

    console.error("/api/profile/confirm-email-change POST error:", error);
    return failureResponse({
      title: "Email change failed",
      message: "The account changed before confirmation completed. Please request a new link.",
      status: 409,
    });
  }
}
