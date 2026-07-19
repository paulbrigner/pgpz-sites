import { NextRequest, NextResponse } from "next/server";
import {
  SOCIAL_PROOF_AUTOVERIFY_SECRET,
  SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS,
} from "@/lib/config";
import {
  isAutoverifySecretAuthorized,
  resolveAutoverifySecrets,
} from "@/lib/autoverify-secret";
import { autoVerifyPendingXProofs } from "@/lib/social-proof";

export const dynamic = "force-dynamic";

const bearerToken = (value: string | null) => {
  const match = /^Bearer\s+(.+)$/i.exec(value || "");
  return match?.[1]?.trim() || null;
};

const configuredSecrets = () => resolveAutoverifySecrets({
  currentSecret: SOCIAL_PROOF_AUTOVERIFY_SECRET,
  previousSecret: SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS,
  nodeEnv: process.env.NODE_ENV,
});

const authorized = (
  request: NextRequest,
  secrets: ReturnType<typeof configuredSecrets>,
) => {
  const supplied =
    bearerToken(request.headers.get("authorization")) ||
    request.headers.get("x-pgpz-autoverify-secret")?.trim() ||
    "";
  return isAutoverifySecretAuthorized({
    suppliedSecret: supplied,
    currentSecret: secrets.current,
    previousSecret: secrets.previous,
  });
};

export async function POST(request: NextRequest) {
  const secrets = configuredSecrets();
  if (!secrets.current) {
    return NextResponse.json({ error: "Auto-verification is not configured" }, { status: 503 });
  }
  if (!authorized(request, secrets)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const batchSize = Number.isFinite(Number(body?.batchSize)) ? Number(body.batchSize) : undefined;
    const groupSize = Number.isFinite(Number(body?.groupSize)) ? Number(body.groupSize) : undefined;
    const result = await autoVerifyPendingXProofs({ batchSize, groupSize });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Background X proof auto-verification failed", err);
    return NextResponse.json({ error: "Background X proof auto-verification failed" }, { status: 500 });
  }
}
