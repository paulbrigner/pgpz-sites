import EmailProvider from "next-auth/providers/email";
import { DynamoDBAdapter } from "@next-auth/dynamodb-adapter";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types are not installed in this app.
import nodemailer from "nodemailer";
import {
  NEXTAUTH_SECRET,
  NEXTAUTH_URL,
  EMAIL_SERVER,
  EMAIL_FROM,
  EMAIL_SERVER_HOST,
  EMAIL_SERVER_PORT,
  EMAIL_SERVER_USER,
  EMAIL_SERVER_PASSWORD,
  EMAIL_SERVER_SECURE,
} from "@/lib/config";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { recordEmailEvent } from "@/lib/admin/email-log";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal-config";

if (!process.env.NEXTAUTH_URL && NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = NEXTAUTH_URL;
}

const emailServerConfig = (() => {
  if (EMAIL_SERVER_HOST) {
    return {
      host: EMAIL_SERVER_HOST,
      port: EMAIL_SERVER_PORT ? Number(EMAIL_SERVER_PORT) : 587,
      secure: EMAIL_SERVER_SECURE === "true",
      auth:
        EMAIL_SERVER_USER && EMAIL_SERVER_PASSWORD
          ? { user: EMAIL_SERVER_USER, pass: EMAIL_SERVER_PASSWORD }
          : undefined,
    } as any;
  }

  if (EMAIL_SERVER && EMAIL_SERVER.includes("://")) return EMAIL_SERVER as any;

  if (EMAIL_SERVER) {
    return {
      host: EMAIL_SERVER,
      port: EMAIL_SERVER_PORT ? Number(EMAIL_SERVER_PORT) : 587,
      secure: EMAIL_SERVER_SECURE === "true",
      auth:
        EMAIL_SERVER_USER && EMAIL_SERVER_PASSWORD
          ? { user: EMAIL_SERVER_USER, pass: EMAIL_SERVER_PASSWORD }
          : undefined,
    } as any;
  }

  return undefined as any;
})();

const magicLinkText = ({ url, host }: { url: string; host: string }) =>
  `Sign in to ${host}\n${url}\n\n`;

const magicLinkHtml = ({
  url,
  host,
  theme,
}: {
  url: string;
  host: string;
  theme: Record<string, string | undefined>;
}) => {
  const escapedHost = host.replace(/\./g, "&#8203;.");
  const brandColor = theme.brandColor || "#F5A800";
  const buttonText = theme.buttonText || "#1f1f22";

  return `
<body style="background: #fff8e7;">
  <table width="100%" border="0" cellspacing="20" cellpadding="0"
    style="background: #fffdf7; max-width: 600px; margin: auto; border-radius: 8px; border: 1px solid #ffd88a;">
    <tr>
      <td align="center"
        style="padding: 20px 0 10px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: #1f1f22;">
        Sign in to <strong>${escapedHost}</strong>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="border-radius: 5px;" bgcolor="${brandColor}"><a href="${url}"
                target="_blank"
                style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonText}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${brandColor}; display: inline-block; font-weight: bold;">Sign in</a></td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center"
        style="padding: 0 20px 20px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: #3d4658;">
        If you did not request this email, you can safely ignore it.
      </td>
    </tr>
  </table>
</body>
	`;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

async function userExistsByEmail(email: string) {
  const res = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk = :sk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK", "#gsi1sk": "GSI1SK" },
    ExpressionAttributeValues: { ":pk": `USER#${email}`, ":sk": `USER#${email}` },
    Limit: 1,
  });
  return !!res.Items?.[0]?.id;
}

const signupProfileKey = (email: string, signupProfileId: string) => ({
  pk: `SIGNUP_PROFILE#${email}`,
  sk: `SIGNUP_PROFILE#${signupProfileId}`,
});

function signupProfileIdFromMagicLink(url: string) {
  try {
    const magicUrl = new URL(url);
    const directId = magicUrl.searchParams.get("signupProfileId")?.trim();
    if (directId) return directId;

    const callbackUrl = magicUrl.searchParams.get("callbackUrl");
    if (!callbackUrl) return "";

    const parsedCallback = new URL(
      callbackUrl,
      NEXTAUTH_URL || "https://community.pgpz.org"
    );
    return parsedCallback.searchParams.get("signupProfileId")?.trim() || "";
  } catch {
    return "";
  }
}

