import { NextRequest, NextResponse } from "next/server";
import { MemberProfileValidationError } from "@pgpz/member-directory";
import { resolveAppSession } from "@/lib/app-session";
import { BETTER_AUTH_TRUSTED_ORIGINS, BETTER_AUTH_URL, SITE_URL } from "@/lib/config";
import { getOwnerMemberProfile, saveOwnerMemberProfile } from "@/lib/member-profiles";

export const dynamic = "force-dynamic";

const privateJson = (body: unknown, init?: ResponseInit) => {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

const sameOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const allowedOrigins = new Set<string>();
    for (const candidate of [SITE_URL, BETTER_AUTH_URL, ...(BETTER_AUTH_TRUSTED_ORIGINS || "").split(/[,\s]+/)]) {
      if (!candidate) continue;
      try { allowedOrigins.add(new URL(candidate).origin); } catch { /* Ignore malformed optional configuration. */ }
    }
    if (process.env.NODE_ENV !== "production") allowedOrigins.add(request.nextUrl.origin);
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
};

export async function GET(request: NextRequest) {
  const session = await resolveAppSession(request.headers);
  if (!session?.user?.id) return privateJson({ error: "Unauthorized" }, { status: 401 });
  return privateJson(await getOwnerMemberProfile(session.user.id));
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return privateJson({ error: "Invalid request origin" }, { status: 403 });
  const session = await resolveAppSession(request.headers);
  if (!session?.user?.id) return privateJson({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const result = await saveOwnerMemberProfile({
      userId: session.user.id,
      slug: body?.slug,
      headline: body?.headline,
      bio: body?.bio,
      publish: body?.published === true,
      expectedVersion: Number.isInteger(body?.version) ? body.version : 0,
    });
    return privateJson({ ok: true, profile: result });
  } catch (error: any) {
    if (error instanceof MemberProfileValidationError || /required|characters|HTTPS|handle/i.test(error?.message || "")) {
      return privateJson({ error: error.message }, { status: 400 });
    }
    if (error?.name === "TransactionCanceledException" || error?.name === "ConditionalCheckFailedException") {
      return privateJson({ error: "That profile URL was just claimed or the profile changed. Refresh and try again." }, { status: 409 });
    }
    if (/membership/i.test(error?.message || "")) {
      return privateJson({ error: error.message }, { status: 403 });
    }
    console.error("member profile update failed", error);
    return privateJson({ error: "Unable to update the member profile." }, { status: 500 });
  }
}
