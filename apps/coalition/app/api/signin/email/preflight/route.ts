import { NextRequest, NextResponse } from "next/server";
import { assertLegalAcceptanceForAccountEmail } from "@/lib/auth-options";
import { BETTER_AUTH_BASE_PATH } from "@/lib/better-auth-constants";
import { NEXTAUTH_URL, SITE_URL } from "@/lib/config";

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveRequestOrigin = (request: NextRequest) => {
  try {
    return request.nextUrl?.origin || new URL(request.url).origin;
  } catch {
    return "https://coalition.pgpz.org";
  }
};

const buildValidationUrl = (callbackURL: string, requestOrigin: string) => {
  const baseUrl = (SITE_URL || NEXTAUTH_URL || requestOrigin || "https://coalition.pgpz.org").replace(/\/+$/, "");
  const url = new URL(`${BETTER_AUTH_BASE_PATH}/magic-link/verify`, baseUrl);
  url.searchParams.set("callbackURL", callbackURL || "/");
  return url.toString();
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const callbackURL =
    typeof body?.callbackURL === "string" && body.callbackURL.trim()
      ? body.callbackURL.trim()
      : "/";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    await assertLegalAcceptanceForAccountEmail(
      email,
      buildValidationUrl(callbackURL, resolveRequestOrigin(request)),
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not request a sign-in email." },
      { status: 400 },
    );
  }
}
