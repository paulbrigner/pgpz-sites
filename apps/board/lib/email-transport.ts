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

export function buildBoardSmtpTransport(input: {
  host: string;
  port?: string;
  secure?: string;
  user?: string;
  password?: string;
  server?: string;
}) {
  if (input.host) {
    const secure = input.secure === "true";
    const loopback = input.host === "localhost" || input.host === "127.0.0.1" || input.host === "::1";
    return {
      host: input.host,
      port: input.port ? Number(input.port) : 1025,
      secure,
      ...(loopback && !secure ? { ignoreTLS: true } : {}),
      auth:
        input.user && input.password
          ? { user: input.user, pass: input.password }
          : undefined,
    };
  }
  return input.server?.includes("://") ? input.server : null;
}

function buildSmtpTransport() {
  return buildBoardSmtpTransport({
    host: EMAIL_SERVER_HOST,
    port: EMAIL_SERVER_PORT,
    secure: EMAIL_SERVER_SECURE,
    user: EMAIL_SERVER_USER,
    password: EMAIL_SERVER_PASSWORD,
    server: EMAIL_SERVER,
  });
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
