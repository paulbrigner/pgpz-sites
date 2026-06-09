import EmailProvider from "next-auth/providers/email";
import { DynamoDBAdapter } from "@next-auth/dynamodb-adapter";
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

export const authOptions = {
  adapter: DynamoDBAdapter(documentClient as any, {
    tableName: TABLE_NAME,
  }),
  session: { strategy: "jwt" as const },
  providers: [
    EmailProvider({
      server: emailServerConfig,
      from: EMAIL_FROM,
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