async function assertLegalAcceptanceForAccountEmail(identifier: string, url: string) {
  const email = normalizeEmail(identifier);
  if (await userExistsByEmail(email)) return;

  const signupProfileId = signupProfileIdFromMagicLink(url);
  if (!signupProfileId) {
    throw new Error(
      "Create an account from the sign-up page and accept the Terms of Service, Privacy Policy, and Community Guidelines before requesting an email link."
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
      "Create an account from the sign-up page and accept the Terms of Service, Privacy Policy, and Community Guidelines before requesting an email link."
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
      "Please accept the current Terms of Service, Privacy Policy, and Community Guidelines before creating an account."
    );
  }
}

const sendMagicLink = async ({ identifier, url, provider, theme }: any) => {
  const { host } = new URL(url);
  const subject = `Sign in to ${host}`;
  await assertLegalAcceptanceForAccountEmail(identifier, url);
  const transporter = nodemailer.createTransport(provider.server);
  let failureLogged = false;

  try {
    const result = await transporter.sendMail({
      to: identifier,
      from: provider.from,
      subject,
      text: magicLinkText({ url, host }),
      html: magicLinkHtml({ url, host, theme: theme || {} }),
    });

    const rejected = (result.rejected || []).filter(Boolean).map(String);
    const pending = (result.pending || []).filter(Boolean).map(String);
    const failed = rejected.concat(pending);

    if (failed.length) {
      const error = `Email (${failed.join(", ")}) could not be sent`;
      try {
        await recordEmailEvent({
          email: identifier,
          type: "magic-link",
          subject,
          status: "failed",
          providerMessageId: result?.messageId ? String(result.messageId) : null,
          error,
          metadata: { host, rejected, pending },
        });
        failureLogged = true;
      } catch (logErr) {
        console.error("Magic-link email failure logging failed:", logErr);
      }
      throw new Error(error);
    }

    try {
      await recordEmailEvent({
        email: identifier,
        type: "magic-link",
        subject,
        status: "sent",
        providerMessageId: result?.messageId ? String(result.messageId) : null,
        metadata: { host },
      });
    } catch (logErr) {
      console.error("Magic-link email sent logging failed:", logErr);
    }

    console.info("Magic-link email accepted by SMTP provider", {
      email: identifier,
      providerMessageId: result?.messageId ? String(result.messageId) : null,
      host,
    });
  } catch (err: any) {
    if (!failureLogged) {
      try {
        await recordEmailEvent({
          email: identifier,
          type: "magic-link",
          subject,
          status: "failed",
          error: typeof err?.message === "string" ? err.message : "Failed to send magic-link email",
          metadata: { host },
        });
      } catch (logErr) {
        console.error("Magic-link email exception logging failed:", logErr);
      }
    }
    throw err;
  }
};

