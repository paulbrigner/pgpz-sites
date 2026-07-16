import "server-only";

import type { NextRequest, NextResponse } from "next/server";

const legacySessionCookiePattern = /^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?$/;
const legacyBaseCookieNames = ["next-auth.session-token", "__Secure-next-auth.session-token"];

export function expireLegacySessionCookies(response: NextResponse, request?: NextRequest) {
  const names = new Set(legacyBaseCookieNames);
  for (const cookie of request?.cookies.getAll() || []) {
    if (legacySessionCookiePattern.test(cookie.name)) names.add(cookie.name);
  }

  for (const name of names) {
    const secure = name.startsWith("__Secure-");
    response.cookies.set({
      name,
      value: "",
      path: "/",
      expires: new Date(0),
      httpOnly: true,
      sameSite: secure ? "none" : "lax",
      secure,
    });
  }

  return response;
}
