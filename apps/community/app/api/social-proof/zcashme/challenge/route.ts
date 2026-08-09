import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import {
  createZcashMeChallenge,
  enforceSocialProofRateLimit,
  SocialProofError,
} from "@/lib/social-proof";
import {
  createZcashMeAuthorization,
  encodeZcashMeOidcAttempt,
  ZCASHME_OIDC_COOKIE,
} from "@/lib/zcashme-oidc";

export const dynamic = "force-dynamic";

const clientIp = (request: NextRequest) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    forwardedFor?.split(",")[0]?.trim() ||
    null
  );
};

export async function POST(request: NextRequest) {
  try {
    const session = await resolveAppSession(request.headers);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await enforceSocialProofRateLimit({
      action: "challenge",
      userId,
      ipAddress: clientIp(request),
    });

    const challenge = await createZcashMeChallenge(userId);
    const { attempt, authorizationUrl } = createZcashMeAuthorization(userId, challenge.challenge);
    const response = NextResponse.json({ ...challenge, authorizationUrl });
    response.cookies.set(ZCASHME_OIDC_COOKIE, encodeZcashMeOidcAttempt(attempt), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/social-proof/zcashme/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (err) {
    if (err instanceof SocialProofError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to create ZcashMe proof challenge", err);
    return NextResponse.json({ error: "Failed to create proof challenge" }, { status: 500 });
  }
}