export const authOptions = {
  adapter: DynamoDBAdapter(documentClient as any, {
    tableName: TABLE_NAME,
  }),
  session: { strategy: "jwt" as const },
  providers: [
    EmailProvider({
      server: emailServerConfig,
      from: EMAIL_FROM,
      sendVerificationRequest: sendMagicLink,
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user?.email) token.email = user.email;

      try {
        if (token?.sub) {
          const adapter: any = DynamoDBAdapter(documentClient as any, {
            tableName: TABLE_NAME,
          });
          const userRecord = await adapter.getUser(token.sub);
          if (userRecord) {
            (token as any).isAdmin = !!(userRecord as any).isAdmin;
            (token as any).membershipStatus = (userRecord as any).membershipStatus ?? "none";
            (token as any).membershipProvider = (userRecord as any).membershipProvider ?? null;
            (token as any).membershipVerifiedAt = (userRecord as any).membershipVerifiedAt ?? null;
            (token as any).membershipProofPostUrl = (userRecord as any).membershipProofPostUrl ?? null;
            (token as any).membershipProofPostId = (userRecord as any).membershipProofPostId ?? null;
            (token as any).proofRetentionPolicy = (userRecord as any).proofRetentionPolicy ?? null;
            (token as any).manualApprovalStatus = (userRecord as any).manualApprovalStatus ?? "none";
            (token as any).manualApprovalRequestedAt = (userRecord as any).manualApprovalRequestedAt ?? null;
            (token as any).manualApprovalApprovedAt = (userRecord as any).manualApprovalApprovedAt ?? null;
          }
        }
      } catch (err) {
        console.error("jwt callback: failed to refresh user membership fields", err);
      }

      if (typeof (token as any).isAdmin !== "boolean") {
        (token as any).isAdmin = false;
      }
      if (!(token as any).membershipStatus) {
        (token as any).membershipStatus = "none";
      }

      return token;
    },
    async session({ session, token }: any) {
      session.user = session.user || ({} as any);
      (session.user as any).email = token.email || null;
      (session.user as any).id = token?.sub ?? null;

      try {
        if (token?.sub) {
          const adapter: any = DynamoDBAdapter(documentClient as any, {
            tableName: TABLE_NAME,
          });
          const userRecord = await adapter.getUser(token.sub);
          (session.user as any).firstName = (userRecord as any)?.firstName ?? null;
          (session.user as any).lastName = (userRecord as any)?.lastName ?? null;
          (session.user as any).xHandle = (userRecord as any)?.xHandle ?? null;
          (session.user as any).linkedinUrl = (userRecord as any)?.linkedinUrl ?? null;
          (session.user as any).isAdmin =
            typeof (userRecord as any)?.isAdmin === "boolean"
              ? !!(userRecord as any).isAdmin
              : !!(token as any)?.isAdmin;
          (session.user as any).welcomeEmailSentAt = (userRecord as any)?.welcomeEmailSentAt ?? null;
          (session.user as any).lastEmailSentAt = (userRecord as any)?.lastEmailSentAt ?? null;
          (session.user as any).lastEmailType = (userRecord as any)?.lastEmailType ?? null;
          (session.user as any).emailBounceReason = (userRecord as any)?.emailBounceReason ?? null;
          (session.user as any).emailSuppressed =
            typeof (userRecord as any)?.emailSuppressed === "boolean"
              ? !!(userRecord as any).emailSuppressed
              : null;
          (session.user as any).membershipStatus = (userRecord as any)?.membershipStatus ?? "none";
          (session.user as any).membershipProvider = (userRecord as any)?.membershipProvider ?? null;
          (session.user as any).membershipVerifiedAt = (userRecord as any)?.membershipVerifiedAt ?? null;
          (session.user as any).membershipProofPostUrl = (userRecord as any)?.membershipProofPostUrl ?? null;
          (session.user as any).membershipProofPostId = (userRecord as any)?.membershipProofPostId ?? null;
          (session.user as any).proofRetentionPolicy = (userRecord as any)?.proofRetentionPolicy ?? null;
          (session.user as any).manualApprovalStatus = (userRecord as any)?.manualApprovalStatus ?? "none";
          (session.user as any).manualApprovalRequestedAt = (userRecord as any)?.manualApprovalRequestedAt ?? null;
          (session.user as any).manualApprovalApprovedAt = (userRecord as any)?.manualApprovalApprovedAt ?? null;

          if (!(session.user as any).name && (userRecord as any)?.firstName) {
            const first = (userRecord as any).firstName as string;
            const last = ((userRecord as any)?.lastName as string | undefined) || "";
            (session.user as any).name = `${first}${last ? ` ${last}` : ""}`;
          }
        } else {
          (session.user as any).isAdmin = !!(token as any)?.isAdmin;
          (session.user as any).membershipStatus = (token as any)?.membershipStatus ?? "none";
          (session.user as any).membershipProvider = (token as any)?.membershipProvider ?? null;
          (session.user as any).membershipVerifiedAt = (token as any)?.membershipVerifiedAt ?? null;
          (session.user as any).membershipProofPostUrl = (token as any)?.membershipProofPostUrl ?? null;
          (session.user as any).membershipProofPostId = (token as any)?.membershipProofPostId ?? null;
          (session.user as any).proofRetentionPolicy = (token as any)?.proofRetentionPolicy ?? null;
          (session.user as any).manualApprovalStatus = (token as any)?.manualApprovalStatus ?? "none";
          (session.user as any).manualApprovalRequestedAt = (token as any)?.manualApprovalRequestedAt ?? null;
          (session.user as any).manualApprovalApprovedAt = (token as any)?.manualApprovalApprovedAt ?? null;
        }
      } catch (err) {
        console.error("session callback: failed to load user profile", err);
        (session.user as any).isAdmin = !!(token as any)?.isAdmin;
        (session.user as any).membershipStatus = (token as any)?.membershipStatus ?? "none";
        (session.user as any).membershipProvider = (token as any)?.membershipProvider ?? null;
        (session.user as any).membershipVerifiedAt = (token as any)?.membershipVerifiedAt ?? null;
        (session.user as any).membershipProofPostUrl = (token as any)?.membershipProofPostUrl ?? null;
        (session.user as any).membershipProofPostId = (token as any)?.membershipProofPostId ?? null;
        (session.user as any).proofRetentionPolicy = (token as any)?.proofRetentionPolicy ?? null;
        (session.user as any).manualApprovalStatus = (token as any)?.manualApprovalStatus ?? "none";
        (session.user as any).manualApprovalRequestedAt = (token as any)?.manualApprovalRequestedAt ?? null;
        (session.user as any).manualApprovalApprovedAt = (token as any)?.manualApprovalApprovedAt ?? null;
      }

      return session;
    },
  },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  secret: NEXTAUTH_SECRET,
} as const;
