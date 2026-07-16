import "server-only";

import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { findAppUserByEmail, normalizeEmail } from "@/lib/app-users";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal-config";
import { SITE_URL } from "@/lib/config";

const signupProfileKey = (email: string, signupProfileId: string) => ({
  pk: `SIGNUP_PROFILE#${email}`,
  sk: `SIGNUP_PROFILE#${signupProfileId}`,
});

export function signupProfileIdFromMagicLink(url: string) {
  try {
    const magicUrl = new URL(url);
    const directId = magicUrl.searchParams.get("signupProfileId")?.trim();
    if (directId) return directId;

    const callbackUrl =
      magicUrl.searchParams.get("callbackUrl") ||
      magicUrl.searchParams.get("callbackURL");
    if (!callbackUrl) return "";

    const parsedCallback = new URL(callbackUrl, SITE_URL);
    return parsedCallback.searchParams.get("signupProfileId")?.trim() || "";
  } catch {
    return "";
  }
}

export async function assertLegalAcceptanceForAccountEmail(identifier: string, url: string) {
  const email = normalizeEmail(identifier);
  const existingUser = await findAppUserByEmail(email);
  if (existingUser?.accountStatus === "deactivated" || existingUser?.deactivatedAt) {
    throw new Error("This account is deactivated. Contact admin@pgpz.org for help.");
  }
  if (existingUser?.id) return;

  const signupProfileId = signupProfileIdFromMagicLink(url);
  if (!signupProfileId) {
    throw new Error(
      "Create an account from the sign-up page and accept the Terms of Service, Privacy Policy, and Community Guidelines before requesting an email link.",
    );
  }

  const pending = await documentClient.get({
    TableName: TABLE_NAME,
    Key: signupProfileKey(email, signupProfileId),
  });
  const item = pending.Item as any;
  const expires =
    typeof item?.expires === "number"
      ? item.expires
      : typeof item?.expiresAt === "number"
        ? item.expiresAt
        : 0;

  if (!item || item.type !== "SIGNUP_PROFILE") {
    throw new Error(
      "Create an account from the sign-up page and accept the Terms of Service, Privacy Policy, and Community Guidelines before requesting an email link.",
    );
  }

  if (expires && expires < Math.floor(Date.now() / 1000)) {
    await documentClient.delete({
      TableName: TABLE_NAME,
      Key: signupProfileKey(email, signupProfileId),
    });
    throw new Error("Your sign-up session expired. Please start again.");
  }

  if (
    typeof item.legalAcceptedAt !== "string" ||
    item.legalDocumentVersion !== LEGAL_DOCUMENT_VERSION
  ) {
    throw new Error(
      "Please accept the current Terms of Service, Privacy Policy, and Community Guidelines before creating an account.",
    );
  }
}
