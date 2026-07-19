import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import {
  AWS_REGION,
  EMAIL_FROM,
  EMAIL_SERVER,
  EMAIL_SERVER_HOST,
  EMAIL_SERVER_PASSWORD,
  EMAIL_SERVER_PORT,
  EMAIL_SERVER_SECURE,
  EMAIL_SERVER_USER,
  EMAIL_TRANSPORT,
} from "@/lib/config";
import { awsRuntimeClientConfig } from "@/lib/aws-runtime";

export type EmailTransportMode = "ses" | "smtp";

export function resolveEmailTransportMode({
  configuredTransport,
  nodeEnv,
}: {
  configuredTransport?: string | null;
  nodeEnv?: string | null;
}): EmailTransportMode {
  const configured = configuredTransport?.trim().toLowerCase();
  if (configured && configured !== "ses" && configured !== "smtp") {
    throw new Error("EMAIL_TRANSPORT must be either ses or smtp");
  }
  if (nodeEnv === "production") {
    if (configured !== "ses") {
      throw new Error("EMAIL_TRANSPORT=ses is required in production");
    }
    return "ses";
  }
  if (configured === "ses") return "ses";
  return "smtp";
}

function buildSmtpServerConfig() {
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

  return null;
}

export function buildSesServerConfig(region: string) {
  return {
    SES: {
      sesClient: new SESv2Client(awsRuntimeClientConfig(region)),
      SendEmailCommand,
    },
  } as any;
}

export const buildEmailServerConfig = () => {
  const mode = resolveEmailTransportMode({
    configuredTransport: EMAIL_TRANSPORT,
    nodeEnv: process.env.NODE_ENV,
  });
  if (mode === "ses") return buildSesServerConfig(AWS_REGION);
  return buildSmtpServerConfig();
};

export const emailProviderReady = () => !!buildEmailServerConfig() && !!EMAIL_FROM;

export const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ");
