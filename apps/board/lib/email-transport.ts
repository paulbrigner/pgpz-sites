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

export type BoardEmailTransportMode = "ses" | "smtp";

export function resolveBoardEmailTransportMode(input: {
  configuredTransport?: string | null;
  nodeEnv?: string | null;
}): BoardEmailTransportMode {
  const configured = input.configuredTransport?.trim().toLowerCase();
  if (configured && configured !== "ses" && configured !== "smtp") {
    throw new Error("EMAIL_TRANSPORT must be either ses or smtp");
  }
  if (input.nodeEnv === "production") {
    if (configured !== "ses") throw new Error("EMAIL_TRANSPORT=ses is required in production");
    return "ses";
  }
  return configured === "ses" ? "ses" : "smtp";
}

export function buildBoardSesTransport(region: string) {
  return {
    SES: {
      sesClient: new SESv2Client({ region }),
      SendEmailCommand,
    },
  };
}

function buildSmtpTransport() {
  if (EMAIL_SERVER_HOST) {
    return {
      host: EMAIL_SERVER_HOST,
      port: EMAIL_SERVER_PORT ? Number(EMAIL_SERVER_PORT) : 1025,
      secure: EMAIL_SERVER_SECURE === "true",
      auth:
        EMAIL_SERVER_USER && EMAIL_SERVER_PASSWORD
          ? { user: EMAIL_SERVER_USER, pass: EMAIL_SERVER_PASSWORD }
          : undefined,
    };
  }
  return EMAIL_SERVER.includes("://") ? EMAIL_SERVER : null;
}

export function buildBoardEmailTransport() {
  const mode = resolveBoardEmailTransportMode({
    configuredTransport: EMAIL_TRANSPORT,
    nodeEnv: process.env.NODE_ENV,
  });
  return mode === "ses" ? buildBoardSesTransport(AWS_REGION) : buildSmtpTransport();
}

export function assertBoardEmailReady() {
  const transport = buildBoardEmailTransport();
  if (!transport || !EMAIL_FROM) throw new Error("Board email delivery is not configured");
  return { transport, from: EMAIL_FROM };
}
